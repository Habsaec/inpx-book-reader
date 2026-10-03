import React from 'react';
import { Heart, Folder, FolderPlus, CheckCircle2, ArrowLeft, AlertCircle } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { FavoriteAuthorItem, FavoriteSeriesItem, UiShelf } from '../lib/inpxClient';
import { mapServerBook, fetchAllReaderBookmarkList, fetchAllReaderAnnotationList, fetchBookmarkedBooks, fetchLibraryView, isAuthError, type InpxBookItem } from '../lib/inpxClient';
import DeviceLibraryTab from './DeviceLibraryTab';
import CatalogBookList from './catalog/CatalogBookList';
import EntityPreviewRow from './EntityPreviewRow';
import ShelfCard from './shelves/ShelfCard';
import ViewModeToggle from '../ui/ViewModeToggle';
import { BookGridSkeleton, BookListSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { textStyles, touchMin, radii } from '../ui/tokens';
import SegmentTabStrip from '../ui/SegmentTabStrip';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { useHorizontalTabSwipe } from '../hooks/useHorizontalTabSwipe';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import { isFolderLocalBookId } from '../lib/importExternalBook';
import LocalFolderBrowser from './mybooks/LocalFolderBrowser';
import ReaderNotesPanel from './mybooks/ReaderNotesPanel';
import ReaderBookmarksPanel from './mybooks/ReaderBookmarksPanel';
import { useDownloadQueue } from '../hooks/useDownloadQueue';
import {
  ensureOfflineReaderAnnotation,
  mergeReaderAnnotationLists,
  mergeReaderBookmarkLists,
  readerAnnotationFromApi,
  readerBookmarkFromApi,
  type LocalReaderAnnotationItem,
  type LocalReaderBookmarkItem,
} from '../lib/offlineReaderStore';

const LIBRARY_SEGS = ['downloaded', 'local', 'favorites', 'shelves', 'read', 'bookmarks', 'notes'] as const;
type LibrarySeg = (typeof LIBRARY_SEGS)[number];

const SEG_TABS: { id: LibrarySeg; label: string }[] = [
  { id: 'downloaded', label: 'Загрузки' },
  { id: 'local', label: 'Папки' },
  { id: 'favorites', label: 'Избранное' },
  { id: 'shelves', label: 'Полки' },
  { id: 'read', label: 'Прочитано' },
  { id: 'bookmarks', label: 'Закладки' },
  { id: 'notes', label: 'Заметки' },
];

interface MyBooksTabProps {
  serverConfig: ServerConfig;
  isAppDark: boolean;
  isOnline: boolean;
  canDownloadOnline: boolean;
  downloadedBookIds: string[];
  localOfflineBooks: Book[];
  storageDirectory?: StorageDirectory | null;
  storageDirectoryReady?: boolean;
  downloadingId?: string | null;
  readingProgressByBookId?: Record<string, number>;
  readIds?: Set<string>;
  bookmarkIds?: Set<string>;
  shelves?: UiShelf[];
  favoriteAuthors?: string[];
  favoriteSeries?: string[];
  favoriteAuthorItems?: FavoriteAuthorItem[];
  favoriteSeriesItems?: FavoriteSeriesItem[];
  fetchSectionBooks?: (section: 'bookmarks' | 'read', page?: number) => Promise<import('../lib/inpxClient').InpxBookItem[]>;
  loadShelfBooks?: (shelfId: number | string) => Promise<Book[]>;
  onOpenBook: (book: Book) => void;
  onContinueBook: (book: Book) => void;
  onRegisterBook?: (book: Book) => void;
  /** Book row tap → details on every shelf, including downloaded. */
  onOpenDetails?: (book: Book) => void;
  onBookLongPress?: (book: Book, context?: { shelfId?: number | string; shelfName?: string }) => void;
  onRemoveBooks?: (bookIds: string[]) => void | Promise<void>;
  onAddBooksToShelf?: (shelfId: number | string, bookIds: string[]) => void | Promise<void>;
  onAddShelf?: (name: string) => Promise<number | string | null>;
  onOpenAuthor?: (name: string) => void;
  onOpenSeries?: (name: string) => void;
  onRemoveShelf?: (shelfId: string) => void | Promise<void>;
  localReaderAnnotations?: LocalReaderAnnotationItem[];
  localReaderBookmarks?: LocalReaderBookmarkItem[];
  onOpenBookAtPosition?: (bookId: string, position: string, fallbackBook?: Book) => void;
  onRemoveReaderAnnotation?: (bookId: string, annId: number) => void | Promise<void>;
  onUpdateReaderAnnotation?: (bookId: string, annId: number, patch: { note?: string; color?: string }) => void | Promise<void>;
  onRemoveReaderBookmark?: (bookId: string, bmId: number) => void | Promise<void>;
  onUpdateReaderBookmark?: (bookId: string, bmId: number, title: string) => void | Promise<void>;
  onGoCatalog?: () => void;
  onGoProfile?: () => void;
  onOpenQueue?: () => void;
  /** Когда false — вкладка скрыта, но смонтирована (сохраняем seg / оверлеи). */
  isTabActive?: boolean;
  /** Bumped when Library tab is re-selected — return to «Загрузки». */
  libraryRootEpoch?: number;
  onAuthExpired?: () => void;
}

export default function MyBooksTab({
  serverConfig,
  isAppDark,
  isOnline,
  canDownloadOnline,
  downloadedBookIds,
  localOfflineBooks,
  storageDirectory,
  storageDirectoryReady,
  downloadingId,
  readingProgressByBookId = {},
  readIds,
  bookmarkIds,
  shelves = [],
  favoriteAuthors = [],
  favoriteSeries = [],
  favoriteAuthorItems,
  favoriteSeriesItems,
  fetchSectionBooks,
  loadShelfBooks,
  onOpenBook,
  onContinueBook,
  onRegisterBook,
  onOpenDetails,
  onBookLongPress,
  onRemoveBooks,
  onAddBooksToShelf,
  onAddShelf,
  onOpenAuthor,
  onOpenSeries,
  localReaderAnnotations = [],
  localReaderBookmarks = [],
  onOpenBookAtPosition,
  onRemoveReaderAnnotation,
  onUpdateReaderAnnotation,
  onRemoveReaderBookmark,
  onUpdateReaderBookmark,
  onGoCatalog,
  onGoProfile,
  onOpenQueue,
  isTabActive = true,
  libraryRootEpoch = 0,
  onAuthExpired,
}: MyBooksTabProps) {
  const queueJobs = useDownloadQueue();
  const queueChipCount = queueJobs.filter(
    (j) =>
      j.status === 'queued' ||
      j.status === 'downloading' ||
      j.status === 'saving' ||
      j.status === 'error',
  ).length;
  const handleBookTap = React.useCallback(
    (book: Book) => {
      if (onOpenDetails) {
        onOpenDetails(book);
        return;
      }
      onOpenBook(book);
    },
    [onOpenBook, onOpenDetails],
  );

  const [seg, setSeg] = React.useState<LibrarySeg>('downloaded');
  const downloadedLibraryBooks = React.useMemo(
    () => localOfflineBooks.filter((book) => !isFolderLocalBookId(book.id)),
    [localOfflineBooks],
  );
  const { viewMode, setViewMode } = useCatalogViewMode('books');
  const segBtnRefs = React.useRef<Partial<Record<LibrarySeg, HTMLButtonElement | null>>>({});
  const [sectionBySeg, setSectionBySeg] = React.useState<{ favorites: Book[]; read: Book[] }>({
    favorites: [],
    read: [],
  });
  const [sectionLoading, setSectionLoading] = React.useState(false);
  const [sectionError, setSectionError] = React.useState(false);
  const [sectionRetry, setSectionRetry] = React.useState(0);
  const [readerListsError, setReaderListsError] = React.useState(false);
  const [readerListsRetry, setReaderListsRetry] = React.useState(0);
  const [activeShelfId, setActiveShelfId] = React.useState<number | string | null>(null);
  const [newShelfOpen, setNewShelfOpen] = React.useState(false);
  const [newShelfName, setNewShelfName] = React.useState('');
  const [newShelfBusy, setNewShelfBusy] = React.useState(false);
  const [shelfBooks, setShelfBooks] = React.useState<Book[]>([]);
  const [serverBookmarks, setServerBookmarks] = React.useState<LocalReaderBookmarkItem[] | null>(null);
  const [serverAnnotations, setServerAnnotations] = React.useState<LocalReaderAnnotationItem[] | null>(null);
  const [readerListsLoading, setReaderListsLoading] = React.useState(false);
  const libraryRootEpochSeen = React.useRef(libraryRootEpoch);

  React.useEffect(() => {
    if (libraryRootEpochSeen.current === libraryRootEpoch) return;
    libraryRootEpochSeen.current = libraryRootEpoch;
    setActiveShelfId(null);
    setSeg('downloaded');
    setNewShelfOpen(false);
  }, [libraryRootEpoch]);

  const authorRows = React.useMemo(() => {
    if (favoriteAuthorItems && favoriteAuthorItems.length > 0) return favoriteAuthorItems;
    return favoriteAuthors.map((name) => ({ name, displayName: name }));
  }, [favoriteAuthorItems, favoriteAuthors]);

  const seriesRows = React.useMemo(() => {
    if (favoriteSeriesItems && favoriteSeriesItems.length > 0) return favoriteSeriesItems;
    return favoriteSeries.map((name) => ({ name, displayName: name }));
  }, [favoriteSeriesItems, favoriteSeries]);

  const goToSeg = React.useCallback((next: LibrarySeg) => {
    setSeg(next);
    setActiveShelfId(null);
    setNewShelfOpen(false);
  }, []);

  React.useEffect(() => {
    segBtnRefs.current[seg]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [seg]);

  const librarySwipe = useHorizontalTabSwipe(
    LIBRARY_SEGS,
    seg,
    goToSeg,
    { enabled: isTabActive && activeShelfId == null },
  );

  React.useEffect(() => {
    if (seg !== 'favorites' && seg !== 'read') return;
    if (!fetchSectionBooks || !isOnline) {
      setSectionLoading(false);
      return;
    }
    const key = seg;
    let cancelled = false;
    setSectionLoading(true);
    setSectionError(false);
    const request = (async () => {
      const pageSize = 48;
      const items: InpxBookItem[] = [];
      for (let page = 1; page <= 40; page += 1) {
        const res = key === 'favorites'
          ? await fetchBookmarkedBooks(serverConfig, page, pageSize)
          : await fetchLibraryView(serverConfig, 'read', page, pageSize);
        items.push(...res.items);
        if (!res.items.length || items.length >= (res.total || items.length) || res.items.length < pageSize) break;
      }
      return items;
    })();
    request
      .then((items) => {
        if (cancelled) return;
        setSectionBySeg((prev) => ({ ...prev, [key]: items.map((b) => mapServerBook(b, serverConfig)) }));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSectionError(true);
        if (isAuthError(e)) onAuthExpired?.();
      })
      .finally(() => {
        if (!cancelled) setSectionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seg, fetchSectionBooks, serverConfig, isOnline, onAuthExpired, sectionRetry]);

  React.useEffect(() => {
    if ((seg !== 'bookmarks' && seg !== 'notes') || !isOnline) return;
    let cancelled = false;
    setReaderListsLoading(true);
    setReaderListsError(false);
    const load =
      seg === 'bookmarks'
        ? fetchAllReaderBookmarkList(serverConfig).then((rows) => {
            if (!cancelled) setServerBookmarks(rows.map(readerBookmarkFromApi));
          })
        : fetchAllReaderAnnotationList(serverConfig).then((rows) => {
            if (!cancelled) setServerAnnotations(rows.map(readerAnnotationFromApi));
          });
    load
      .catch((e: unknown) => {
        if (cancelled) return;
        setReaderListsError(true);
        if (isAuthError(e)) onAuthExpired?.();
      })
      .finally(() => {
        if (!cancelled) setReaderListsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seg, isOnline, serverConfig, onAuthExpired, readerListsRetry]);

  const displayBookmarks = React.useMemo(
    () => mergeReaderBookmarkLists(serverBookmarks ?? [], localReaderBookmarks),
    [serverBookmarks, localReaderBookmarks],
  );
  const displayAnnotations = React.useMemo(
    () => mergeReaderAnnotationLists(serverAnnotations ?? [], localReaderAnnotations),
    [serverAnnotations, localReaderAnnotations],
  );

  const inShelfDrilldown = seg === 'shelves' && activeShelfId != null;
  const activeShelfName = shelves.find((s) => s.id === activeShelfId)?.name;
  const shelfRevision = React.useMemo(
    () => shelves.map((s) => `${s.id}:${s.bookCount ?? 0}`).join('|'),
    [shelves],
  );

  const localReadBooks = React.useMemo(
    () => localOfflineBooks.filter((book) => (readingProgressByBookId?.[book.id] ?? book.readProgress ?? 0) >= 99),
    [localOfflineBooks, readingProgressByBookId],
  );

  const visibleSectionBooks = React.useMemo(() => {
    if (seg === 'favorites') {
      const serverBooks = bookmarkIds
        ? sectionBySeg.favorites.filter((b) => bookmarkIds.has(b.id))
        : sectionBySeg.favorites;
      if (isOnline) return serverBooks;
      const byId = new Map<string, Book>();
      for (const book of localOfflineBooks) {
        if (book.isFavorite || bookmarkIds?.has(book.id)) byId.set(book.id, book);
      }
      for (const book of serverBooks) byId.set(book.id, book);
      return [...byId.values()];
    }
    if (seg === 'read') {
      const serverBooks = readIds
        ? sectionBySeg.read.filter((b) => readIds.has(b.id))
        : sectionBySeg.read;
      if (isOnline) {
        if (readIds) return serverBooks;
        if (serverBooks.length > 0) return serverBooks;
        return localReadBooks;
      }
      const byId = new Map<string, Book>();
      for (const book of localReadBooks) byId.set(book.id, book);
      for (const book of serverBooks) byId.set(book.id, book);
      return [...byId.values()];
    }
    return [];
  }, [seg, sectionBySeg, bookmarkIds, readIds, localReadBooks, localOfflineBooks, isOnline]);

  const shelfLoadGen = React.useRef(0);
  const lastShelfIdLoaded = React.useRef<number | string | null>(null);

  React.useEffect(() => {
    if (seg !== 'shelves' || activeShelfId == null || !loadShelfBooks) {
      shelfLoadGen.current += 1;
      setShelfBooks([]);
      lastShelfIdLoaded.current = null;
      return;
    }
    const gen = ++shelfLoadGen.current;
    const shelfChanged = lastShelfIdLoaded.current !== activeShelfId;
    if (shelfChanged) setSectionLoading(true);
    loadShelfBooks(activeShelfId)
      .then((books) => {
        if (shelfLoadGen.current !== gen) return;
        lastShelfIdLoaded.current = activeShelfId;
        setShelfBooks(books);
        setSectionError(false);
      })
      .catch((e: unknown) => {
        if (shelfLoadGen.current !== gen) return;
        setShelfBooks([]);
        setSectionError(true);
        if (isAuthError(e)) onAuthExpired?.();
      })
      .finally(() => {
        if (shelfLoadGen.current === gen) setSectionLoading(false);
      });
    return () => {
      shelfLoadGen.current += 1;
    };
  }, [seg, activeShelfId, loadShelfBooks, shelfRevision, onAuthExpired, sectionRetry]);

  useOverlayBackHandler(isTabActive && inShelfDrilldown, () => setActiveShelfId(null));

  const listError = (
    <EmptyState
      icon={AlertCircle}
      tone="error"
      title="Не удалось загрузить"
      description="Проверьте соединение и повторите."
      actionLabel="Повторить"
      onAction={() => {
        setSectionError(false);
        setReaderListsError(false);
        setSectionRetry((n) => n + 1);
        setReaderListsRetry((n) => n + 1);
      }}
    />
  );

  const bookmarksPanel =
    readerListsError && displayBookmarks.length === 0 ? (
      listError
    ) : readerListsLoading && displayBookmarks.length === 0 ? (
      <div className="px-5 py-4">
        <BookListSkeleton count={5} />
      </div>
    ) : (
      <ReaderBookmarksPanel
        bookmarks={displayBookmarks}
        serverConfig={serverConfig}
        downloadedBookIds={downloadedBookIds}
        onOpenBookmark={(bookId, position, book) =>
          onOpenBookAtPosition?.(bookId, position, book) ?? onContinueBook(book)
        }
        onRemoveBookmark={
          onRemoveReaderBookmark
            ? async (bookId, bmId) => {
                setServerBookmarks((prev) =>
                  prev?.filter((b) => !(b.bookId === bookId && b.id === bmId)) ?? null,
                );
                await onRemoveReaderBookmark(bookId, bmId);
              }
            : undefined
        }
        onRenameBookmark={
          onUpdateReaderBookmark
            ? async (bookId, bmId, title) => {
                setServerBookmarks((prev) =>
                  prev?.map((b) => (b.bookId === bookId && b.id === bmId ? { ...b, label: title } : b)) ?? null,
                );
                await onUpdateReaderBookmark(bookId, bmId, title);
              }
            : undefined
        }
      />
    );

  const notesPanel =
    readerListsError && displayAnnotations.length === 0 ? (
      listError
    ) : readerListsLoading && displayAnnotations.length === 0 ? (
      <div className="px-5 py-4">
        <BookListSkeleton count={5} />
      </div>
    ) : (
      <ReaderNotesPanel
        annotations={displayAnnotations}
        serverConfig={serverConfig}
        downloadedBookIds={downloadedBookIds}
        onOpenAnnotation={(bookId, cfi, book) => {
          const an = displayAnnotations.find((item) => item.bookId === bookId && item.cfi === cfi);
          if (an) {
            ensureOfflineReaderAnnotation(bookId, {
              id: an.id,
              cfi: an.cfi,
              text: an.text,
              note: an.note,
              color: an.color,
            });
          }
          onOpenBookAtPosition?.(bookId, cfi, book) ?? onContinueBook(book);
        }}
        onRemoveAnnotation={
          onRemoveReaderAnnotation
            ? async (bookId, annId) => {
                setServerAnnotations((prev) =>
                  prev?.filter((a) => !(a.bookId === bookId && a.id === annId)) ?? null,
                );
                await onRemoveReaderAnnotation(bookId, annId);
              }
            : undefined
        }
        onUpdateAnnotation={onUpdateReaderAnnotation}
      />
    );

  const tabsRef = React.useRef<HTMLDivElement>(null);
  const [tabsH, setTabsH] = React.useState(58);

  React.useLayoutEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const measure = () => setTabsH(el.offsetHeight);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [queueChipCount]);

  return (
    <div className="relative flex-1 min-h-0 h-full overflow-hidden">
      <div
        className="inpx-books-pane absolute inset-0 min-h-0 flex flex-col"
        style={{ ['--inpx-under' as string]: `${tabsH}px` }}
        {...librarySwipe}
      >
        {seg === 'bookmarks' ? (
          bookmarksPanel
        ) : seg === 'notes' ? (
          notesPanel
        ) : seg === 'local' ? (
          <div className="flex-1 min-h-0 overflow-y-auto inpx-page-scroll px-5 py-4">
            <LocalFolderBrowser
              storageDirectory={storageDirectory ?? null}
              serverConfig={serverConfig}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              downloadedBookIds={downloadedBookIds}
              libraryBooks={localOfflineBooks}
              readingProgressByBookId={readingProgressByBookId}
              readIds={readIds}
              onOpenBook={onContinueBook}
              onRegisterBook={onRegisterBook}
            />
          </div>
        ) : seg === 'downloaded' ? (
          <DeviceLibraryTab
            books={downloadedLibraryBooks}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory ?? null}
            storageDirectoryReady={storageDirectoryReady}
            isAppDark={isAppDark}
            isOnline={isOnline}
            canDownloadOnline={canDownloadOnline}
            downloadingId={downloadingId}
            readingProgressByBookId={readingProgressByBookId}
            readIds={readIds}
            shelves={shelves}
            onOpenBook={onOpenBook}
            onOpenDetails={onOpenDetails}
            onBookLongPress={onBookLongPress}
            onRemoveBooks={onRemoveBooks}
            onAddBooksToShelf={onAddBooksToShelf}
            onGoCatalog={onGoCatalog}
            onGoProfile={onGoProfile}
            embedded
            resetEpoch={libraryRootEpoch}
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto inpx-page-scroll px-5 py-4 space-y-4">
              {seg === 'shelves' && activeShelfId == null && (
                <>
                  {onAddShelf ? (
                    newShelfOpen ? (
                      <div className="flex gap-2">
                        <input
                          className={`flex-1 min-h-12 min-w-0 px-3 ${textStyles.body} ${radii.button} ${theme.input} ${theme.inputFocus}`}
                          value={newShelfName}
                          onChange={(e) => setNewShelfName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            const name = newShelfName.trim();
                            if (!name || newShelfBusy) return;
                            setNewShelfBusy(true);
                            void onAddShelf(name)
                              .then(() => {
                                setNewShelfName('');
                                setNewShelfOpen(false);
                              })
                              .finally(() => setNewShelfBusy(false));
                          }}
                          placeholder="Название полки"
                          maxLength={80}
                          autoFocus
                          disabled={newShelfBusy}
                          aria-label="Название новой полки"
                        />
                        <button
                          type="button"
                          disabled={newShelfBusy || !newShelfName.trim()}
                          onClick={() => {
                            const name = newShelfName.trim();
                            if (!name || newShelfBusy) return;
                            setNewShelfBusy(true);
                            void onAddShelf(name)
                              .then(() => {
                                setNewShelfName('');
                                setNewShelfOpen(false);
                              })
                              .finally(() => setNewShelfBusy(false));
                          }}
                          className={`shrink-0 min-h-12 px-4 ${textStyles.bodyBold} ${theme.accentText} ${theme.focusRing} disabled:opacity-50`}
                        >
                          Создать
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNewShelfOpen(true)}
                        className={`w-full min-h-12 px-3 inline-flex items-center justify-center gap-2 ${textStyles.bodyBold} ${theme.accentText} ${radii.button} ${theme.chip} ${theme.focusRing}`}
                      >
                        <FolderPlus className="w-4 h-4" aria-hidden />
                        Новая полка
                      </button>
                    )
                  ) : null}
                  {shelves.length === 0 && !newShelfOpen ? (
                    <EmptyState
                      icon={Folder}
                      title="Полок пока нет"
                      description="Соберите книги в коллекции — на потом, по жанру или автору."
                      actionLabel={onAddShelf ? 'Создать полку' : onGoCatalog ? 'Каталог' : undefined}
                      actionVariant="primary"
                      onAction={onAddShelf ? () => setNewShelfOpen(true) : onGoCatalog}
                    />
                  ) : (
                    shelves.map((s) => (
                      <ShelfCard
                        key={String(s.id)}
                        name={s.name}
                        count={s.bookCount ?? 0}
                        serverConfig={serverConfig}
                        storageDirectory={storageDirectory}
                        previewBookIds={s.previewBookIds}
                        onClick={() => setActiveShelfId(s.id)}
                      />
                    ))
                  )}
                </>
              )}

              {seg === 'shelves' && activeShelfId != null && (
                sectionLoading ? (
                  <BookGridSkeleton count={6} />
                ) : (
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Назад к списку полок"
                        onClick={() => setActiveShelfId(null)}
                        className={`${touchMin} inline-flex items-center gap-1 px-1 ${textStyles.bodyBold} ${theme.accentText} ${theme.focusRing}`}
                      >
                        <ArrowLeft className="w-4 h-4" aria-hidden /> Назад
                      </button>
                      <p className={`${textStyles.title} truncate flex-1 min-w-0`}>{activeShelfName ?? '…'}</p>
                      <ViewModeToggle value={viewMode} onChange={setViewMode} />
                    </div>
                    {sectionError && shelfBooks.length === 0 ? (
                      listError
                    ) : shelfBooks.length === 0 ? (
                      <EmptyState
                        icon={Folder}
                        title="Полка пуста"
                        description="Добавьте сюда книги из библиотеки."
                        actionLabel={onGoCatalog ? 'Каталог' : undefined}
                        actionVariant="primary"
                        onAction={onGoCatalog}
                      />
                    ) : (
                      <CatalogBookList
                        books={shelfBooks}
                        viewMode={viewMode}
                        serverConfig={serverConfig}
                        storageDirectory={storageDirectory}
                        downloadedBookIds={downloadedBookIds}
                        readingProgressByBookId={readingProgressByBookId}
                        readIds={readIds}
                        virtualizeList={false}
                        onBookClick={handleBookTap}
                        onBookLongPress={
                          onBookLongPress
                            ? (book) =>
                                onBookLongPress(book, {
                                  shelfId: activeShelfId ?? undefined,
                                  shelfName: activeShelfName ?? undefined,
                                })
                            : undefined
                        }
                      />
                    )}
                  </div>
                )
              )}

              {(seg === 'favorites' || seg === 'read') && (
                sectionError && !sectionLoading && (seg === 'read' || (authorRows.length === 0 && seriesRows.length === 0 && visibleSectionBooks.length === 0)) ? (
                  listError
                ) : sectionLoading && visibleSectionBooks.length === 0 && (seg !== 'favorites' || (authorRows.length === 0 && seriesRows.length === 0)) ? (
                  <BookGridSkeleton count={6} />
                ) : seg === 'favorites' && authorRows.length === 0 && seriesRows.length === 0 && visibleSectionBooks.length === 0 ? (
                  <EmptyState
                    icon={Heart}
                    title="Избранное пусто"
                    description="Добавляйте книги, авторов и серии из каталога."
                    actionLabel={onGoCatalog ? 'Каталог' : undefined}
                    actionVariant="primary"
                    onAction={onGoCatalog}
                  />
                ) : seg === 'read' && visibleSectionBooks.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="Прочитанных книг пока нет"
                    description="Отмечайте книги прочитанными — они появятся здесь."
                    actionLabel={onGoCatalog ? 'Каталог' : undefined}
                    actionVariant="primary"
                    onAction={onGoCatalog}
                  />
                ) : (
                  <>
                    {seg === 'favorites' && authorRows.length > 0 && (
                      <div className="space-y-0">
                        <h3 className={`${textStyles.sectionLabel} ${theme.textMuted} mb-1`}>Авторы</h3>
                        {authorRows.map((a) => (
                          <EntityPreviewRow
                            key={a.name}
                            name={a.displayName || a.name}
                            count={a.bookCount}
                            serverConfig={isOnline ? serverConfig : null}
                            storageDirectory={storageDirectory}
                            authorKey={a.name}
                            coverBookId={a.coverBookId}
                            onClick={() => onOpenAuthor?.(a.name)}
                          />
                        ))}
                      </div>
                    )}
                    {seg === 'favorites' && seriesRows.length > 0 && (
                      <div className="space-y-0">
                        <h3 className={`${textStyles.sectionLabel} ${theme.textMuted} mb-1`}>Серии</h3>
                        {seriesRows.map((s) => (
                          <EntityPreviewRow
                            key={s.name}
                            name={s.displayName || s.name}
                            count={s.bookCount}
                            serverConfig={isOnline ? serverConfig : null}
                            storageDirectory={storageDirectory}
                            previewBookIds={s.previewBookIds}
                            onClick={() => onOpenSeries?.(s.name)}
                          />
                        ))}
                      </div>
                    )}
                    {visibleSectionBooks.length > 0 && (
                      <div>
                        {seg === 'favorites' && (
                          <h3 className={`${textStyles.sectionLabel} ${theme.textMuted} mb-2`}>Книги</h3>
                        )}
                        <CatalogBookList
                          books={visibleSectionBooks}
                          viewMode={viewMode}
                          serverConfig={serverConfig}
                          storageDirectory={storageDirectory}
                          downloadedBookIds={downloadedBookIds}
                          readingProgressByBookId={readingProgressByBookId}
                          readIds={readIds}
                          virtualizeList={false}
                          onBookClick={handleBookTap}
                          onBookLongPress={onBookLongPress}
                        />
                      </div>
                    )}
                  </>
                )
              )}
          </div>
        )}
      </div>
      <div
        ref={tabsRef}
        className="inpx-chrome inpx-chrome-top absolute inset-x-0 z-20 px-5 pt-1 pb-0.5"
        style={{ top: 'var(--app-header-offset, 4rem)' }}
      >
        {queueChipCount > 0 && onOpenQueue ? (
          <div className="flex justify-end pb-1">
            <button
              type="button"
              onClick={onOpenQueue}
              className={`shrink-0 min-h-11 px-3 ${textStyles.captionBold} ${theme.accentText} ${theme.focusRing}`}
            >
              {queueChipCount} в очереди
            </button>
          </div>
        ) : null}
        <SegmentTabStrip<LibrarySeg>
          tabs={SEG_TABS}
          active={seg}
          tabRefs={segBtnRefs}
          aria-label="Раздел библиотеки"
          onChange={goToSeg}
        />
      </div>
    </div>
  );
}
