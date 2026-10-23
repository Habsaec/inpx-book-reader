import React from 'react';
import { Heart, Folder, CheckCircle2, AlertCircle } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { FavoriteAuthorItem, FavoriteSeriesItem, UiShelf } from '../lib/inpxClient';
import { mapServerBook, fetchAllReaderBookmarkList, fetchAllReaderAnnotationList, fetchBookmarkedBooks, fetchLibraryView, fetchSmartShelfBooks, isAuthError, shelfKey, type InpxBookItem } from '../lib/inpxClient';
import DeviceLibraryTab from './DeviceLibraryTab';
import CatalogBookList from './catalog/CatalogBookList';
import CatalogPagination from './catalog/CatalogPagination';
import EntityPreviewRow from './EntityPreviewRow';
import ShelfCard from './shelves/ShelfCard';
import ShelfCreateField from './shelves/ShelfCreateField';
import ViewModeToggle from '../ui/ViewModeToggle';
import BookSortBar from './catalog/BookSortBar';
import { LOCAL_BOOK_SORT_OPTIONS, sortBooksLocal, type LocalBookSort } from '../lib/localBookSort';
import { BookGridSkeleton, BookListSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { textStyles } from '../ui/tokens';
import { usePageTitle } from '../ui/pageTitle';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';

/** Server page size of `/api/smart-shelves/:id/books`. */
const SMART_PAGE_SIZE = 24;
import LibraryCollections, { LIBRARY_SEG_LABELS, type LibrarySeg } from './mybooks/LibraryCollections';
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

/** Collections list beside the content instead of drill-in (keep in sync with `min-[900px]:`). */
const WIDE_QUERY = '(min-width: 900px)';

function useWideLayout(): boolean {
  const [wide, setWide] = React.useState(() => window.matchMedia(WIDE_QUERY).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

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
  onRemoveShelf?: (shelfId: string, kind?: 'shelf' | 'smart') => void | Promise<void | boolean>;
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
  onRemoveShelf,
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
  const [collectionOpen, setCollectionOpen] = React.useState(false);
  const wide = useWideLayout();
  const showIndex = !wide && !collectionOpen;
  const downloadedLibraryBooks = React.useMemo(
    () => localOfflineBooks.filter((book) => !isFolderLocalBookId(book.id)),
    [localOfflineBooks],
  );
  const { viewMode, setViewMode } = useCatalogViewMode('books');
  const [bookSort, setBookSort] = React.useState<LocalBookSort>('recent');
  const [sectionBySeg, setSectionBySeg] = React.useState<{ favorites: Book[]; read: Book[] }>({
    favorites: [],
    read: [],
  });
  const [sectionLoading, setSectionLoading] = React.useState(false);
  const [sectionError, setSectionError] = React.useState(false);
  const [sectionRetry, setSectionRetry] = React.useState(0);
  const [readerListsError, setReaderListsError] = React.useState(false);
  const [readerListsRetry, setReaderListsRetry] = React.useState(0);
  const [activeShelfKey, setActiveShelfKey] = React.useState<string | null>(null);
  const [smartPage, setSmartPage] = React.useState(1);
  const [smartTotal, setSmartTotal] = React.useState(0);
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
    setActiveShelfKey(null);
    setSmartPage(1);
    setSeg('downloaded');
    setNewShelfOpen(false);
    setCollectionOpen(false);
  }, [libraryRootEpoch]);

  React.useEffect(() => {
    if (!activeShelfKey) return;
    if (shelves.some((shelf) => shelfKey(shelf) === activeShelfKey)) return;
    setActiveShelfKey(null);
  }, [shelves, activeShelfKey]);

  const authorRows = React.useMemo(() => {
    if (favoriteAuthorItems && favoriteAuthorItems.length > 0) return favoriteAuthorItems;
    return favoriteAuthors.map((name) => ({ name, displayName: name }));
  }, [favoriteAuthorItems, favoriteAuthors]);

  const seriesRows = React.useMemo(() => {
    if (favoriteSeriesItems && favoriteSeriesItems.length > 0) return favoriteSeriesItems;
    return favoriteSeries.map((name) => ({ name, displayName: name }));
  }, [favoriteSeriesItems, favoriteSeries]);

  const selectShelf = React.useCallback((shelf: UiShelf) => {
    setSeg('shelves');
    setSmartPage(1);
    setActiveShelfKey(shelfKey(shelf));
    setNewShelfOpen(false);
    setCollectionOpen(true);
  }, []);

  const openCollection = React.useCallback(
    (next: LibrarySeg, options: { newShelf?: boolean } = {}) => {
      setSeg(next);
      setSmartPage(1);
      setActiveShelfKey(null);
      setNewShelfOpen(Boolean(options.newShelf));
      setCollectionOpen(true);
    },
    [],
  );

  const closeCollection = React.useCallback(() => {
    setCollectionOpen(false);
    setActiveShelfKey(null);
    setSmartPage(1);
    setNewShelfOpen(false);
  }, []);

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

  const activeShelf = React.useMemo(
    () => shelves.find((shelf) => shelfKey(shelf) === activeShelfKey) ?? null,
    [shelves, activeShelfKey],
  );
  const inShelfDrilldown = seg === 'shelves' && activeShelf != null;
  const activeShelfName = activeShelf?.name;
  const shelfRevision = React.useMemo(
    () => shelves.map((s) => `${shelfKey(s)}:${s.bookCount ?? 0}`).join('|'),
    [shelves],
  );
  const regularShelves = React.useMemo(() => shelves.filter((shelf) => shelf.kind !== 'smart'), [shelves]);
  const smartShelves = React.useMemo(() => shelves.filter((shelf) => shelf.kind === 'smart'), [shelves]);

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
  const sortedSectionBooks = React.useMemo(
    () => sortBooksLocal(visibleSectionBooks, bookSort),
    [visibleSectionBooks, bookSort],
  );
  const sortedShelfBooks = React.useMemo(() => sortBooksLocal(shelfBooks, bookSort), [shelfBooks, bookSort]);
  const bookListTools = (
    <div className="flex items-center justify-end gap-1 min-w-0">
      <BookSortBar
        value={bookSort}
        options={LOCAL_BOOK_SORT_OPTIONS}
        onChange={(id) => setBookSort(id as LocalBookSort)}
      />
      <ViewModeToggle value={viewMode} onChange={setViewMode} />
    </div>
  );

  const shelfLoadGen = React.useRef(0);
  const lastShelfIdLoaded = React.useRef<number | string | null>(null);

  React.useEffect(() => {
    const smart = activeShelf?.kind === 'smart';
    if (seg !== 'shelves' || activeShelf == null || (!smart && !loadShelfBooks)) {
      shelfLoadGen.current += 1;
      setShelfBooks([]);
      setSmartTotal(0);
      lastShelfIdLoaded.current = null;
      return;
    }
    const gen = ++shelfLoadGen.current;
    const loadMark = smart ? `${activeShelfKey}@${smartPage}` : activeShelfKey;
    const shelfChanged = lastShelfIdLoaded.current !== loadMark;
    if (shelfChanged) setSectionLoading(true);
    const request = smart
      ? fetchSmartShelfBooks(serverConfig, Number(activeShelf.id), smartPage).then((res) => {
          if (shelfLoadGen.current !== gen) return [];
          const total = Number(res.total) || 0;
          setSmartTotal(total);
          return (res.items || []).map((book) => mapServerBook(book, serverConfig));
        })
      : loadShelfBooks!(activeShelf.id);
    request
      .then((books) => {
        if (shelfLoadGen.current !== gen) return;
        lastShelfIdLoaded.current = loadMark;
        setShelfBooks(books);
        if (!smart) setSmartTotal(books.length);
        setSectionError(false);
      })
      .catch((e: unknown) => {
        if (shelfLoadGen.current !== gen) return;
        setShelfBooks([]);
        setSmartTotal(0);
        setSectionError(true);
        if (isAuthError(e)) onAuthExpired?.();
      })
      .finally(() => {
        if (shelfLoadGen.current === gen) setSectionLoading(false);
      });
    return () => {
      shelfLoadGen.current += 1;
    };
  }, [seg, activeShelf, activeShelfKey, loadShelfBooks, shelfRevision, onAuthExpired, sectionRetry, smartPage, serverConfig]);

  const drilledIn = isTabActive && !wide && collectionOpen;
  usePageTitle(inShelfDrilldown ? activeShelfName ?? 'Полка' : LIBRARY_SEG_LABELS[seg], closeCollection, drilledIn);
  useOverlayBackHandler(drilledIn, closeCollection);

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

  const collectionCounts: Partial<Record<LibrarySeg, number>> = {
    downloaded: downloadedLibraryBooks.length,
    ...(bookmarkIds ? { favorites: bookmarkIds.size + authorRows.length + seriesRows.length } : {}),
    ...(readIds ? { read: readIds.size } : {}),
  };

  return (
    <div className="relative flex flex-1 min-h-0 h-full overflow-hidden">
      {wide || showIndex ? (
        <div
          className={`min-h-0 overflow-y-auto inpx-page-scroll px-5 min-[600px]:px-8 ${
            wide ? `w-[21.25rem] shrink-0 border-r ${theme.divider}` : 'flex-1'
          }`}
        >
          <div className={wide ? '' : 'mx-auto max-w-[45rem]'}>
            <LibraryCollections
              seg={seg}
              activeShelfKey={activeShelfKey}
              highlightCurrent={wide}
              counts={collectionCounts}
              shelves={shelves}
              queueCount={queueChipCount}
              onOpenQueue={onOpenQueue}
              onSelect={(next) => openCollection(next)}
              onSelectShelf={selectShelf}
              onRemoveShelf={
                onRemoveShelf
                  ? (shelf) => { void onRemoveShelf(String(shelf.id), shelf.kind === 'smart' ? 'smart' : 'shelf'); }
                  : undefined
              }
              onNewShelf={onAddShelf ? () => openCollection('shelves', { newShelf: true }) : undefined}
            />
          </div>
        </div>
      ) : null}
      {showIndex ? null : (
      <div className="relative flex-1 min-w-0 min-h-0">
      <div className="inpx-books-pane absolute inset-0 min-h-0 flex flex-col">
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
            shelves={regularShelves}
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
              {seg === 'shelves' && activeShelf == null && (
                <>
                  {onAddShelf ? (
                    <ShelfCreateField
                      open={newShelfOpen}
                      name={newShelfName}
                      busy={newShelfBusy}
                      onOpen={() => setNewShelfOpen(true)}
                      onClose={() => {
                        setNewShelfOpen(false);
                        setNewShelfName('');
                      }}
                      onNameChange={setNewShelfName}
                      onSubmit={() => {
                        const name = newShelfName.trim();
                        if (!name || newShelfBusy) return;
                        setNewShelfBusy(true);
                        void onAddShelf(name)
                          .then((id) => {
                            if (id == null) return;
                            setNewShelfName('');
                            setNewShelfOpen(false);
                          })
                          .finally(() => setNewShelfBusy(false));
                      }}
                    />
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
                    <>
                      {regularShelves.map((s) => (
                        <ShelfCard
                          key={shelfKey(s)}
                          name={s.name}
                          count={s.bookCount ?? 0}
                          serverConfig={serverConfig}
                          storageDirectory={storageDirectory}
                          previewBookIds={s.previewBookIds}
                          onClick={() => selectShelf(s)}
                          onDelete={onRemoveShelf ? () => { void onRemoveShelf(String(s.id), 'shelf'); } : undefined}
                        />
                      ))}
                      {smartShelves.length > 0 ? (
                        <h3 className={`${textStyles.sectionLabel} ${theme.text} mt-6 mb-1`}>Умные полки</h3>
                      ) : null}
                      {smartShelves.map((s) => (
                        <ShelfCard
                          key={shelfKey(s)}
                          name={s.name}
                          smart
                          count={s.bookCount ?? 0}
                          serverConfig={serverConfig}
                          storageDirectory={storageDirectory}
                          previewBookIds={s.previewBookIds}
                          onClick={() => selectShelf(s)}
                          onDelete={onRemoveShelf ? () => { void onRemoveShelf(String(s.id), 'smart'); } : undefined}
                        />
                      ))}
                    </>
                  )}
                </>
              )}

              {seg === 'shelves' && activeShelf != null && (
                sectionLoading ? (
                  <BookGridSkeleton count={6} />
                ) : (
                  <div>
                    {wide ? <h2 className={`${textStyles.sectionLabel} ${theme.text} mb-3 truncate`}>{activeShelfName ?? '…'}</h2> : null}
                    <div className="mb-3 flex items-center justify-between gap-2">
                      {onRemoveShelf ? (
                        <button
                          type="button"
                          onClick={() => { void onRemoveShelf(String(activeShelf.id), activeShelf.kind === 'smart' ? 'smart' : 'shelf'); }}
                          className={`shrink-0 min-h-12 ${textStyles.bodyBold} text-[var(--app-danger)] ${theme.focusRing}`}
                        >
                          Удалить полку
                        </button>
                      ) : <span />}
                      {shelfBooks.length > 0 ? bookListTools : null}
                    </div>
                    {sectionError && shelfBooks.length === 0 ? (
                      listError
                    ) : shelfBooks.length === 0 ? (
                      <EmptyState
                        icon={Folder}
                        title={activeShelf.kind === 'smart' ? 'По фильтру ничего не нашлось' : 'Полка пуста'}
                        description={activeShelf.kind === 'smart' ? 'Книги подберутся, когда в каталоге появятся совпадения.' : 'Добавьте сюда книги из библиотеки.'}
                        actionLabel={activeShelf.kind === 'smart' ? undefined : onGoCatalog ? 'Каталог' : undefined}
                        actionVariant="primary"
                        onAction={activeShelf.kind === 'smart' ? undefined : onGoCatalog}
                      />
                    ) : (
                      <>
                        <CatalogBookList
                          books={sortedShelfBooks}
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
                                  onBookLongPress(
                                    book,
                                    activeShelf.kind === 'smart'
                                      ? undefined
                                      : {
                                          shelfId: activeShelf.id,
                                          shelfName: activeShelfName ?? undefined,
                                        },
                                  )
                              : undefined
                          }
                        />
                        {activeShelf.kind === 'smart' ? (
                          <CatalogPagination
                            page={smartPage}
                            pageSize={SMART_PAGE_SIZE}
                            total={smartTotal}
                            onPageChange={setSmartPage}
                            isAppDark={isAppDark}
                          />
                        ) : null}
                      </>
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
                        <h3 className={`${textStyles.sectionLabel} ${theme.text} mb-1`}>Авторы</h3>
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
                        <h3 className={`${textStyles.sectionLabel} ${theme.text} mb-1`}>Серии</h3>
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
                        <div className="mb-3 flex items-center justify-between gap-2">
                          {seg === 'favorites' ? (
                            <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>Книги</h3>
                          ) : <span />}
                          {bookListTools}
                        </div>
                        <CatalogBookList
                          books={sortedSectionBooks}
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
      </div>
      )}
    </div>
  );
}
