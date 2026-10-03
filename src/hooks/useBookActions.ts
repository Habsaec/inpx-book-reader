import React from 'react';
import { Book, Bookmark, Highlight, ReadingProgress, ServerConfig, Shelf } from '../types';
import { debugSessionLog } from '../lib/debugSessionLog';
import { extFromStoragePath, removeBookFromDirectory } from '../lib/bookStorage';
import { resolveLocalBookFileDetailed, clearLocalFileMeta } from '../lib/localBookAccess';
import { writeStoredStorageDirectory } from '../lib/storageDirectory';
import { removeCoverFromDirectory } from '../lib/coverCache';
import {
  clearOfflineReadingHistory,
  restoreOfflineReadingHistoryVisibility,
  clearOfflineReadMark,
  deleteOfflineReaderAnnotation,
  deleteOfflineReaderBookmark,
  updateOfflineReaderBookmarkTitle,
  listLocalReaderAnnotations,
  listLocalReaderBookmarks,
  readOfflineReaderData,
  migrateOfflineReaderPositionForFormat,
  hasOfflineReadingProgress,
  primeReaderLocalStorage,
  flushOfflineReaderStore,
  hydrateOfflineReaderStore,
  restoreOfflineReaderAnnotation,
  restoreOfflineReaderBookmark,
  updateOfflineReaderAnnotation,
  writeOfflineReaderData,
  type OfflineReaderAnnotation,
  type OfflineReaderBookmark,
} from '../lib/offlineReaderStore';
import { useDialog } from '../ui/Dialog';
import { finalizeReadingPositionSync, syncOfflineReaderForBook } from '../lib/offlineSync';
import { runBookOpenOnlineSync } from '../lib/bookOpenSync';
import { notifyBookOpenSyncDone } from '../lib/bookOpenSyncNotify';
import {
  applyServerActivitySyncMeta,
  buildSyncActivityOptions,
  readReaderActivitySync,
  touchReadingHistoryLocalRev,
  touchReadBooksLocalRev,
} from '../lib/readerActivitySync';
import {
  buildLocalRecentReading,
  localReaderProgressByBookId,
  upsertProgressFromLocalReader,
} from '../lib/localReadingProgress';
import { fetchReaderActivitySyncMeta, isAuthError, isUnreachableServerError, recordReadingHistory, ensureBookReadState } from '../lib/inpxClient';
import { downloadQueue } from '../lib/downloadQueue';
import { enqueueSyncOp } from '../lib/localDb';
import { dropQueuedFavoriteOps, dropQueuedShelfOps, readPersistedShelfIdMap } from '../lib/syncQueueProcessor';
import { dropQueuedRemoveHistoryOps, dropQueuedToggleReadOps } from '../lib/syncQueueProcessor';
import type { StorageDirectory } from '../lib/storageDirectory';
import { isStoragePermissionError, STORAGE_PERMISSION_REVOKED_MSG } from '../lib/storageDirectory';
import { isLocalOnlyBookId } from '../lib/importExternalBook';
import { useSnackbar } from '../ui/Snackbar';
import type { useInpxServer } from './useInpxServer';

type InpxServer = ReturnType<typeof useInpxServer>;

export function useBookActions(opts: {
  downloadedBooks: Book[];
  setDownloadedBooks: React.Dispatch<React.SetStateAction<Book[]>>;
  progressList: ReadingProgress[];
  setProgressList: React.Dispatch<React.SetStateAction<ReadingProgress[]>>;
  setBookmarks: React.Dispatch<React.SetStateAction<Bookmark[]>>;
  setHighlights: React.Dispatch<React.SetStateAction<Highlight[]>>;
  setShelves: React.Dispatch<React.SetStateAction<Shelf[]>>;
  setFavoriteAuthors: React.Dispatch<React.SetStateAction<string[]>>;
  setFavoriteSeries: React.Dispatch<React.SetStateAction<string[]>>;
  storageDirectory: StorageDirectory | null;
  onStorageDirectoryResolved?: (directory: StorageDirectory) => void;
  serverConfig: ServerConfig;
  canReadOnline: boolean;
  isOnline: boolean;
  inpxServer: InpxServer;
  profile: InpxServer['profile'];
  onAuthExpired?: () => void;
  onConnectionLost?: () => void;
}) {
  const dialog = useDialog();
  const snackbar = useSnackbar();
  const [removingBookIds, setRemovingBookIds] = React.useState<Set<string>>(() => new Set());
  const openSyncGenRef = React.useRef(0);
  const finalizingBookIdsRef = React.useRef(new Set<string>());

  const {
    downloadedBooks,
    setDownloadedBooks,
    progressList,
    setProgressList,
    setBookmarks,
    setHighlights,
    setShelves,
    setFavoriteAuthors,
    setFavoriteSeries,
    storageDirectory,
    onStorageDirectoryResolved,
    serverConfig,
    canReadOnline,
    isOnline,
    inpxServer,
    profile,
    onAuthExpired,
    onConnectionLost,
  } = opts;
  const onAuthExpiredRef = React.useRef(onAuthExpired);
  onAuthExpiredRef.current = onAuthExpired;
  const onConnectionLostRef = React.useRef(onConnectionLost);
  onConnectionLostRef.current = onConnectionLost;

  const [activeReader, setActiveReader] = React.useState<{
    bookId: string;
    title: string;
    ext: string;
    initialPosition?: string | null;
    localFile: { storageUri: string; localFileName: string };
  } | null>(null);
  const activeReaderRef = React.useRef(activeReader);
  activeReaderRef.current = activeReader;
  const closeInFlightRef = React.useRef<Promise<{ bookId: string; progress: number } | null> | null>(null);
  const pendingOpenRef = React.useRef<{ bookId: string; position: string } | null>(null);

  const [downloadPromptBook, setDownloadPromptBook] = React.useState<Book | null>(null);
  const [downloadPromptError, setDownloadPromptError] = React.useState<string | null>(null);
  const [readerLocalVersion, setReaderLocalVersion] = React.useState(0);

  const bumpReaderLocal = React.useCallback(() => {
    setReaderLocalVersion((v) => v + 1);
  }, []);

  const downloadedBookIdsWithFile = React.useMemo(
    () => downloadedBooks.filter((b) => Boolean(b.localFileName?.trim())).map((b) => b.id),
    [downloadedBooks],
  );

  const downloadedBooksWithFile = React.useMemo(
    () => downloadedBooks.filter((b) => Boolean(b.localFileName?.trim())),
    [downloadedBooks],
  );

  const registerDownloadedBook = React.useCallback(
    (book: Book) => {
      setDownloadedBooks((prev) => {
        const i = prev.findIndex((b) => b.id === book.id);
        if (i < 0) return [...prev, book];
        const cur = prev[i];
        const next = {
          ...cur,
          ...book,
          localFileName: book.localFileName || cur.localFileName,
          storageUri: book.storageUri || cur.storageUri,
        };
        if (
          next.localFileName === cur.localFileName
          && next.storageUri === cur.storageUri
          && next.title === cur.title
          && next.author === cur.author
          && next.ext === cur.ext
        ) {
          return prev;
        }
        const copy = prev.slice();
        copy[i] = next;
        return copy;
      });
    },
    [setDownloadedBooks],
  );

  const enrichBookMeta = React.useCallback(
    (book: Book): Book => {
      const dl = downloadedBooks.find((b) => b.id === book.id);
      if (dl) {
        return {
          ...book,
          title: book.title || dl.title,
          author: book.author || dl.author,
          ext: (
            book.ext
            || dl.ext
            || extFromStoragePath(book.localFileName || dl.localFileName || '')
            || 'fb2'
          ).replace(/^\./, ''),
          // Prefer paths from the caller (e.g. just-persisted download record) —
          // React state may still hold a stale entry without localFileName.
          localFileName: book.localFileName?.trim() ? book.localFileName : dl.localFileName,
          storageUri: book.storageUri?.trim() ? book.storageUri : dl.storageUri,
          chaptersPath: book.chaptersPath?.trim() ? book.chaptersPath : dl.chaptersPath,
          series: book.series ?? dl.series,
          seriesNo: book.seriesNo ?? dl.seriesNo,
          readProgress: book.readProgress ?? dl.readProgress,
        };
      }
      if (isOnline && profile) {
        const recent = profile.recentBooks.find((b) => b.id === book.id);
        if (recent?.ext) {
          return { ...book, ext: recent.ext.replace(/^\./, '') };
        }
      }
      return book;
    },
    [downloadedBooks, isOnline, profile],
  );

  const promptDownloadBook = React.useCallback(
    (book: Book) => {
      setDownloadPromptError(null);
      setDownloadPromptBook(enrichBookMeta(book));
    },
    [enrichBookMeta],
  );

  const openBookDetails = promptDownloadBook;

  const syncBookReaderData = React.useCallback(
    async (bookId: string, options?: { includePosition?: boolean; neverPushPosition?: boolean }) => {
      if (!canReadOnline) return;
      try {
        const activityState = readReaderActivitySync();
        const activityMeta = await fetchReaderActivitySyncMeta(serverConfig);
        if (activityMeta) applyServerActivitySyncMeta(activityMeta);
        const localBefore = readOfflineReaderData(bookId);
        const activityOpts = buildSyncActivityOptions(
          activityState,
          activityMeta,
          localBefore.positionChangedAt || localBefore.updatedAt,
        );
        await syncOfflineReaderForBook(
          serverConfig,
          bookId,
          activityOpts,
          options?.includePosition
            ? { neverPushPosition: options.neverPushPosition }
            : { skipPosition: true },
        );
      } catch (e) {
        if (isAuthError(e)) throw e;
        /* открыть с локальными данными */
      }
    },
    [canReadOnline, serverConfig],
  );

  const tryResolveAndOpen = React.useCallback(
    async (book: Book, initialPosition?: string | null) => {
      const resolved = enrichBookMeta(book);
      if (finalizingBookIdsRef.current.has(resolved.id)) {
        snackbar.show('Сохраняем позицию… Подождите секунду.');
        return;
      }
      const openGen = ++openSyncGenRef.current;
      if (!resolved.localFileName?.trim()) {
        debugSessionLog('H1', 'App:handleOpenBook', 'no local file meta', { bookId: resolved.id });
        if (initialPosition?.trim()) {
          pendingOpenRef.current = { bookId: resolved.id, position: initialPosition.trim() };
          snackbar.show('Скачайте книгу — откроем это место после загрузки');
        }
        promptDownloadBook(resolved);
        return;
      }
      let loc;
      try {
        const detailed = await resolveLocalBookFileDetailed(resolved, storageDirectory);
        if (detailed.status === 'unknown') {
          snackbar.show('Не удалось проверить файл. Откройте книгу ещё раз.', undefined, 'error');
          return;
        }
        loc = detailed.status === 'found' ? detailed.resolved : null;
      } catch (err) {
        if (isStoragePermissionError(err)) {
          snackbar.show(STORAGE_PERMISSION_REVOKED_MSG, undefined, 'error');
          return;
        }
        console.warn('[useBookActions] resolveLocalBookFile failed:', err);
        snackbar.show('Не удалось открыть книгу — проверьте папку хранения.', undefined, 'error');
        return;
      }
      if (openSyncGenRef.current !== openGen) return;
      if (!loc) {
        debugSessionLog('H1', 'App:handleOpenBook', 'file missing on disk', {
          bookId: resolved.id,
          localFileName: resolved.localFileName,
          storageUri: storageDirectory?.uri,
        });
        setDownloadedBooks((prev) =>
          prev.map((b) => (b.id === resolved.id ? clearLocalFileMeta(b) : b)),
        );
        downloadQueue.remove(resolved.id);
        if (canReadOnline) {
          snackbar.show(
            'Локальный файл недоступен — скачайте книгу заново.',
            { label: 'Скачать', onClick: () => promptDownloadBook(resolved) },
            'error',
          );
        } else {
          snackbar.show(
            'Файл книги не найден на устройстве. Проверьте папку хранения в профиле или скачайте заново.',
            undefined,
            'error',
          );
        }
        return;
      }
      if (
        loc.directory.uri.startsWith('content://')
        || !storageDirectory?.uri?.startsWith('content://')
      ) {
        writeStoredStorageDirectory(loc.directory);
        onStorageDirectoryResolved?.(loc.directory);
      }
      debugSessionLog('H1', 'App:handleOpenBook', 'opening', {
        bookId: resolved.id,
        localFile: loc.localFileName,
        storageUri: loc.storageUri,
      });
      try {
        await hydrateOfflineReaderStore();
        await flushOfflineReaderStore();
      } catch {
        /* открыть с локальными данными */
      }
      if (openSyncGenRef.current !== openGen) return;
      const resolvedExt = (resolved.ext || extFromStoragePath(loc.localFileName) || 'fb2').replace(/^\./, '');
      migrateOfflineReaderPositionForFormat(resolved.id, resolvedExt);
      const pendingForBook =
        pendingOpenRef.current?.bookId === resolved.id ? pendingOpenRef.current.position : null;
      const explicitPos = initialPosition?.trim() || pendingForBook || null;
      if (explicitPos && pendingOpenRef.current?.bookId === resolved.id) {
        pendingOpenRef.current = null;
      }
      if (readOfflineReaderData(resolved.id).recentHiddenAt) {
        restoreOfflineReadingHistoryVisibility(resolved.id);
        void dropQueuedRemoveHistoryOps(resolved.id).catch(() => {});
      }
      // Explicit bookmark/?pos= open must not resurrect a deferred cross-device prompt.
      if (explicitPos) {
        const cur = readOfflineReaderData(resolved.id);
        if (cur.pendingCrossDevicePrompt) {
          writeOfflineReaderData(resolved.id, { ...cur, pendingCrossDevicePrompt: false });
        }
      }
      const openedBook: Book = {
        ...resolved,
        ext: resolvedExt,
        localFileName: loc.localFileName,
        storageUri: loc.storageUri,
      };
      registerDownloadedBook(openedBook);
      setProgressList((prev) => upsertProgressFromLocalReader(prev, openedBook));
      primeReaderLocalStorage(resolved.id);
      if (openSyncGenRef.current !== openGen) return;
      // Open immediately from local file — never wait on network sync.
      setActiveReader({
        bookId: resolved.id,
        title: resolved.title,
        ext: resolvedExt,
        initialPosition: explicitPos,
        localFile: { storageUri: loc.storageUri, localFileName: loc.localFileName },
      });
      if (canReadOnline && !isLocalOnlyBookId(resolved.id)) {
        const openedBookId = resolved.id;
        void (async () => {
          let syncFailed = false;
          try {
            const result = await runBookOpenOnlineSync(
              canReadOnline,
              serverConfig,
              openedBookId,
              initialPosition,
              {
                syncReaderData: (bookId) => syncBookReaderData(bookId, { includePosition: false }),
                recordReadingHistory: async (bookId) => {
                  touchReadingHistoryLocalRev();
                  await recordReadingHistory(serverConfig, bookId);
                },
                shouldContinue: () => openSyncGenRef.current === openGen,
              },
            );
            syncFailed = result.syncFailed;
            if (openSyncGenRef.current !== openGen) return;
            if (result.positionChoice) {
              debugSessionLog('P5', 'App:handleOpenBook', 'position on open (bg)', {
                bookId: openedBookId,
                positionChoice: result.positionChoice,
              });
            }
          } catch (e) {
            syncFailed = true;
            if (isAuthError(e)) onAuthExpiredRef.current?.();
            else if (isUnreachableServerError(e)) onConnectionLostRef.current?.();
          } finally {
            if (openSyncGenRef.current !== openGen) return;
            const localAfterSync = readOfflineReaderData(openedBookId);
            debugSessionLog('P5', 'App:handleOpenBook', 'synced after open', {
              bookId: openedBookId,
              fraction: localAfterSync.fraction ?? null,
              progress: localAfterSync.progress,
              fb2Href: localAfterSync.fb2Href ? String(localAfterSync.fb2Href).slice(0, 40) : null,
              syncFailed,
            });
            setProgressList((prev) =>
              upsertProgressFromLocalReader(prev, { ...resolved, id: openedBookId }),
            );
            // Always re-seed Foliate + notify even on soft syncFailed (positionChoice may be pending).
            primeReaderLocalStorage(openedBookId);
            notifyBookOpenSyncDone(openedBookId);
          }
        })();
      }
    },
    [canReadOnline, enrichBookMeta, onStorageDirectoryResolved, promptDownloadBook, registerDownloadedBook, serverConfig, setDownloadedBooks, setProgressList, snackbar, storageDirectory, syncBookReaderData],
  );

  const tryResolveAndOpenRef = React.useRef(tryResolveAndOpen);
  tryResolveAndOpenRef.current = tryResolveAndOpen;

  React.useEffect(() => {
    const pending = pendingOpenRef.current;
    if (!pending || activeReaderRef.current) return;
    const book = downloadedBooks.find((b) => b.id === pending.bookId && Boolean(b.localFileName?.trim()));
    if (!book) return;
    void tryResolveAndOpenRef.current(book, pending.position);
  }, [downloadedBooks]);

  const handleOpenBook = React.useCallback(
    async (book: Book) => {
      await tryResolveAndOpen(book, null);
    },
    [tryResolveAndOpen],
  );

  const handleOpenBookCard = React.useCallback(
    (book: Book) => {
      void handleOpenBook(enrichBookMeta(book));
    },
    [enrichBookMeta, handleOpenBook],
  );

  const handleContinueBook = React.useCallback(
    async (book: Book) => {
      await tryResolveAndOpen(book, null);
    },
    [tryResolveAndOpen],
  );

  const handleOpenBookAtPosition = React.useCallback(
    async (bookId: string, position: string, fallbackBook?: Book) => {
      const base = downloadedBooks.find((b) => b.id === bookId) ?? fallbackBook;
      if (!base) {
        if (fallbackBook) void handleOpenBookCard(fallbackBook);
        return;
      }
      await tryResolveAndOpen(enrichBookMeta(base), position);
    },
    [downloadedBooks, enrichBookMeta, handleOpenBookCard, tryResolveAndOpen],
  );

  const performRemoveBook = React.useCallback(
    async (bookId: string) => {
      setRemovingBookIds((prev) => new Set(prev).add(bookId));
      try {
        const book = downloadedBooks.find((b) => b.id === bookId);
        if (book && (book.storageUri || storageDirectory?.uri) && (book.localFileName || book.chaptersPath)) {
          const bookDirectory = {
            label: storageDirectory?.label || '',
            uri: book.storageUri || storageDirectory?.uri,
          };
          await removeBookFromDirectory(bookDirectory, book.localFileName, book.chaptersPath);
          await removeCoverFromDirectory(bookDirectory, bookId);
        }
        setDownloadedBooks((prev) => prev.filter((b) => b.id !== bookId));
        downloadQueue.remove(bookId);
      } finally {
        setRemovingBookIds((prev) => {
          const next = new Set(prev);
          next.delete(bookId);
          return next;
        });
      }
    },
    [downloadedBooks, setDownloadedBooks, storageDirectory],
  );

  const handleRemoveBook = React.useCallback(
    async (bookId: string) => {
      if (removingBookIds.has(bookId)) return;
      const book = downloadedBooks.find((b) => b.id === bookId);
      const title = book?.title ?? 'книгу';
      const ok = await dialog.confirm({
        title: 'Удалить с устройства?',
        message: `Файл «${title}» будет удалён. Прогресс, закладки, заметки и полки сохранятся.`,
        confirmLabel: 'Удалить',
        destructive: true,
      });
      if (!ok) return;
      await performRemoveBook(bookId);
    },
    [dialog, downloadedBooks, performRemoveBook, removingBookIds],
  );

  const handleRemoveBooks = React.useCallback(
    async (bookIds: string[]) => {
      const ids = [...new Set(bookIds.filter(Boolean))];
      if (ids.length === 0) return;
      const ok = await dialog.confirm({
        title: 'Удалить файлы?',
        message: `Файлы ${ids.length} книг будут удалены с устройства. Прогресс, закладки, заметки и полки сохранятся.`,
        confirmLabel: 'Удалить',
        destructive: true,
      });
      if (!ok) return;
      for (const id of ids) {
        if (removingBookIds.has(id)) continue;
        await performRemoveBook(id);
      }
    },
    [dialog, performRemoveBook, removingBookIds],
  );

  const handleToggleFavorite = React.useCallback(
    async (bookId: string) => {
      if (isOnline) {
        try {
          await inpxServer.toggleBookmark(bookId);
        } catch (e) {
          if (isAuthError(e)) return;
          throw e;
        }
        return;
      }
      setDownloadedBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, isFavorite: !b.isFavorite } : b)));
    },
    [inpxServer, isOnline, setDownloadedBooks],
  );

  const handleToggleFavoriteAuthor = React.useCallback(
    async (authorName: string) => {
      if (isOnline) {
        try {
          const favorite = await inpxServer.toggleFavoriteAuthor(authorName);
          await dropQueuedFavoriteOps('favorite_author', authorName);
          setFavoriteAuthors((prev) => (
            favorite
              ? (prev.includes(authorName) ? prev : [...prev, authorName])
              : prev.filter((a) => a !== authorName)
          ));
        } catch (e) {
          if (!isAuthError(e)) snackbar.show('Не удалось обновить избранное', undefined, 'error');
          return;
        }
        return;
      }
      let desired = false;
      setFavoriteAuthors((prev) => {
        desired = !prev.includes(authorName);
        return desired ? [...prev, authorName] : prev.filter((a) => a !== authorName);
      });
      void enqueueSyncOp('favorite_author', authorName, { favorite: desired });
    },
    [inpxServer, isOnline, setFavoriteAuthors, snackbar],
  );

  const handleToggleFavoriteSeries = React.useCallback(
    async (seriesName: string) => {
      if (isOnline) {
        try {
          const favorite = await inpxServer.toggleFavoriteSeries(seriesName);
          await dropQueuedFavoriteOps('favorite_series', seriesName);
          setFavoriteSeries((prev) => (
            favorite
              ? (prev.includes(seriesName) ? prev : [...prev, seriesName])
              : prev.filter((s) => s !== seriesName)
          ));
        } catch (e) {
          if (!isAuthError(e)) snackbar.show('Не удалось обновить избранное', undefined, 'error');
          return;
        }
        return;
      }
      let desired = false;
      setFavoriteSeries((prev) => {
        desired = !prev.includes(seriesName);
        return desired ? [...prev, seriesName] : prev.filter((s) => s !== seriesName);
      });
      void enqueueSyncOp('favorite_series', seriesName, { favorite: desired });
    },
    [inpxServer, isOnline, setFavoriteSeries, snackbar],
  );

  const handleToggleBookBookmark = React.useCallback(
    async (bookId: string) => {
      if (isOnline) {
        try {
          await inpxServer.toggleBookmark(bookId);
        } catch (e) {
          if (!isAuthError(e)) {
            snackbar.show('Не удалось обновить избранное', undefined, 'error');
          }
        }
      }
    },
    [inpxServer, isOnline, snackbar],
  );

  const handleSetUserRating = React.useCallback(
    (bookId: string, rating: number) => {
      setDownloadedBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, userRating: rating } : b)));
    },
    [setDownloadedBooks],
  );

  const handleToggleReadStatus = React.useCallback(
    async (bookId: string) => {
      const wasRead = isOnline
        ? inpxServer.readIds.has(bookId)
        : Boolean(progressList.find((p) => p.bookId === bookId)?.finished);
      const desiredRead = !wasRead;

      if (isOnline) {
        try {
          await inpxServer.toggleRead(bookId);
        } catch (e) {
          if (isAuthError(e)) {
            onAuthExpiredRef.current?.();
            snackbar.show('Сессия устройства устарела. Введите логин и пароль заново.', undefined, 'error');
            return;
          }
          await enqueueSyncOp('toggle_read', bookId, { markRead: desiredRead });
          touchReadBooksLocalRev();
          snackbar.show('Отметка сохранится, когда связь с сервером появится', undefined, 'error');
          return;
        }
        snackbar.show(wasRead ? 'Снята отметка «прочитано»' : 'Отмечено как прочитано', {
          label: 'Отмена',
          onClick: () => {
            void (async () => {
              await dropQueuedToggleReadOps(bookId).catch(() => {});
              // Restore absolute prior state — blind toggle breaks after a failed API+queue path.
              if (inpxServer.readIds.has(bookId) !== wasRead) {
                try {
                  await inpxServer.toggleRead(bookId);
                } catch {
                  await enqueueSyncOp('toggle_read', bookId, { markRead: wasRead });
                  touchReadBooksLocalRev();
                }
              } else {
                try {
                  await ensureBookReadState(serverConfig, bookId, wasRead);
                } catch {
                  await enqueueSyncOp('toggle_read', bookId, { markRead: wasRead });
                  touchReadBooksLocalRev();
                }
              }
            })();
          },
        });
        return;
      }
      await enqueueSyncOp('toggle_read', bookId, { markRead: desiredRead });
      const targetBook = downloadedBooks.find((b) => b.id === bookId);
      if (!targetBook) {
        touchReadBooksLocalRev();
        snackbar.show('Отметка сохранится, когда связь с сервером появится');
        return;
      }

      touchReadBooksLocalRev();
      let clearedReadSnapshot: ReturnType<typeof readOfflineReaderData> | null = null;
      const hadProgressRow = progressList.some((p) => p.bookId === bookId);
      if (!desiredRead) {
        const before = readOfflineReaderData(bookId);
        clearOfflineReadMark(bookId);
        const after = readOfflineReaderData(bookId);
        if (before.progress !== after.progress || before.fraction !== after.fraction) {
          clearedReadSnapshot = before;
        }
        bumpReaderLocal();
      }
      setProgressList((prev) => {
        const exists = prev.find((p) => p.bookId === bookId);
        if (exists) {
          return prev.map((p) =>
            p.bookId === bookId
              ? {
                  ...p,
                  finished: !p.finished,
                  percentage: p.finished ? Math.min(p.percentage || 94, 94) : 100,
                }
              : p,
          );
        }
        const newProgress: ReadingProgress = {
          bookId,
          bookTitle: targetBook.title,
          authorName: targetBook.author,
          currentChapter: 0,
          percentage: 100,
          scrollPosition: 0,
          charPosition: 0,
          lastRead: Date.now(),
          finished: true,
        };
        return [...prev, newProgress];
      });
      snackbar.show(wasRead ? 'Снята отметка «прочитано»' : 'Отмечено как прочитано', {
        label: 'Отмена',
        onClick: () => {
          void (async () => {
            await dropQueuedToggleReadOps(bookId).catch(() => {});
            await enqueueSyncOp('toggle_read', bookId, { markRead: wasRead });
            touchReadBooksLocalRev();
            if (clearedReadSnapshot) {
              const cur = readOfflineReaderData(bookId);
              writeOfflineReaderData(bookId, {
                ...cur,
                progress: clearedReadSnapshot.progress,
                fraction: clearedReadSnapshot.fraction,
                positionChangedAt: clearedReadSnapshot.positionChangedAt,
                positionDirty: clearedReadSnapshot.positionDirty,
              });
              bumpReaderLocal();
            }
            setProgressList((prev) => {
              // Undo of a newly invented mark-as-read row — remove it, don't leave fake 94%.
              if (!wasRead && !hadProgressRow) {
                return prev.filter((p) => p.bookId !== bookId);
              }
              return prev.map((p) =>
                p.bookId === bookId
                  ? { ...p, finished: wasRead, percentage: wasRead ? 100 : Math.min(p.percentage, 94) }
                  : p,
              );
            });
          })();
        },
      });
    },
    [downloadedBooks, inpxServer, isOnline, progressList, serverConfig, setProgressList, snackbar],
  );

  const readingProgressByBookId = React.useMemo(() => {
    const out: Record<string, number> = {};
    const localByBook = localReaderProgressByBookId(downloadedBooksWithFile.map((b) => b.id));

    progressList.forEach((p) => {
      const pct = p.finished ? 100 : Math.round(p.percentage);
      if (pct > 0) out[p.bookId] = pct;
    });

    for (const [bookId, pct] of Object.entries(localByBook)) {
      out[bookId] = pct;
    }

    if (isOnline) {
      inpxServer.readingProgress.forEach((pct, bookId) => {
        if (!Object.prototype.hasOwnProperty.call(localByBook, bookId)) {
          out[bookId] = pct;
        }
      });
      inpxServer.readIds.forEach((bookId) => {
        if (out[bookId] == null) out[bookId] = 100;
      });
    }
    return out;
  }, [progressList, downloadedBooksWithFile, isOnline, inpxServer.readingProgress, inpxServer.readIds, readerLocalVersion]);

  const localRecentReading = React.useMemo(
    () => buildLocalRecentReading(downloadedBooksWithFile),
    [downloadedBooksWithFile, readerLocalVersion],
  );

  const finalizeReaderSession = React.useCallback(
    async (bookId: string): Promise<{ progress: number }> => {
      const book = downloadedBooks.find((b) => b.id === bookId) ?? {
        id: bookId,
        title: '',
        author: '',
        ext: 'fb2',
      };
      setProgressList((prev) => upsertProgressFromLocalReader(prev, book));

      const localProgress = () => {
        const local = readOfflineReaderData(bookId);
        return Math.round(Number(local.progress) || 0);
      };

      if (!canReadOnline || isLocalOnlyBookId(bookId)) {
        return { progress: localProgress() };
      }

      try {
        await flushOfflineReaderStore();
        const activityState = readReaderActivitySync();
        const activityMeta = await fetchReaderActivitySyncMeta(serverConfig);
        if (activityMeta) applyServerActivitySyncMeta(activityMeta);
        const localBefore = readOfflineReaderData(bookId);
        const activityOpts = buildSyncActivityOptions(
          activityState,
          activityMeta,
          localBefore.positionChangedAt || localBefore.updatedAt,
        );
        await syncOfflineReaderForBook(serverConfig, bookId, activityOpts, { skipPosition: true });
        const posResult = await finalizeReadingPositionSync(serverConfig, bookId, {
          canPushRead: activityOpts.shouldPushReadState !== false,
        });
        const local = readOfflineReaderData(bookId);
        debugSessionLog('P4', 'App:finalizeReaderSession', 'synced', {
          bookId,
          posResult,
          fraction: local.fraction ?? null,
          paginatorPage: local.paginatorPage ?? null,
          progress: local.progress,
        });
        const hasLocalReading =
          local.progress > 0
          || Number(local.fraction) > 0
          || Boolean(local.position)
          || (Number.isInteger(Number(local.textOffset)) && Number(local.textOffset) >= 0);
        if (hasLocalReading && activityOpts.shouldPushReadingHistory) {
          touchReadingHistoryLocalRev();
          await recordReadingHistory(serverConfig, bookId);
        }
        return { progress: Math.round(Number(local.progress) || 0) };
      } catch (e) {
        if (isAuthError(e)) {
          onAuthExpiredRef.current?.();
        } else if (isUnreachableServerError(e)) {
          onConnectionLostRef.current?.();
        }
        /* sync on next connect */
        return { progress: localProgress() };
      }
      // Soft library refresh is requested by the caller via background sync (after-close).
    },
    [canReadOnline, downloadedBooks, serverConfig, setProgressList],
  );

  const closeReader = React.useCallback(async (): Promise<{ bookId: string; progress: number } | null> => {
    if (closeInFlightRef.current) return closeInFlightRef.current;
    const run = (async (): Promise<{ bookId: string; progress: number } | null> => {
      openSyncGenRef.current += 1;
      const bookId = activeReaderRef.current?.bookId;
      setActiveReader(null);
      if (!bookId) return null;
      finalizingBookIdsRef.current.add(bookId);
      try {
        const { progress } = await finalizeReaderSession(bookId);
        bumpReaderLocal();
        return { bookId, progress };
      } finally {
        finalizingBookIdsRef.current.delete(bookId);
      }
    })();
    closeInFlightRef.current = run;
    try {
      return await run;
    } finally {
      if (closeInFlightRef.current === run) closeInFlightRef.current = null;
    }
  }, [bumpReaderLocal, finalizeReaderSession]);

  const readerLocalFile = activeReader?.localFile ?? null;

  const canOpenActiveReader = Boolean(activeReader && readerLocalFile);

  const handleAddBookmark = React.useCallback(
    (bmark: Bookmark) => {
      setBookmarks((prev) => {
        const filtered = prev.filter((b) => b.id !== bmark.id);
        return [...filtered, bmark];
      });
    },
    [setBookmarks],
  );

  const handleRemoveBookmark = React.useCallback(
    (bmarkId: string) => {
      setBookmarks((prev) => prev.filter((b) => b.id !== bmarkId));
    },
    [setBookmarks],
  );

  const handleAddHighlight = React.useCallback(
    (hl: Highlight) => {
      setHighlights((prev) => [...prev, hl]);
    },
    [setHighlights],
  );

  const handleRemoveHighlight = React.useCallback(
    (hlId: string) => {
      setHighlights((prev) => prev.filter((h) => h.id !== hlId));
    },
    [setHighlights],
  );

  const localReaderBookmarks = React.useMemo(
    () => listLocalReaderBookmarks(downloadedBooksWithFile),
    [downloadedBooksWithFile, readerLocalVersion],
  );

  const localReaderAnnotations = React.useMemo(
    () => listLocalReaderAnnotations(downloadedBooksWithFile),
    [downloadedBooksWithFile, readerLocalVersion],
  );

  const handleUpdateReaderBookmark = React.useCallback(
    async (bookId: string, bmId: number, title: string) => {
      updateOfflineReaderBookmarkTitle(bookId, bmId, title);
      bumpReaderLocal();
      if (canReadOnline) {
        try {
          await inpxServer.patchReaderBookmark(bookId, bmId, title);
        } catch {
          /* local saved */
        }
      }
    },
    [bumpReaderLocal, canReadOnline, inpxServer],
  );

  const handleRemoveReaderBookmark = React.useCallback(
    async (bookId: string, bmId: number) => {
      const data = readOfflineReaderData(bookId);
      const removed = data.bookmarks.find((b) => b.id === bmId);
      if (!removed) return;
      deleteOfflineReaderBookmark(bookId, bmId);
      bumpReaderLocal();
      let deletedOnServer = false;
      if (canReadOnline) {
        try {
          await inpxServer.deleteReaderBookmark(bookId, bmId);
          deletedOnServer = true;
        } catch {
          /* local already updated */
        }
      }
      const snapshot: OfflineReaderBookmark = { ...removed };
      snackbar.show('Закладка удалена', {
        label: 'Отмена',
        onClick: () => {
          restoreOfflineReaderBookmark(bookId, snapshot);
          bumpReaderLocal();
          if (deletedOnServer && canReadOnline) {
            void inpxServer
              .addReaderBookmark(bookId, snapshot.position, snapshot.title || '')
              .then((newId) => {
                if (newId != null && Number(newId) !== snapshot.id) {
                  const cur = readOfflineReaderData(bookId);
                  writeOfflineReaderData(bookId, {
                    ...cur,
                    bookmarks: cur.bookmarks.map((b) =>
                      b.position === snapshot.position ? { ...b, id: Number(newId) } : b,
                    ),
                  });
                  bumpReaderLocal();
                }
              })
              .catch(() => {});
          }
        },
      });
    },
    [bumpReaderLocal, canReadOnline, inpxServer, snackbar],
  );

  const handleRemoveReaderAnnotation = React.useCallback(
    async (bookId: string, annId: number) => {
      const data = readOfflineReaderData(bookId);
      const removed = data.annotations.find((a) => a.id === annId);
      if (!removed) return;
      deleteOfflineReaderAnnotation(bookId, annId);
      bumpReaderLocal();
      let deletedOnServer = false;
      if (canReadOnline) {
        try {
          await inpxServer.deleteAnnotation(bookId, annId);
          deletedOnServer = true;
        } catch {
          /* local already updated */
        }
      }
      const snapshot: OfflineReaderAnnotation = { ...removed };
      snackbar.show('Заметка удалена', {
        label: 'Отмена',
        onClick: () => {
          restoreOfflineReaderAnnotation(bookId, snapshot);
          bumpReaderLocal();
          if (deletedOnServer && canReadOnline) {
            void inpxServer
              .addAnnotation(
                bookId,
                snapshot.cfi,
                snapshot.text || '',
                snapshot.note || '',
                snapshot.color || 'yellow',
              )
              .then((newId) => {
                if (newId != null && Number(newId) !== snapshot.id) {
                  const cur = readOfflineReaderData(bookId);
                  writeOfflineReaderData(bookId, {
                    ...cur,
                    annotations: cur.annotations.map((a) =>
                      a.cfi === snapshot.cfi ? { ...a, id: Number(newId) } : a,
                    ),
                  });
                  bumpReaderLocal();
                }
              })
              .catch(() => {});
          }
        },
      });
    },
    [bumpReaderLocal, canReadOnline, inpxServer, snackbar],
  );

  const handleUpdateReaderAnnotation = React.useCallback(
    async (bookId: string, annId: number, patch: { note?: string; color?: string }) => {
      if (!updateOfflineReaderAnnotation(bookId, annId, patch)) return;
      bumpReaderLocal();
      if (canReadOnline) {
        try {
          await inpxServer.patchAnnotation(bookId, annId, patch);
        } catch {
          /* local saved */
        }
      }
    },
    [bumpReaderLocal, canReadOnline, inpxServer],
  );

  const handleRemoveReadingHistory = React.useCallback(
    async (bookId: string) => {
      clearOfflineReadingHistory(bookId);
      touchReadingHistoryLocalRev();
      bumpReaderLocal();
      const prevProgress = progressList.find((p) => p.bookId === bookId);
      setProgressList((prev) => prev.filter((p) => p.bookId !== bookId));
      let removedOnServer = false;
      if (canReadOnline) {
        try {
          await inpxServer.removeReadingHistory(bookId);
          removedOnServer = true;
        } catch {
          await enqueueSyncOp('remove_history', bookId, {});
        }
      } else {
        await enqueueSyncOp('remove_history', bookId, {});
      }
      snackbar.show('Убрано из истории', {
        label: 'Отмена',
        onClick: () => {
          restoreOfflineReadingHistoryVisibility(bookId);
          if (prevProgress) setProgressList((prev) => [...prev, prevProgress]);
          bumpReaderLocal();
          void dropQueuedRemoveHistoryOps(bookId).catch(() => {});
          if (removedOnServer) {
            void inpxServer.touchReadingHistory(bookId).catch(() => {});
          }
        },
      });
    },
    [bumpReaderLocal, canReadOnline, inpxServer, progressList, setProgressList, snackbar],
  );

  const handleRemoveReadBook = React.useCallback(
    async (bookId: string) => {
      clearOfflineReadMark(bookId);
      touchReadBooksLocalRev();
      bumpReaderLocal();
      setProgressList((prev) =>
        prev.map((p) =>
          p.bookId === bookId ? { ...p, finished: false, percentage: Math.min(p.percentage, 94) } : p,
        ),
      );
      if (canReadOnline) {
        try {
          await inpxServer.removeReadBook(bookId);
          await dropQueuedToggleReadOps(bookId).catch(() => {});
        } catch {
          await enqueueSyncOp('toggle_read', bookId, { markRead: false });
          touchReadBooksLocalRev();
        }
      } else {
        await enqueueSyncOp('toggle_read', bookId, { markRead: false });
        touchReadBooksLocalRev();
      }
    },
    [bumpReaderLocal, canReadOnline, inpxServer, setProgressList],
  );

  const handleAddShelf = React.useCallback(
    async (name: string): Promise<number | string | null> => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      if (isOnline) {
        try {
          const id = await inpxServer.addShelf(trimmed);
          if (id != null) {
            const localId = String(id);
            setShelves((prev) => (
              prev.some((s) => s.id === localId)
                ? prev
                : [...prev, { id: localId, name: trimmed, bookIds: [] }]
            ));
          }
          return id ?? null;
        } catch (e) {
          if (isAuthError(e)) {
            onAuthExpiredRef.current?.();
            return null;
          }
          throw e;
        }
      }
      const id = `shelf_${Date.now()}`;
      setShelves((prev) => [...prev, { id, name: trimmed, bookIds: [] }]);
      void enqueueSyncOp('shelf_create', id, { name: trimmed });
      return id;
    },
    [inpxServer, isOnline, setShelves],
  );

  const handleAddBookToShelf = React.useCallback(
    async (bookId: string, shelfId: string): Promise<boolean> => {
      const addLocal = () => {
        setShelves((prev) =>
          prev.map((s) => {
            if (s.id === shelfId && !s.bookIds.includes(bookId)) {
              return { ...s, bookIds: [...s.bookIds, bookId] };
            }
            return s;
          }),
        );
      };
      const serverShelfId = /^\d+$/.test(shelfId) ? Number(shelfId) : null;
      if (isOnline && serverShelfId != null) {
        try {
          await inpxServer.addToShelf(serverShelfId, bookId);
          addLocal();
        } catch (e) {
          if (isAuthError(e)) {
            onAuthExpiredRef.current?.();
            return false;
          }
          throw e;
        }
        return true;
      }
      let shelfName = '';
      setShelves((prev) => {
        shelfName = prev.find((s) => s.id === shelfId)?.name || '';
        return prev.map((s) => {
          if (s.id === shelfId && !s.bookIds.includes(bookId)) {
            return { ...s, bookIds: [...s.bookIds, bookId] };
          }
          return s;
        });
      });
      void enqueueSyncOp('shelf_add', shelfId, { bookId, name: shelfName });
      return true;
    },
    [inpxServer, isOnline, setShelves],
  );

  const handleAddBooksToShelf = React.useCallback(
    async (shelfId: number | string, bookIds: string[]) => {
      const ids = [...new Set(bookIds.filter(Boolean))];
      for (const id of ids) {
        await handleAddBookToShelf(id, String(shelfId));
      }
    },
    [handleAddBookToShelf],
  );

  const handleRemoveBookFromShelf = React.useCallback(
    async (bookId: string, shelfId: string) => {
      const dropLocal = () => {
        setShelves((prev) =>
          prev.map((s) => {
            if (s.id === shelfId) {
              return { ...s, bookIds: s.bookIds.filter((id) => id !== bookId) };
            }
            return s;
          }),
        );
      };
      const serverShelfId = /^\d+$/.test(shelfId) ? Number(shelfId) : null;
      if (isOnline && serverShelfId != null) {
        try {
          await inpxServer.removeFromShelf(serverShelfId, bookId);
          dropLocal();
        } catch (e) {
          if (isAuthError(e)) {
            onAuthExpiredRef.current?.();
            return;
          }
          throw e;
        }
        return;
      }
      let shelfName = '';
      setShelves((prev) => {
        shelfName = prev.find((s) => s.id === shelfId)?.name || '';
        return prev.map((s) => {
          if (s.id === shelfId) {
            return { ...s, bookIds: s.bookIds.filter((id) => id !== bookId) };
          }
          return s;
        });
      });
      void enqueueSyncOp('shelf_remove', shelfId, { bookId, name: shelfName });
    },
    [inpxServer, isOnline, setShelves],
  );

  const handleRemoveShelfConfirmed = React.useCallback(
    async (shelfId: string) => {
      const ok = await dialog.confirm({
        title: 'Удалить полку?',
        message: 'Книги на полке не будут удалены с устройства.',
        confirmLabel: 'Удалить',
        destructive: true,
      });
      if (!ok) return;
      if (isOnline && /^\d+$/.test(shelfId)) {
        try {
          await inpxServer.removeShelf(Number(shelfId));
          setShelves((prev) => prev.filter((s) => s.id !== shelfId));
        } catch (e) {
          if (isAuthError(e)) {
            onAuthExpiredRef.current?.();
            return;
          }
          throw e;
        }
        return;
      }
      let shelfName = '';
      setShelves((prev) => {
        shelfName = prev.find((s) => s.id === shelfId)?.name || '';
        return prev.filter((s) => s.id !== shelfId);
      });
      if (shelfId.startsWith('shelf_')) {
        const mapped = readPersistedShelfIdMap().get(shelfId);
        void dropQueuedShelfOps(shelfId).then(() => {
          if (mapped != null) void enqueueSyncOp('shelf_delete', String(mapped), { name: shelfName });
        });
      } else {
        void enqueueSyncOp('shelf_delete', shelfId, { name: shelfName });
      }
    },
    [dialog, inpxServer, isOnline, setShelves],
  );

  return {
    activeReader,
    closeReader,
    canOpenActiveReader,
    readerLocalFile,
    downloadPromptBook,
    setDownloadPromptBook,
    openBookDetails,
    downloadPromptError,
    setDownloadPromptError,
    downloadedBookIdsWithFile,
    downloadedBooksWithFile,
    readingProgressByBookId,
    localRecentReading,
    registerDownloadedBook,
    localReaderBookmarks,
    localReaderAnnotations,
    bumpReaderLocal,
    handleOpenBook,
    handleOpenBookCard,
    handleContinueBook,
    handleOpenBookAtPosition,
    handleRemoveBook,
    handleRemoveBooks,
    handleToggleFavorite,
    handleToggleFavoriteAuthor,
    handleToggleFavoriteSeries,
    handleToggleBookBookmark,
    handleSetUserRating,
    handleToggleReadStatus,
    handleAddBookmark,
    handleRemoveBookmark,
    handleAddHighlight,
    handleRemoveHighlight,
    handleRemoveReaderBookmark,
    handleUpdateReaderBookmark,
    handleRemoveReaderAnnotation,
    handleUpdateReaderAnnotation,
    handleRemoveReadingHistory,
    handleRemoveReadBook,
    handleAddShelf,
    handleAddBookToShelf,
    handleAddBooksToShelf,
    handleRemoveBookFromShelf,
    handleRemoveShelfConfirmed,
    removingBookIds,
    enrichBookMeta,
  };
}
