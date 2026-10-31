import React from 'react';
import { Heart, Folder, CheckCircle2, AlertCircle, BookMarked, Star, BookOpen } from 'lucide-react';
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
import { LOCAL_BOOK_SORT_OPTIONS, filterBooksLocal, sortBooksLocal, type LocalBookSort } from '../lib/localBookSort';
import LocalBookFilter from './mybooks/LocalBookFilter';
import { BookGridSkeleton, BookListSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { textStyles } from '../ui/tokens';
import { usePageTitle } from '../ui/pageTitle';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import { useBookGridPageSize, useRepageOnSizeChange } from '../hooks/useBookGridPageSize';

import LibraryCollections, { LIBRARY_SEG_LABELS, type LibrarySeg } from './mybooks/LibraryCollections';
import { mergeRecentReadingLists, withoutFinishedReading, type LocalRecentReadingItem } from '../lib/localReadingProgress';
import { isRecentHiddenLocally, recentItemToBook, serverRecentItem } from '../lib/recentReadingBooks';
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
import SortableShelfList from './shelves/SortableShelfList';

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
  /** «Хочу прочитать» ids from the server (undefined before the first sync). */
  wantIds?: Set<string>;
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
  onBookLongPress?: (book: Book, context?: { shelfId?: number | string; shelfName?: string; fromReading?: boolean }) => void;
  /** «Читаю» on this device (books with local progress); merged with the server's `/api/library/continue`. */
  localRecentReading?: LocalRecentReadingItem[];
  onRemoveBooks?: (bookIds: string[]) => void | Promise<void>;
  onAddBooksToShelf?: (shelfId: number | string, bookIds: string[]) => void | Promise<void>;
  onAddShelf?: (name: string) => Promise<number | string | null>;
  onOpenAuthor?: (name: string) => void;
  onOpenSeries?: (name: string) => void;
  onRemoveShelf?: (shelfId: string, kind?: 'shelf' | 'smart') => void | Promise<void | boolean>;
  /** Pin / unpin a server shelf on the home page. */
  onToggleShelfHome?: (shelf: UiShelf) => void | Promise<void>;
  /** Drag in a shelves list: new order of one kind (`shelf:<id>` / `smart:<id>`). */
  onReorderShelves?: (keys: string[]) => void;
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
  /** Open a collection from outside (Profile stat tiles); `n` makes repeats count. */
  openRequest?: { seg: LibrarySeg; n: number } | null;
  onAuthExpired?: () => void;
}

const EMPTY_RECENT: LocalRecentReadingItem[] = [];

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
  localRecentReading = EMPTY_RECENT,
  readIds,
  bookmarkIds,
  wantIds,
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
  onToggleShelfHome,
  onReorderShelves,
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
  openRequest = null,
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
  const smartRequestedPageSize = useBookGridPageSize(viewMode);
  /** What the server actually used for the smart shelf page (older servers always answer 24). */
  const [smartPageSize, setSmartPageSize] = React.useState(smartRequestedPageSize);
  const [bookSort, setBookSort] = React.useState<LocalBookSort>('recent');
  const [bookQuery, setBookQuery] = React.useState('');
  const [sectionBySeg, setSectionBySeg] = React.useState<{ favorites: Book[]; read: Book[]; want: Book[]; rated: Book[] }>({
    favorites: [],
    read: [],
    want: [],
    rated: [],
  });
  /** `/api/library/continue` as recent rows; null until loaded. */
  const [readingServer, setReadingServer] = React.useState<LocalRecentReadingItem[] | null>(null);
  const [sectionLoading, setSectionLoading] = React.useState(false);
  const [sectionError, setSectionError] = React.useState(false);
  const [sectionRetry, setSectionRetry] = React.useState(0);
  const [readerListsError, setReaderListsError] = React.useState(false);
  const [readerListsRetry, setReaderListsRetry] = React.useState(0);
  const [activeShelfKey, setActiveShelfKey] = React.useState<string | null>(null);
  const [smartPage, setSmartPage] = React.useState(1);
  const [smartTotal, setSmartTotal] = React.useState(0);
  useRepageOnSizeChange(smartRequestedPageSize, setSmartPage);
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

  const openRequestSeen = React.useRef(openRequest?.n ?? 0);
  React.useEffect(() => {
    if (!openRequest || openRequest.n === openRequestSeen.current) return;
    openRequestSeen.current = openRequest.n;
    openCollection(openRequest.seg);
  }, [openRequest, openCollection]);

  const closeCollection = React.useCallback(() => {
    setCollectionOpen(false);
    setActiveShelfKey(null);
    setSmartPage(1);
    setNewShelfOpen(false);
  }, []);

  React.useEffect(() => {
    if (seg !== 'favorites' && seg !== 'read' && seg !== 'want' && seg !== 'rated' && seg !== 'reading') return;
    if (!fetchSectionBooks || !isOnline) {
      setSectionLoading(false);
      return;
    }
    const key = seg;
    let cancelled = false;
    setSectionLoading(true);
    setSectionError(false);
    const request = (async () => {
      // /api/library/* pages are capped at 24 on the server; asking for 48 stopped after page 1.
      const pageSize = key === 'favorites' ? 48 : 24;
      const items: InpxBookItem[] = [];
      for (let page = 1; page <= 80; page += 1) {
        const res = key === 'favorites'
          ? await fetchBookmarkedBooks(serverConfig, page, pageSize)
          : await fetchLibraryView(serverConfig, key === 'reading' ? 'continue' : key, page, pageSize);
        items.push(...res.items);
        if (!res.items.length || items.length >= (res.total || items.length) || res.items.length < pageSize) break;
      }
      return items;
    })();
    request
      .then((items) => {
        if (cancelled) return;
        if (key === 'reading') {
          setReadingServer(items.map((b) => serverRecentItem(b as InpxBookItem & { lastOpenedAt?: string })));
          return;
        }
        setSectionBySeg((prev) => ({
          ...prev,
          // «Мои оценки»: the cover stars show the user's own rating.
          [key]: items.map((b) => {
            const book = mapServerBook(b, serverConfig);
            const own = Number((b as InpxBookItem & { myRating?: number }).myRating) || 0;
            return key === 'rated' && own ? { ...book, rating: own } : book;
          }),
        }));
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
  /** Only regular shelves can hold books (picker of «На полку» on the device tab). */
  const regularShelves = React.useMemo(() => shelves.filter((shelf) => shelf.kind !== 'smart'), [shelves]);

  const localReadBooks = React.useMemo(
    () => localOfflineBooks.filter((book) => (readingProgressByBookId?.[book.id] ?? book.readProgress ?? 0) >= 99),
    [localOfflineBooks, readingProgressByBookId],
  );

  // «Читаю»: the server list plus books read here that it does not have yet; read books drop out.
  const readingBooks = React.useMemo(() => {
    const server = isOnline && readingServer
      ? readingServer.filter((item) => !isRecentHiddenLocally(item))
      : [];
    return withoutFinishedReading(mergeRecentReadingLists(server, localRecentReading), readIds, readingProgressByBookId)
      .map((item) => recentItemToBook(item, serverConfig));
  }, [isOnline, readingServer, localRecentReading, readIds, readingProgressByBookId, serverConfig]);

  const visibleSectionBooks = React.useMemo(() => {
    if (seg === 'reading') return readingBooks;
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
    if (seg === 'rated') return sectionBySeg.rated;
    if (seg === 'want') {
      // Server-only list: opened / read books drop out on the server and in wantIds.
      return wantIds ? sectionBySeg.want.filter((b) => wantIds.has(b.id)) : sectionBySeg.want;
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
  }, [seg, sectionBySeg, bookmarkIds, readIds, wantIds, localReadBooks, localOfflineBooks, isOnline, readingBooks]);
  const sortedSectionBooks = React.useMemo(
    () => filterBooksLocal(sortBooksLocal(visibleSectionBooks, bookSort), bookQuery),
    [visibleSectionBooks, bookSort, bookQuery],
  );
  // Smart shelves page on the server — a local filter would only search the visible page.
  const shelfFilterable = activeShelf?.kind !== 'smart';
  const sortedShelfBooks = React.useMemo(
    () => (shelfFilterable ? filterBooksLocal(sortBooksLocal(shelfBooks, bookSort), bookQuery) : sortBooksLocal(shelfBooks, bookSort)),
    [shelfBooks, bookSort, bookQuery, shelfFilterable],
  );
  React.useEffect(() => {
    setBookQuery('');
  }, [seg, activeShelfKey]);
  const bookFilter = (count: number) => (count > 1 ? (
    <div className="mb-3">
      <LocalBookFilter value={bookQuery} onChange={setBookQuery} />
    </div>
  ) : null);
  const noMatches = (shown: number) => (bookQuery.trim() && shown === 0 ? (
    <p className={`py-8 text-center ${textStyles.body} ${theme.textMuted}`}>Ничего не найдено</p>
  ) : null);
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
    const loadMark = smart ? `${activeShelfKey}@${smartPage}/${smartRequestedPageSize}` : activeShelfKey;
    const shelfChanged = lastShelfIdLoaded.current !== loadMark;
    if (shelfChanged) setSectionLoading(true);
    const request = smart
      ? fetchSmartShelfBooks(serverConfig, Number(activeShelf.id), smartPage, smartRequestedPageSize).then((res) => {
          if (shelfLoadGen.current !== gen) return [];
          const total = Number(res.total) || 0;
          setSmartTotal(total);
          setSmartPageSize(Number(res.pageSize) || smartRequestedPageSize);
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
  }, [seg, activeShelf, activeShelfKey, loadShelfBooks, shelfRevision, onAuthExpired, sectionRetry, smartPage, smartRequestedPageSize, serverConfig]);

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
    ...(readingServer || !isOnline ? { reading: readingBooks.length } : {}),
    downloaded: downloadedLibraryBooks.length,
    ...(bookmarkIds ? { favorites: bookmarkIds.size + authorRows.length + seriesRows.length } : {}),
    ...(readIds ? { read: readIds.size } : {}),
    ...(wantIds ? { want: wantIds.size } : {}),
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
              onToggleShelfHome={onToggleShelfHome ? (shelf) => { void onToggleShelfHome(shelf); } : undefined}
              onReorderShelves={onReorderShelves}
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
                      <SortableShelfList
                        shelves={shelves}
                        onReorder={onReorderShelves}
                        label="Порядок полок"
                        renderRow={(s) => (
                          <ShelfCard
                            name={s.name}
                            smart={s.kind === 'smart'}
                            count={s.bookCount ?? 0}
                            serverConfig={serverConfig}
                            storageDirectory={storageDirectory}
                            previewBookIds={s.previewBookIds}
                            onClick={() => selectShelf(s)}
                            onDelete={onRemoveShelf ? () => { void onRemoveShelf(String(s.id), s.kind === 'smart' ? 'smart' : 'shelf'); } : undefined}
                            onHome={Boolean(s.onHome)}
                            onToggleHome={onToggleShelfHome && typeof s.id === 'number' ? () => { void onToggleShelfHome(s); } : undefined}
                          />
                        )}
                      />
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
                    {shelfFilterable ? bookFilter(shelfBooks.length) : null}
                    {shelfBooks.length > 0 ? <div className="mb-3">{bookListTools}</div> : null}
                    {noMatches(sortedShelfBooks.length)}
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
                            pageSize={smartPageSize}
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

              {(seg === 'favorites' || seg === 'read' || seg === 'want' || seg === 'rated' || seg === 'reading') && (
                sectionError && !sectionLoading && (seg !== 'favorites' || (authorRows.length === 0 && seriesRows.length === 0 && visibleSectionBooks.length === 0)) ? (
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
                ) : seg === 'reading' && visibleSectionBooks.length === 0 ? (
                  <EmptyState
                    icon={BookOpen}
                    title="Сейчас ничего не читаете"
                    description="Открытые книги появятся здесь, пока вы их не дочитаете. Список общий с сайтом."
                    actionLabel={onGoCatalog ? 'Каталог' : undefined}
                    actionVariant="primary"
                    onAction={onGoCatalog}
                  />
                ) : seg === 'want' && visibleSectionBooks.length === 0 ? (
                  <EmptyState
                    icon={BookMarked}
                    title={isOnline ? 'Список пуст' : 'Нужно подключение к серверу'}
                    description={isOnline
                      ? 'Нажмите «Хочу прочитать» в карточке книги. Книга уйдёт отсюда, когда вы её откроете или отметите прочитанной.'
                      : '«Хочу прочитать» хранится на сервере.'}
                    actionLabel={isOnline && onGoCatalog ? 'Каталог' : undefined}
                    actionVariant="primary"
                    onAction={onGoCatalog}
                  />
                ) : seg === 'rated' && visibleSectionBooks.length === 0 ? (
                  <EmptyState
                    icon={Star}
                    title={isOnline ? 'Оценок пока нет' : 'Нужно подключение к серверу'}
                    description={isOnline
                      ? 'Поставьте звёзды в карточке книги («Ваша оценка») — оценённые книги соберутся здесь.'
                      : 'Оценки хранятся на сервере.'}
                    actionLabel={isOnline && onGoCatalog ? 'Каталог' : undefined}
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
                        {bookFilter(visibleSectionBooks.length)}
                        <div className="mb-3 flex items-center justify-between gap-2">
                          {seg === 'favorites' ? (
                            <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>Книги</h3>
                          ) : <span />}
                          {bookListTools}
                        </div>
                        {noMatches(sortedSectionBooks.length)}
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
                          onBookLongPress={
                            onBookLongPress && seg === 'reading'
                              ? (book) => onBookLongPress(book, { fromReading: true })
                              : onBookLongPress
                          }
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
