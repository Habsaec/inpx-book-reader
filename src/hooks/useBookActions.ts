import React from 'react';
import { Book, Bookmark, Highlight, ReadingProgress, ServerConfig, Shelf } from '../types';
import { debugSessionLog } from '../lib/debugSessionLog';
import { extFromStoragePath, removeBookFromDirectory } from '../lib/bookStorage';
import { resolveLocalBookFile, clearLocalFileMeta } from '../lib/localBookAccess';
import { writeStoredStorageDirectory } from '../lib/storageDirectory';
import { removeCoverFromDirectory } from '../lib/coverCache';
import {
  clearOfflineReaderData,
  clearOfflineReadingHistory,
  clearOfflineReadMark,
  deleteOfflineReaderAnnotation,
  deleteOfflineReaderBookmark,
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
  type OfflineReaderAnnotation,
  type OfflineReaderBookmark,
} from '../lib/offlineReaderStore';
import { useDialog } from '../ui/Dialog';
import { finalizeReadingPositionSync, syncOfflineReaderForBook } from '../lib/offlineSync';
import { runBookOpenOnlineSync } from '../lib/bookOpenSync';
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
import { fetchReaderActivitySyncMeta, recordReadingHistory } from '../lib/inpxClient';
import { downloadQueue } from '../lib/downloadQueue';
import { enqueueSyncOp } from '../lib/localDb';
import type { StorageDirectory } from '../lib/storageDirectory';
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
}) {
  const dialog = useDialog();
  const snackbar = useSnackbar();
  const [removingBookIds, setRemovingBookIds] = React.useState<Set<string>>(() => new Set());

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
  } = opts;

  const [activeReader, setActiveReader] = React.useState<{
    bookId: string;
    title: string;
    ext: string;
    initialPosition?: string | null;
    localFile: { storageUri: string; localFileName: string };
  } | null>(null);

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

  const enrichBookMeta = React.useCallback(
    (book: Book): Book => {
      const dl = downloadedBooks.find((b) => b.id === book.id);
      if (dl) {
        return {
          ...book,
          title: book.title || dl.title,
          author: book.author || dl.author,
          ext: (dl.ext || extFromStoragePath(dl.localFileName || '') || book.ext || 'fb2').replace(/^\./, ''),
          localFileName: dl.localFileName ?? book.localFileName,
          storageUri: dl.storageUri ?? book.storageUri,
          chaptersPath: dl.chaptersPath ?? book.chaptersPath,
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
      } catch {
        /* открыть с локальными данными */
      }
    },
    [canReadOnline, serverConfig],
  );

  const tryResolveAndOpen = React.useCallback(
    async (book: Book, initialPosition?: string | null) => {
      const resolved = enrichBookMeta(book);
      if (!resolved.localFileName?.trim()) {
        debugSessionLog('H1', 'App:handleOpenBook', 'no local file meta', { bookId: resolved.id });
        promptDownloadBook(resolved);
        return;
      }
      const loc = await resolveLocalBookFile(resolved, storageDirectory);
      if (!loc) {
        debugSessionLog('H1', 'App:handleOpenBook', 'file missing on disk', {
          bookId: resolved.id,
          localFileName: resolved.localFileName,
          storageUri: storageDirectory?.uri,
        });
        setDownloadedBooks((prev) =>
          prev.map((b) => (b.id === resolved.id ? clearLocalFileMeta(b) : b)),
        );
        snackbar.show(
          'Файл книги не найден на устройстве. Проверьте папку хранения в профиле или скачайте заново.',
          undefined,
          'error',
        );
        return;
      }
      if (storageDirectory?.uri !== loc.storageUri) {
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
      const resolvedExt = (resolved.ext || extFromStoragePath(loc.localFileName) || 'fb2').replace(/^\./, '');
      migrateOfflineReaderPositionForFormat(resolved.id, resolvedExt);
      if (canReadOnline) {
        const { positionChoice } = await runBookOpenOnlineSync(
          canReadOnline,
          serverConfig,
          resolved.id,
          initialPosition,
          {
            syncReaderData: (bookId) => syncBookReaderData(bookId, { includePosition: false }),
            yieldForUi: () =>
              new Promise<void>((resolve) => {
                requestAnimationFrame(() => resolve());
              }),
          },
        );
        if (positionChoice) {
          debugSessionLog('P5', 'App:handleOpenBook', 'position on open', {
            bookId: resolved.id,
            positionChoice,
          });
        }
      }
      const localAfterSync = readOfflineReaderData(resolved.id);
      debugSessionLog('P5', 'App:handleOpenBook', 'synced before open', {
        bookId: resolved.id,
        fraction: localAfterSync.fraction ?? null,
        progress: localAfterSync.progress,
        fb2Href: localAfterSync.fb2Href ? String(localAfterSync.fb2Href).slice(0, 40) : null,
      });
      setProgressList((prev) => upsertProgressFromLocalReader(prev, resolved));
      primeReaderLocalStorage(resolved.id);
      const explicitPos = initialPosition?.trim() || null;
      setActiveReader({
        bookId: resolved.id,
        title: resolved.title,
        ext: resolvedExt,
        initialPosition: explicitPos,
        localFile: { storageUri: loc.storageUri, localFileName: loc.localFileName },
      });
    },
    [canReadOnline, dialog, enrichBookMeta, onStorageDirectoryResolved, promptDownloadBook, serverConfig, setDownloadedBooks, setProgressList, snackbar, storageDirectory, syncBookReaderData],
  );

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
    async (bookId: string, mode: 'file' | 'file-and-data') => {
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
        if (mode === 'file-and-data') {
          clearOfflineReaderData(bookId);
          setProgressList((prev) => prev.filter((p) => p.bookId !== bookId));
          setBookmarks((prev) => prev.filter((b) => b.bookId !== bookId));
          setHighlights((prev) => prev.filter((h) => h.bookId !== bookId));
          setShelves((prev) => prev.map((s) => ({ ...s, bookIds: s.bookIds.filter((id) => id !== bookId) })));
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
    [downloadedBooks, setBookmarks, setDownloadedBooks, setHighlights, setProgressList, setShelves, storageDirectory],
  );

  const handleRemoveBook = React.useCallback(
    async (bookId: string, mode: 'file' | 'file-and-data' = 'file-and-data') => {
      if (removingBookIds.has(bookId)) return;
      const book = downloadedBooks.find((b) => b.id === bookId);
      const title = book?.title ?? 'книгу';
      const ok = await dialog.confirm({
        title: mode === 'file' ? 'Удалить файл?' : 'Удалить книгу и данные?',
        message:
          mode === 'file'
            ? `Будет удалён файл «${title}» с устройства. Прогресс и заметки сохранятся.`
            : `Будет удалено:\n• файл «${title}»\n• прогресс чтения\n• закладки и заметки\n• записи на полках`,
        confirmLabel: 'Удалить',
        destructive: true,
      });
      if (!ok) return;
      await performRemoveBook(bookId, mode);
      snackbar.show(mode === 'file' ? 'Файл удалён' : 'Книга и данные удалены');
    },
    [dialog, downloadedBooks, performRemoveBook, removingBookIds, snackbar],
  );

  const handleToggleFavorite = React.useCallback(
    async (bookId: string) => {
      if (isOnline) {
        await inpxServer.toggleBookmark(bookId);
        return;
      }
      setDownloadedBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, isFavorite: !b.isFavorite } : b)));
    },
    [inpxServer, isOnline, setDownloadedBooks],
  );

  const handleToggleFavoriteAuthor = React.useCallback(
    async (authorName: string) => {
      if (isOnline) {
        await inpxServer.toggleFavoriteAuthor(authorName);
        return;
      }
      setFavoriteAuthors((prev) =>
        prev.includes(authorName) ? prev.filter((a) => a !== authorName) : [...prev, authorName],
      );
    },
    [inpxServer, isOnline, setFavoriteAuthors],
  );

  const handleToggleFavoriteSeries = React.useCallback(
    async (seriesName: string) => {
      if (isOnline) {
        await inpxServer.toggleFavoriteSeries(seriesName);
        return;
      }
      setFavoriteSeries((prev) =>
        prev.includes(seriesName) ? prev.filter((s) => s !== seriesName) : [...prev, seriesName],
      );
    },
    [inpxServer, isOnline, setFavoriteSeries],
  );

  const handleToggleBookBookmark = React.useCallback(
    async (bookId: string) => {
      if (isOnline) {
        await inpxServer.toggleBookmark(bookId);
      }
    },
    [inpxServer, isOnline],
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

      if (isOnline) {
        try {
          await inpxServer.toggleRead(bookId);
        } catch {
          await enqueueSyncOp('toggle_read', bookId, { markRead: !wasRead });
        }
        snackbar.show(wasRead ? 'Снята отметка «прочитано»' : 'Отмечено как прочитано', {
          label: 'Отмена',
          onClick: () => {
            void inpxServer.toggleRead(bookId);
          },
        });
        return;
      }
      const targetBook = downloadedBooks.find((b) => b.id === bookId);
      if (!targetBook) return;

      setProgressList((prev) => {
        const exists = prev.find((p) => p.bookId === bookId);
        if (exists) {
          return prev.map((p) =>
            p.bookId === bookId ? { ...p, finished: !p.finished, percentage: p.finished ? 0 : 100 } : p,
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
    },
    [downloadedBooks, inpxServer, isOnline, setProgressList, snackbar],
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
  }, [progressList, downloadedBooksWithFile, isOnline, inpxServer.readingProgress, inpxServer.readIds]);

  const localRecentReading = React.useMemo(
    () => buildLocalRecentReading(downloadedBooksWithFile),
    [downloadedBooksWithFile],
  );

  const finalizeReaderSession = React.useCallback(
    async (bookId: string) => {
      const book = downloadedBooks.find((b) => b.id === bookId);
      if (book) {
        setProgressList((prev) => upsertProgressFromLocalReader(prev, book));
      }

      if (!canReadOnline) return;

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
        if ((local.progress > 0 || local.position) && activityOpts.shouldPushReadingHistory) {
          touchReadingHistoryLocalRev();
          await recordReadingHistory(serverConfig, bookId);
        }
      } catch {
        /* sync on next connect */
      } finally {
        void inpxServer.refresh();
      }
    },
    [canReadOnline, downloadedBooks, inpxServer, serverConfig, setProgressList],
  );

  const closeReader = React.useCallback(() => {
    setActiveReader((current) => {
      const bookId = current?.bookId;
      if (bookId) {
        void finalizeReaderSession(bookId);
      }
      return null;
    });
  }, [finalizeReaderSession]);

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

  const handleRemoveReaderBookmark = React.useCallback(
    async (bookId: string, bmId: number) => {
      const data = readOfflineReaderData(bookId);
      const removed = data.bookmarks.find((b) => b.id === bmId);
      if (!removed) return;
      deleteOfflineReaderBookmark(bookId, bmId);
      bumpReaderLocal();
      if (canReadOnline) {
        try {
          await inpxServer.deleteReaderBookmark(bookId, bmId);
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
      if (canReadOnline) {
        try {
          await inpxServer.deleteAnnotation(bookId, annId);
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
      snackbar.show('Заметка сохранена', undefined, 'success');
    },
    [bumpReaderLocal, canReadOnline, inpxServer, snackbar],
  );

  const handleRemoveReadingHistory = React.useCallback(
    async (bookId: string) => {
      clearOfflineReadingHistory(bookId);
      touchReadingHistoryLocalRev();
      bumpReaderLocal();
      const prevProgress = progressList.find((p) => p.bookId === bookId);
      setProgressList((prev) => prev.filter((p) => p.bookId !== bookId));
      if (canReadOnline) {
        try {
          await inpxServer.removeReadingHistory(bookId);
        } catch {
          await enqueueSyncOp('remove_history', bookId, {});
        }
      }
      snackbar.show('Убрано из истории', {
        label: 'Отмена',
        onClick: () => {
          if (prevProgress) setProgressList((prev) => [...prev, prevProgress]);
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
        } catch {
          /* local already updated */
        }
      }
    },
    [bumpReaderLocal, canReadOnline, inpxServer, setProgressList],
  );

  const handleAddShelf = React.useCallback(
    async (name: string) => {
      if (isOnline) {
        await inpxServer.addShelf(name);
        return;
      }
      setShelves((prev) => [...prev, { id: `shelf_${Date.now()}`, name, bookIds: [] }]);
    },
    [inpxServer, isOnline, setShelves],
  );

  const handleAddBookToShelf = React.useCallback(
    async (bookId: string, shelfId: string) => {
      if (isOnline) {
        await inpxServer.addToShelf(Number(shelfId), bookId);
        return;
      }
      setShelves((prev) =>
        prev.map((s) => {
          if (s.id === shelfId && !s.bookIds.includes(bookId)) {
            return { ...s, bookIds: [...s.bookIds, bookId] };
          }
          return s;
        }),
      );
    },
    [inpxServer, isOnline, setShelves],
  );

  const handleRemoveBookFromShelf = React.useCallback(
    async (bookId: string, shelfId: string) => {
      if (isOnline) {
        await inpxServer.removeFromShelf(Number(shelfId), bookId);
        return;
      }
      setShelves((prev) =>
        prev.map((s) => {
          if (s.id === shelfId) {
            return { ...s, bookIds: s.bookIds.filter((id) => id !== bookId) };
          }
          return s;
        }),
      );
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
      if (isOnline) {
        await inpxServer.removeShelf(Number(shelfId));
        return;
      }
      setShelves((prev) => prev.filter((s) => s.id !== shelfId));
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
    localReaderBookmarks,
    localReaderAnnotations,
    handleOpenBook,
    handleOpenBookCard,
    handleContinueBook,
    handleOpenBookAtPosition,
    handleRemoveBook,
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
    handleRemoveReaderAnnotation,
    handleUpdateReaderAnnotation,
    handleRemoveReadingHistory,
    handleRemoveReadBook,
    handleAddShelf,
    handleAddBookToShelf,
    handleRemoveBookFromShelf,
    handleRemoveShelfConfirmed,
    removingBookIds,
    enrichBookMeta,
  };
}
