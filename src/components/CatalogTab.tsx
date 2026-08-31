import React from 'react';
import { theme } from '../lib/appTheme';
import { Book, ServerConfig } from '../types';
import {
  CatalogBookSort,
  CatalogEntitySort,
  fetchGenres,
  fetchSearchGenres,
  fetchAllFacetBooks,
  mapServerBook,
  displayCoverUrl,
  bookContentUrl,
  isAuthError,
  isUnreachableServerError,
} from '../lib/inpxClient';
import { useBackHandler } from '../hooks/useBackHandler';
import { useHorizontalTabSwipe } from '../hooks/useHorizontalTabSwipe';
import {
  AlertCircle,
  RotateCcw,
  WifiOff,
} from 'lucide-react';
import { useDragControls } from 'motion/react';
import { BookListSkeleton } from '../ui/Skeleton';
import { useCatalogSearch } from '../hooks/useCatalogSearch';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useCatalogData } from '../hooks/useCatalogData';
import { useCatalogBookPool } from '../hooks/useCatalogBookPool';
import PullToRefresh from './PullToRefresh';
import CatalogSearchHeader from './catalog/CatalogSearchHeader';
import CatalogBrowseLanding from './catalog/CatalogBrowseLanding';
import CatalogEntityLists from './catalog/CatalogEntityLists';
import CatalogDrilldownPanel from './catalog/CatalogDrilldownPanel';
import CatalogBooksView from './catalog/CatalogBooksView';
import CatalogSearchHintsBanner from './catalog/CatalogSearchHints';
import BookDetailsSheet from './catalog/BookDetailsSheet';
import { pushRecentBrowse } from '../lib/recentBrowseHistory';
import {
  CATALOG_BROWSE_ROOT,
  CATALOG_BROWSE_TABS,
  CATALOG_SEARCH_TABS,
  type CatalogSubTab as SubTab,
  type DemoBookSort,
  type CatalogFormatFilter,
  type CatalogHasSeriesFilter,
} from './catalog/catalogTypes';
import { textStyles, semantic } from '../ui/tokens';
import { useSnackbar } from '../ui/Snackbar';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { CatalogFilterDraft, CatalogGenreOption } from './catalog/CatalogFilterSheet';

interface CatalogTabProps {
  serverConfig: ServerConfig;
  onEnqueueDownload: (book: Book) => void | Promise<void>;
  downloadedBookIds: string[];
  downloadingId?: string | null;
  queuedBookIds?: Set<string>;
  onOpenBook: (book: Book) => void;
  favoriteAuthors: string[];
  onToggleFavoriteAuthor: (authorName: string) => void;
  favoriteSeries: string[];
  onToggleFavoriteSeries: (seriesName: string) => void;
  bookmarkIds?: Set<string>;
  readIds?: Set<string>;
  readingProgressByBookId?: Record<string, number>;
  onToggleBookBookmark?: (bookId: string) => void;
  onToggleRead?: (bookId: string) => void;
  isAppDark: boolean;
  storageDirectory?: StorageDirectory | null;

  subTab?: SubTab;
  onSubTabChange?: (subTab: SubTab) => void;
  selectedAuthor?: string | null;
  onSelectedAuthorChange?: (author: string | null) => void;
  selectedSeries?: string | null;
  onSelectedSeriesChange?: (series: string | null) => void;
  selectedSubgenre?: { parent: string; name: string } | null;
  onSelectedSubgenreChange?: (subgenre: { parent: string; name: string } | null) => void;
  isTabActive?: boolean;
  returnToPreviousTab?: string | null;
  onReturnToPreviousTab?: () => void;
  /** Clear cross-tab return target (search / filter clear / leaving deep-link). */
  onClearReturnTo?: () => void;
  /** External deep-link epoch — reset local search when bumped. */
  catalogNavEpoch?: number;
  /** Apply this query as catalog search (home bar). Survives first mount after a nav epoch bump. */
  pendingSearchQuery?: string | null;
  onConsumePendingSearch?: () => void;
  onBookLongPress?: (book: Book) => void;
  onAuthExpired?: () => void;
  onConnectionLost?: () => void;
}

export default function CatalogTab({
  serverConfig,
  onEnqueueDownload,
  downloadedBookIds,
  downloadingId = null,
  queuedBookIds,
  onOpenBook,
  favoriteAuthors,
  onToggleFavoriteAuthor,
  favoriteSeries,
  onToggleFavoriteSeries,
  bookmarkIds,
  readIds,
  readingProgressByBookId,
  onToggleBookBookmark,
  onToggleRead,
  isAppDark,
  storageDirectory,

  subTab: propSubTab,
  onSubTabChange,
  selectedAuthor: propSelectedAuthor,
  onSelectedAuthorChange,
  selectedSeries: propSelectedSeries,
  onSelectedSeriesChange,
  selectedSubgenre: propSelectedSubgenre,
  onSelectedSubgenreChange,
  isTabActive = true,
  returnToPreviousTab = null,
  onReturnToPreviousTab,
  onClearReturnTo,
  catalogNavEpoch = 0,
  pendingSearchQuery = null,
  onConsumePendingSearch,
  onBookLongPress,
  onAuthExpired,
  onConnectionLost,
}: CatalogTabProps) {
  const [localSubTab, setLocalSubTab] = React.useState<SubTab>(CATALOG_BROWSE_ROOT);
  const subTab = propSubTab !== undefined ? propSubTab : localSubTab;
  const setSubTab = onSubTabChange || setLocalSubTab;

  const isServerConnectedEarly =
    Boolean(serverConfig.url) && serverConfig.connectionStatus === 'connected';

  const {
    searchInput,
    setSearchInput,
    liveQuery,
    submitSearch,
    clearSearch,
    isSearchActive,
  } = useCatalogSearch(serverConfig, isServerConnectedEarly, subTab);
  const { history: searchHistory, addQuery: addSearchQuery, removeQuery: removeSearchQuery, clearHistory: clearSearchHistory } = useSearchHistory();

  const incomingSearch = pendingSearchQuery?.trim() ?? '';

  /** idle → results (books + field chips; no search hub) */
  const [searchPhase, setSearchPhase] = React.useState<'idle' | 'results'>('idle');

  const searchMode = (searchPhase === 'results' && isSearchActive) || incomingSearch.length > 0;

  // Live list filter: browse filters current section; in search mode keeps results in sync while typing.
  const listQuery = searchMode
    ? (liveQuery || incomingSearch)
    : subTab === 'authors' || subTab === 'series' || subTab === 'genres'
      ? liveQuery
      : '';

  // Clearing the box in search mode returns to catalog root (Авторы) immediately —
  // don't wait for liveQuery debounce (avoids a spurious empty-query catalog fetch).
  React.useEffect(() => {
    if (searchPhase !== 'results') return;
    if (searchInput.trim()) return;
    clearSearch();
    setSearchPhase('idle');
    setSubTab(CATALOG_BROWSE_ROOT);
  }, [searchInput, searchPhase, clearSearch, setSubTab]);

  const [selectedBook, setSelectedBook] = React.useState<Book | null>(null);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [seriesDownloadBusy, setSeriesDownloadBusy] = React.useState(false);
  const catalogScrollRef = React.useRef<HTMLDivElement>(null);
  const snackbar = useSnackbar();

  // Filtering & Sorting states (серверные сортировки — как /lite/catalog)
  const [catalogSort, setCatalogSort] = React.useState<CatalogBookSort>('title');
  const [entitySort, setEntitySort] = React.useState<CatalogEntitySort>('name');
  const [sortBy, setSortBy] = React.useState<'rating' | 'downloads' | 'title' | 'year' | 'size'>('rating');
  const [minRating, setMinRating] = React.useState<number>(0);
  const [formatFilter, setFormatFilter] = React.useState<'all' | 'fb2' | 'epub' | 'txt'>('all');
  const [genreFilters, setGenreFilters] = React.useState<string[]>([]);
  const [yearFilter, setYearFilter] = React.useState(0);
  const [hasSeriesFilter, setHasSeriesFilter] = React.useState<CatalogHasSeriesFilter>('any');
  const [genreOptions, setGenreOptions] = React.useState<CatalogGenreOption[]>([]);
  // Author / Series / Genre selections for drilldown views
  const [localSelectedAuthor, setLocalSelectedAuthor] = React.useState<string | null>(null);
  const selectedAuthor = propSelectedAuthor !== undefined ? propSelectedAuthor : localSelectedAuthor;
  const setSelectedAuthor = onSelectedAuthorChange || setLocalSelectedAuthor;

  const [localSelectedSeries, setLocalSelectedSeries] = React.useState<string | null>(null);
  const selectedSeries = propSelectedSeries !== undefined ? propSelectedSeries : localSelectedSeries;
  const setSelectedSeries = onSelectedSeriesChange || setLocalSelectedSeries;

  const [localSelectedSubgenre, setLocalSelectedSubgenre] = React.useState<{ parent: string; name: string } | null>(null);
  const selectedSubgenre = propSelectedSubgenre !== undefined ? propSelectedSubgenre : localSelectedSubgenre;
  const setSelectedSubgenre = onSelectedSubgenreChange || setLocalSelectedSubgenre;

  // Sorting for aggregation lists (демо / локальный режим)
  const [authorSortBy, setAuthorSortBy] = React.useState<'rating' | 'count' | 'name'>('count');
  const [seriesSortBy, setSeriesSortBy] = React.useState<'rating' | 'count' | 'name'>('count');

  const bookSheetDrag = useDragControls();

  // Expanded parents in hierarchical genre list
  const [expandedGenres, setExpandedGenres] = React.useState<Record<string, boolean>>({
    'Художественная литература': true,
    'Развлекательное': true
  });

  const isServerConnected = isServerConnectedEarly;

  React.useEffect(() => {
    if (!isServerConnected || !isTabActive) {
      if (!isServerConnected) setGenreOptions([]);
      return;
    }
    let cancelled = false;
    void fetchGenres(serverConfig)
      .then((data) => {
        if (cancelled) return;
        const flat =
          data.items.length > 0
            ? data.items
            : data.groups.flatMap((g) => g.items);
        setGenreOptions(
          flat
            .map((g) => ({ name: g.name, displayName: g.displayName }))
            .sort((a, b) =>
              (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '', 'ru', {
                sensitivity: 'base',
              }),
            ),
        );
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (isAuthError(e)) onAuthExpired?.();
        else if (isUnreachableServerError(e)) onConnectionLost?.();
        // Keep previous options on transient errors — clearing looks like "no genres".
      });
    return () => {
      cancelled = true;
    };
  }, [isServerConnected, isTabActive, serverConfig.url, serverConfig.deviceToken, serverConfig.username, serverConfig.password]);

  const handleCatalogReconnectReset = React.useCallback(() => {
    setSelectedAuthor(null);
    setSelectedSeries(null);
    setSelectedSubgenre(null);
    clearSearch();
    setSearchPhase('idle');
  }, [clearSearch, setSelectedAuthor, setSelectedSeries, setSelectedSubgenre]);

  const catalog = useCatalogData({
    serverConfig,
    isServerConnected,
    subTab,
    debouncedSearch: listQuery,
    searchInput,
    catalogSort,
    entitySort,
    selectedAuthor,
    selectedSeries,
    selectedSubgenre,
    minRating,
    formatFilter,
    genreFilter: genreFilters,
    yearFilter,
    hasSeriesFilter,
    // Hidden tab stays mounted — do not hit browse/catalog APIs until visible.
    pauseListFetch: !isTabActive,
    onReconnectReset: handleCatalogReconnectReset,
    onAuthExpired,
    onConnectionLost,
  });

  const {
    booksLoading,
    booksLoadingMore,
    browseLoading,
    booksList,
    searchHints,
    listPage,
    listTotal,
    listPageSize,
    facetPage,
    setFacetPage,
    facetTotal,
    facetPageSize,
    error,
    serverAuthors,
    serverSeries,
    serverGenreGroups,
    facetBooks,
    authorGrouped,
    authorOutsideSeries,
    setAuthorOutsideSeries,
    facetLoading,
    isRefreshing,
    hasMoreBooks,
    loadMoreBooks,
    refreshCatalog,
    handleListPageChange: changeListPage,
  } = catalog;

  const scrollCatalogToTop = (behavior: ScrollBehavior = 'smooth') => {
    catalogScrollRef.current?.scrollTo({ top: 0, behavior });
  };

  const handleListPageChange = React.useCallback((p: number) => {
    changeListPage(p);
    scrollCatalogToTop();
  }, [changeListPage]);

  const scrollStorageKey = [
    'inpx_catalog_scroll',
    subTab,
    selectedAuthor || '',
    selectedSeries || '',
    selectedSubgenre?.name || '',
    authorOutsideSeries ? 'out' : '',
  ].join('|');

  React.useEffect(() => {
    const el = catalogScrollRef.current;
    if (!el || !isTabActive) return;
    const onScroll = () => {
      sessionStorage.setItem(scrollStorageKey, String(el.scrollTop));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollStorageKey, isTabActive]);

  React.useEffect(() => {
    if (selectedBook || !isTabActive) return;
    const saved = sessionStorage.getItem(scrollStorageKey);
    // Always reset when key has no saved position — otherwise previous list scroll sticks.
    requestAnimationFrame(() => {
      catalogScrollRef.current?.scrollTo({ top: saved ? Number(saved) : 0 });
    });
  }, [selectedBook, isTabActive, scrollStorageKey]);

  // Reader / inactive tab: drop local details sheet so its Back handler cannot steal return.
  React.useEffect(() => {
    if (!isTabActive) setSelectedBook(null);
  }, [isTabActive]);

  const catalogNavEpochRef = React.useRef(catalogNavEpoch);
  React.useLayoutEffect(() => {
    const pending = pendingSearchQuery?.trim() ?? '';
    const epochChanged = catalogNavEpoch !== catalogNavEpochRef.current;
    if (!epochChanged && !pending) return;
    catalogNavEpochRef.current = catalogNavEpoch;

    setMinRating(0);
    setFormatFilter('all');
    setGenreFilters([]);
    setYearFilter(0);
    setHasSeriesFilter('any');
    setSelectedBook(null);
    setDownloadError(null);
    setAuthorOutsideSeries(false);

    if (pending) {
      submitSearch(pending);
      setSubTab('books');
      setSearchPhase('results');
      onConsumePendingSearch?.();
      return;
    }

    // External deep-link / catalog root entry — drop leftover search UI.
    clearSearch();
    setSearchPhase('idle');
    // Match openAuthorPage / openSeriesPage sort defaults for deep-links.
    if (selectedSeries) setCatalogSort('series');
    else if (selectedAuthor) setCatalogSort('rating');
  }, [
    catalogNavEpoch,
    pendingSearchQuery,
    submitSearch,
    setSubTab,
    onConsumePendingSearch,
    clearSearch,
    setAuthorOutsideSeries,
    selectedAuthor,
    selectedSeries,
  ]);

  React.useEffect(() => {
    setDownloadError(null);
  }, [selectedBook?.id]);

  /** Genre to restore when Back from series/author opened from a genre book card. */
  const entityReturnGenreRef = React.useRef<{ parent: string; name: string } | null>(null);
  /** catalogSort before entering series/author — restore on step-back. */
  const drillSortReturnRef = React.useRef<CatalogBookSort | null>(null);

  const restoreDrillSort = React.useCallback((fallback: CatalogBookSort) => {
    const prev = drillSortReturnRef.current;
    drillSortReturnRef.current = null;
    setCatalogSort(prev || fallback);
  }, []);

  const handleDrillDownBack = React.useCallback(() => {
    // Outside-series is only meaningful on the author hub (no series open).
    if (authorOutsideSeries && !selectedSeries) {
      setAuthorOutsideSeries(false);
      return;
    }
    // Серия внутри страницы автора — один шаг вверх по drill-down.
    if (selectedSeries && selectedAuthor) {
      setSelectedSeries(null);
      setAuthorOutsideSeries(false);
      restoreDrillSort('rating');
      return;
    }
    // Пришли из избранного/другой вкладки — не оставлять на списке «Авторы»/«Серии».
    if (returnToPreviousTab && (selectedSeries || selectedAuthor || selectedSubgenre)) {
      entityReturnGenreRef.current = null;
      drillSortReturnRef.current = null;
      onReturnToPreviousTab?.();
      return;
    }
    if (selectedSeries) {
      setSelectedSeries(null);
      setAuthorOutsideSeries(false);
      const returnGenre = entityReturnGenreRef.current;
      entityReturnGenreRef.current = null;
      if (returnGenre) {
        setSelectedSubgenre(returnGenre);
        restoreDrillSort('rating');
      } else {
        restoreDrillSort('title');
      }
      return;
    }
    if (selectedAuthor) {
      setSelectedAuthor(null);
      setAuthorOutsideSeries(false);
      const returnGenre = entityReturnGenreRef.current;
      entityReturnGenreRef.current = null;
      if (returnGenre) {
        setSelectedSubgenre(returnGenre);
        restoreDrillSort('rating');
      } else {
        restoreDrillSort('rating');
      }
      return;
    }
    if (selectedSubgenre) {
      setSelectedSubgenre(null);
    }
  }, [
    authorOutsideSeries,
    selectedSeries,
    selectedAuthor,
    selectedSubgenre,
    returnToPreviousTab,
    onReturnToPreviousTab,
    setSelectedAuthor,
    setSelectedSeries,
    setSelectedSubgenre,
    setAuthorOutsideSeries,
    restoreDrillSort,
  ]);

  useBackHandler(() => {
    if (selectedBook) {
      setSelectedBook(null);
      return true;
    }
    if (!isTabActive) return false;
    if (selectedAuthor || selectedSeries || selectedSubgenre || authorOutsideSeries) {
      handleDrillDownBack();
      return true;
    }
    if (searchPhase === 'results' && isSearchActive) {
      clearSearch();
      setSearchPhase('idle');
      setSubTab(CATALOG_BROWSE_ROOT);
      setMinRating(0);
      setFormatFilter('all');
      setGenreFilters([]);
      setYearFilter(0);
      setHasSeriesFilter('any');
      onClearReturnTo?.();
      return true;
    }
    if (subTab !== CATALOG_BROWSE_ROOT) {
      setSubTab(CATALOG_BROWSE_ROOT);
      return true;
    }
    return false;
  }, isTabActive);

  const searchPlaceholder = isServerConnected
    ? 'Книга, автор или серия'
    : 'Поиск по названию, автору, серии…';

  const handleDownload = async (book: Book) => {
    if (!isServerConnected) {
      setDownloadError('Подключитесь к серверу в настройках');
      return;
    }

    setDownloadError(null);
    try {
      await onEnqueueDownload(book);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Не удалось добавить в очередь';
      setDownloadError(message);
    }
  };

  const handleDownloadSeries = async (seriesName: string, author?: string | null) => {
    if (!isServerConnected) {
      snackbar.show('Подключитесь к серверу в настройках', undefined, 'error');
      return;
    }
    if (!seriesName || seriesDownloadBusy) return;
    setSeriesDownloadBusy(true);
    try {
      const items = await fetchAllFacetBooks(serverConfig, 'series', seriesName, {
        author: author || undefined,
        sort: 'series',
      });
      const books = items.map(
        (item) => mapServerBook(item, serverConfig, { preferredSeries: seriesName }) as Book,
      );
      const queued = queuedBookIds || new Set<string>();
      const pending = books.filter(
        (book) => !downloadedBookIds.includes(book.id) && !queued.has(book.id),
      );
      if (!pending.length) {
        snackbar.show('Все книги серии уже скачаны');
        return;
      }
      let added = 0;
      for (const book of pending) {
        try {
          await onEnqueueDownload(book);
          added += 1;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Не удалось добавить в очередь';
          snackbar.show(message, undefined, 'error');
          break;
        }
      }
      if (added > 0) {
        snackbar.show(added === 1 ? 'В очередь: 1 книга' : `В очередь: ${added} книг`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Не удалось получить список серии';
      snackbar.show(message, undefined, 'error');
    } finally {
      setSeriesDownloadBusy(false);
    }
  };

  const applyCatalogFilters = React.useCallback((next: CatalogFilterDraft) => {
    setMinRating(next.minRating);
    setFormatFilter(next.formatFilter);
    setGenreFilters(Array.isArray(next.genreFilters) ? next.genreFilters : []);
    setYearFilter(next.yearFilter);
    setHasSeriesFilter(next.hasSeriesFilter);
    setSortBy(next.sortBy);
  }, []);

  const resolveFilterGenreOptions = React.useCallback(async (): Promise<CatalogGenreOption[]> => {
    if (!isServerConnected) return genreOptions;

    const year =
      yearFilter >= 1800 && yearFilter <= 2100 ? yearFilter : undefined;
    const hasScope =
      Boolean(listQuery.trim()) ||
      formatFilter !== 'all' ||
      Boolean(year) ||
      minRating >= 1 ||
      hasSeriesFilter !== 'any';

    if (!hasScope) return genreOptions;

    try {
      const data = await fetchSearchGenres(serverConfig, {
        q: listQuery.trim() || undefined,
        format: formatFilter !== 'all' ? formatFilter : undefined,
        year,
        minRate: minRating >= 1 ? minRating : undefined,
        hasSeries:
          hasSeriesFilter === 'yes' ? 1 : hasSeriesFilter === 'no' ? 0 : undefined,
      });
      let items: CatalogGenreOption[] = (data.items || []).map((g) => ({
        name: g.name,
        displayName: g.displayName,
        bookCount: g.bookCount,
      }));
      for (const code of genreFilters) {
        if (!items.some((g) => g.name === code)) {
          const fromAll = genreOptions.find((g) => g.name === code);
          items = [
            {
              name: code,
              displayName: fromAll?.displayName || code,
            },
            ...items,
          ];
        }
      }
      return items.length ? items : genreOptions;
    } catch {
      return genreOptions;
    }
  }, [
    isServerConnected,
    genreOptions,
    listQuery,
    formatFilter,
    yearFilter,
    minRating,
    hasSeriesFilter,
    genreFilters,
    serverConfig,
  ]);

  const clearBookFilters = React.useCallback(() => {
    setMinRating(0);
    setFormatFilter('all');
    setGenreFilters([]);
    setYearFilter(0);
    setHasSeriesFilter('any');
  }, []);

  const clearAllFilters = React.useCallback(() => {
    clearBookFilters();
    // «Вне серий» empty CTA — step back to author hub, don't wipe the author.
    if (authorOutsideSeries && selectedAuthor && !selectedSeries) {
      setAuthorOutsideSeries(false);
      return;
    }
    // On a genre page keep the genre; only reset book filters.
    if (selectedSubgenre && !selectedAuthor && !selectedSeries) return;
    setSelectedAuthor(null);
    setSelectedSeries(null);
    setSelectedSubgenre(null);
    entityReturnGenreRef.current = null;
    drillSortReturnRef.current = null;
    setAuthorOutsideSeries(false);
    onClearReturnTo?.();
  }, [
    clearBookFilters,
    authorOutsideSeries,
    selectedSubgenre,
    selectedAuthor,
    selectedSeries,
    setSelectedAuthor,
    setSelectedSeries,
    setSelectedSubgenre,
    setAuthorOutsideSeries,
    onClearReturnTo,
  ]);

  const handleBookClick = (book: Book) => {
    setSelectedBook(book);
  };

  const openAuthorPage = (authorName: string) => {
    setSelectedBook(null);
    setSelectedSeries(null);
    entityReturnGenreRef.current = selectedSubgenre
      ? { parent: selectedSubgenre.parent, name: selectedSubgenre.name }
      : null;
    setSelectedSubgenre(null);
    setAuthorOutsideSeries(false);
    clearBookFilters();
    drillSortReturnRef.current = catalogSort;
    setCatalogSort('rating');
    setSelectedAuthor(authorName);
    scrollCatalogToTop('auto');
    pushRecentBrowse({ kind: 'author', name: authorName });
  };

  /**
   * Open a series entity page.
   * @param filterAuthor - if passed (incl. null), replace selectedAuthor; if omitted, keep current.
   */
  const openSeriesPage = (seriesName: string, filterAuthor?: string | null) => {
    setSelectedBook(null);
    setAuthorOutsideSeries(false);
    if (selectedSubgenre) {
      entityReturnGenreRef.current = {
        parent: selectedSubgenre.parent,
        name: selectedSubgenre.name,
      };
    }
    setSelectedSubgenre(null);
    setSelectedSeries(seriesName);
    clearBookFilters();
    drillSortReturnRef.current = catalogSort;
    setCatalogSort('series');
    if (filterAuthor !== undefined) {
      setSelectedAuthor(filterAuthor);
    }
    scrollCatalogToTop('auto');
    pushRecentBrowse({ kind: 'series', name: seriesName });
  };

  // Build Aggregations (Authors, Series, Genres) for demo/offline mode
  const { authors, series, genres, currentBooks, isServerBrowse } = useCatalogBookPool({
    isServerConnected,
    isSearchActive,
    subTab,
    searchInput: listQuery,
    selectedAuthor,
    selectedSeries,
    selectedSubgenre,
    minRating,
    formatFilter,
    genreFilter: genreFilters,
    yearFilter,
    hasSeriesFilter,
    sortBy,
    booksList,
    facetBooks,
    authorGrouped,
    authorOutsideSeries,
    authorSortBy,
    seriesSortBy,
    serverAuthors,
    serverSeries,
    serverGenreGroups,
  });

  const showBooksSpinner =
    subTab === 'books' &&
    booksLoading &&
    booksList.length === 0 &&
    !selectedAuthor &&
    !selectedSeries &&
    !selectedSubgenre;
  const showBrowseSpinner =
    browseLoading &&
    !selectedAuthor &&
    !selectedSeries &&
    !selectedSubgenre &&
    (
      (subTab === 'authors' && serverAuthors.length === 0) ||
      (subTab === 'series' && serverSeries.length === 0) ||
      (subTab === 'genres' && serverGenreGroups.length === 0)
    );
  const validYearFilter = yearFilter >= 1800 && yearFilter <= 2100 ? yearFilter : 0;
  const hasBookFilters =
    minRating > 0 ||
    formatFilter !== 'all' ||
    Boolean(genreFilters.length) ||
    validYearFilter > 0 ||
    hasSeriesFilter !== 'any';
  const idleBooksHome =
    subTab === 'books' &&
    searchPhase === 'idle' &&
    !selectedAuthor &&
    !selectedSeries &&
    !selectedSubgenre &&
    !isSearchActive &&
    !hasBookFilters;
  // While a search/filter request is in flight with no rows yet, keep the skeleton —
  // otherwise CatalogBooksView flashes «Ничего не найдено».
  const showSearchPending =
    searchPhase === 'results' &&
    Boolean(isSearchActive || hasBookFilters) &&
    subTab === 'books' &&
    !selectedAuthor &&
    !selectedSeries &&
    !selectedSubgenre &&
    (booksLoading || isRefreshing) &&
    booksList.length === 0;
  const catalogDrillDown = Boolean(selectedAuthor || selectedSeries || selectedSubgenre);
  // Don't unmount drill-down chrome for facet loads — skeleton only for root lists / search.
  const showContentSpinner =
    !idleBooksHome &&
    !catalogDrillDown &&
    (showBooksSpinner || showBrowseSpinner || showSearchPending);

  const toggleGenreExpand = (name: string) => {
    setExpandedGenres(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const themeTextMuted = theme.textMuted;
  // Entity browse hides the book grid; book search results must keep CatalogBooksView.
  const entityBrowseActive =
    !catalogDrillDown &&
    (subTab === 'authors' || subTab === 'series' || subTab === 'genres');
  const showBrowseLanding =
    searchPhase === 'idle' &&
    subTab === 'books' &&
    !catalogDrillDown &&
    !isSearchActive &&
    !hasBookFilters;

  const clearDrilldownSelection = React.useCallback(() => {
    setSelectedAuthor(null);
    setSelectedSeries(null);
    setSelectedSubgenre(null);
    entityReturnGenreRef.current = null;
    drillSortReturnRef.current = null;
    setAuthorOutsideSeries(false);
    onClearReturnTo?.();
  }, [setSelectedAuthor, setSelectedSeries, setSelectedSubgenre, setAuthorOutsideSeries, onClearReturnTo]);

  const resetSearch = React.useCallback(() => {
    clearSearch();
    setSearchPhase('idle');
    setSubTab(CATALOG_BROWSE_ROOT);
    setMinRating(0);
    setFormatFilter('all');
    setGenreFilters([]);
    setYearFilter(0);
    setHasSeriesFilter('any');
    onClearReturnTo?.();
  }, [clearSearch, onClearReturnTo, setSubTab]);

  const handleSubmitSearch = React.useCallback(() => {
    const q = submitSearch();
    if (!q) return;
    addSearchQuery(q);
    clearDrilldownSelection();
    setSubTab('books');
    setSearchPhase('results');
  }, [submitSearch, addSearchQuery, clearDrilldownSelection, setSubTab]);

  const handleSubTabChange = React.useCallback(
    (tab: SubTab) => {
      clearDrilldownSelection();
      // Genres exist only in browse mode — opening them exits search.
      if (tab === 'genres' && (searchPhase === 'results' || isSearchActive)) {
        resetSearch();
      }
      setSubTab(tab);
    },
    [clearDrilldownSelection, searchPhase, isSearchActive, resetSearch, setSubTab],
  );

  // Search: Книги→Авторы→Серии. Browse: Авторы→Серии→Жанры.
  const swipeTabs = searchMode ? CATALOG_SEARCH_TABS : CATALOG_BROWSE_TABS;
  const catalogSwipe = useHorizontalTabSwipe(swipeTabs, subTab, handleSubTabChange, {
    enabled: isTabActive && !catalogDrillDown && !selectedBook && swipeTabs.includes(subTab),
  });

  const returnBackLabel =
    returnToPreviousTab === 'library'
      ? 'В библиотеку'
      : returnToPreviousTab === 'home'
        ? 'На главную'
        : returnToPreviousTab === 'profile'
          ? 'В профиль'
          : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden" {...catalogSwipe}>
      <CatalogSearchHeader
          subTab={subTab}
          onClearDrilldown={clearDrilldownSelection}
          isServerConnected={isServerConnected}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onSubmitSearch={handleSubmitSearch}
          onClearSearch={resetSearch}
          searchPlaceholder={searchPlaceholder}
          showSearchHistory={searchHistory.length > 0}
          searchHistory={searchHistory}
          onSelectHistoryQuery={(q) => {
            clearDrilldownSelection();
            const next = submitSearch(q);
            if (!next) return;
            addSearchQuery(next);
            setSubTab('books');
            setSearchPhase('results');
          }}
          onRemoveHistoryQuery={removeSearchQuery}
          onClearSearchHistory={clearSearchHistory}
          catalogSort={catalogSort}
          entitySort={entitySort}
          onCatalogSortChange={setCatalogSort}
          onEntitySortChange={setEntitySort}
          bookListActive={catalogDrillDown}
          seriesBookList={Boolean(selectedSeries)}
          searchMode={searchMode}
          entityPage={catalogDrillDown}
          onSubTabChange={handleSubTabChange}
          serverConfig={serverConfig}
          onPickAuthor={(name) => {
            clearSearch();
            setSearchPhase('idle');
            openAuthorPage(name);
          }}
          onPickSeries={(name) => {
            clearSearch();
            setSearchPhase('idle');
            openSeriesPage(name, null);
          }}
          onPickBook={(row) => {
            setSelectedBook({
              id: row.id,
              title: row.title,
              author: row.authorsDisplay || row.authors || '',
              ext: 'fb2',
              coverUrl: displayCoverUrl(serverConfig, row.id),
              contentUrl: bookContentUrl(serverConfig, row.id),
            });
          }}
        />

      {/* Main Aggregations and Catalog content */}
      <PullToRefresh
        scrollRef={catalogScrollRef}
        onRefresh={refreshCatalog}
        disabled={!isServerConnected}
        className="flex-1 overflow-y-auto px-5 py-4 landscape:max-[500px]:px-4 landscape:max-[500px]:py-3 flex flex-col"
      >
        {error && (
          <div className={`mb-3.5 p-2.5 rounded-lg border flex items-start gap-2 ${textStyles.caption} ${semantic.errorBg}`}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <span className="flex-1">{error}</span>
            {isServerConnected && (
              <button
                type="button"
                onClick={() => void refreshCatalog()}
                className={`shrink-0 flex items-center gap-1 font-bold underline ${theme.focusRing}`}
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                Повторить
              </button>
            )}
          </div>
        )}

        {!isServerConnected && !error && (
          <div className={`mb-3 flex items-center justify-between gap-2 ${textStyles.caption} ${semantic.offline}`} role="status">
            <span className="flex items-center gap-1.5 min-w-0">
              <WifiOff className="w-4 h-4 shrink-0" aria-hidden />
              Офлайн — поиск по серверу недоступен
            </span>
          </div>
        )}

        {isRefreshing && (
          <p className={`mb-2 ${textStyles.caption} ${themeTextMuted}`} role="status">Обновление…</p>
        )}

        {((searchPhase === 'results' || hasBookFilters) && listTotal > 0 && !catalogDrillDown) && (
          <p className={`mb-2 ${textStyles.micro} ${themeTextMuted}`}>
            Найдено: <strong>{listTotal.toLocaleString('ru-RU')}</strong>
          </p>
        )}

        {showContentSpinner ? (
          <BookListSkeleton count={6} />
        ) : showBrowseLanding ? (
          <CatalogBrowseLanding
            onOpenAuthor={openAuthorPage}
            onOpenSeries={(name) => openSeriesPage(name, null)}
            onBrowseTab={(tab) => {
              clearDrilldownSelection();
              setSubTab(tab);
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col">
            {searchPhase === 'results' && isSearchActive && !catalogDrillDown ? (
              <CatalogSearchHintsBanner
                hints={searchHints}
                onDidYouMean={(q) => {
                  setSearchInput(q);
                  const next = submitSearch(q);
                  if (!next) return;
                  addSearchQuery(next);
                  clearDrilldownSelection();
                  setSubTab('books');
                  setSearchPhase('results');
                }}
              />
            ) : null}

            <CatalogDrilldownPanel
              selectedAuthor={selectedAuthor}
              selectedSeries={selectedSeries}
              selectedSubgenre={selectedSubgenre}
              authorOutsideSeries={authorOutsideSeries}
              authorGrouped={authorGrouped}
              currentBooksCount={
                selectedSubgenre || selectedSeries || selectedAuthor
                  ? facetTotal || authorGrouped?.total || currentBooks.length
                  : currentBooks.length
              }
              isServerBrowse={isServerBrowse}
              isAppDark={isAppDark}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              favoriteAuthors={favoriteAuthors}
              favoriteSeries={favoriteSeries}
              onDrillDownBack={handleDrillDownBack}
              drillDownBackLabel={returnBackLabel}
              onToggleFavoriteAuthor={onToggleFavoriteAuthor}
              onToggleFavoriteSeries={onToggleFavoriteSeries}
              onDownloadSeries={
                selectedSeries
                  ? () => void handleDownloadSeries(selectedSeries, selectedAuthor)
                  : undefined
              }
              seriesDownloadBusy={seriesDownloadBusy}
            />

            {catalogDrillDown && facetLoading ? (
              <BookListSkeleton count={6} />
            ) : !entityBrowseActive ? (
            <CatalogBooksView
              subTab={subTab}
              isServerBrowse={isServerBrowse}
              isServerConnected={isServerConnected}
              isAppDark={isAppDark}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              selectedAuthor={selectedAuthor}
              selectedSeries={selectedSeries}
              selectedSubgenre={selectedSubgenre}
              authorGrouped={authorGrouped}
              authorOutsideSeries={authorOutsideSeries}
              currentBooks={currentBooks}
              minRating={minRating}
              onMinRatingChange={setMinRating}
              formatFilter={formatFilter as CatalogFormatFilter}
              onFormatFilterChange={setFormatFilter}
              genreFilters={genreFilters}
              onGenreFiltersChange={setGenreFilters}
              genreOptions={genreOptions}
              resolveGenreOptions={resolveFilterGenreOptions}
              yearFilter={yearFilter}
              onYearFilterChange={setYearFilter}
              hasSeriesFilter={hasSeriesFilter}
              onHasSeriesFilterChange={setHasSeriesFilter}
              sortBy={sortBy as DemoBookSort}
              onSortByChange={setSortBy}
              onApplyFilters={applyCatalogFilters}
              onClearAllFilters={clearAllFilters}
              showFilters={
                (isSearchActive && searchPhase === 'results' && !catalogDrillDown) ||
                Boolean(selectedSubgenre && !selectedAuthor && !selectedSeries)
              }
              showGenrePicker={!(selectedSubgenre && !selectedAuthor && !selectedSeries)}
              showBookSortBar={Boolean(selectedSubgenre && !selectedAuthor && !selectedSeries)}
              bookSort={catalogSort}
              onBookSortChange={setCatalogSort}
              onClearAuthor={() => setSelectedAuthor(null)}
              onClearSeries={() => setSelectedSeries(null)}
              onClearSubgenre={() => setSelectedSubgenre(null)}
              downloadedBookIds={downloadedBookIds}
              downloadingId={downloadingId}
              queuedBookIds={queuedBookIds}
              readIds={readIds}
              readingProgressByBookId={readingProgressByBookId}
              onBookClick={handleBookClick}
              onBookLongPress={onBookLongPress}
              onOpenSeries={(name, author) => openSeriesPage(name, author)}
              onDownloadSeries={(name) => void handleDownloadSeries(name, selectedAuthor)}
              seriesDownloadBusy={seriesDownloadBusy}
              onOpenOutsideSeries={() => {
                setCatalogSort('rating');
                setAuthorOutsideSeries(true);
                scrollCatalogToTop('auto');
              }}
              booksListLength={booksList.length}
              listTotal={listTotal}
              booksLoadingMore={booksLoadingMore}
              onLoadMoreBooks={loadMoreBooks}
              facetBooksLength={facetBooks.length}
              facetPage={facetPage}
              facetPageSize={facetPageSize}
              facetTotal={facetTotal}
              onFacetPageChange={setFacetPage}
              onScrollToTop={scrollCatalogToTop}
            />
            ) : null}

            {(subTab === 'authors' || subTab === 'series' || subTab === 'genres') && !catalogDrillDown && (
              <CatalogEntityLists
                subTab={subTab}
                isServerBrowse={isServerBrowse}
                isAppDark={isAppDark}
                serverConfig={serverConfig}
                storageDirectory={storageDirectory}
                authors={authors}
                series={series}
                genres={genres}
                authorSortBy={authorSortBy}
                seriesSortBy={seriesSortBy}
                onAuthorSortChange={setAuthorSortBy}
                onSeriesSortChange={setSeriesSortBy}
                expandedGenres={expandedGenres}
                onToggleGenreExpand={toggleGenreExpand}
                onSelectSubgenre={(parent, name) => {
                  setCatalogSort('rating');
                  clearBookFilters();
                  entityReturnGenreRef.current = null;
                  drillSortReturnRef.current = null;
                  setSelectedSubgenre({ parent, name });
                  scrollCatalogToTop('auto');
                }}
                listPage={listPage}
                listPageSize={listPageSize}
                listTotal={listTotal}
                onListPageChange={handleListPageChange}
                onOpenAuthor={openAuthorPage}
                onOpenSeries={(key) => openSeriesPage(key, null)}
                selectedAuthor={selectedAuthor}
                selectedSeries={selectedSeries}
                selectedSubgenre={selectedSubgenre}
              />
            )}


          </div>
        )}
      </PullToRefresh>
      </div>

      <BookDetailsSheet
        book={isTabActive ? selectedBook : null}
        onClose={() => setSelectedBook(null)}
        serverConfig={serverConfig}
        storageDirectory={storageDirectory}
        isServerConnected={isServerConnected}
        downloadedBookIds={downloadedBookIds}
        downloadingId={downloadingId}
        queuedBookIds={queuedBookIds}
        downloadError={downloadError}
        onDownload={handleDownload}
        onOpenBook={(book) => {
          setSelectedBook(null);
          onOpenBook(book);
        }}
        onSelectBook={setSelectedBook}
        bookmarkIds={bookmarkIds}
        readIds={readIds}
        onToggleBookBookmark={onToggleBookBookmark}
        onToggleRead={onToggleRead}
        isAppDark={isAppDark}
        onOpenAuthor={openAuthorPage}
        onOpenSeries={(name) => openSeriesPage(name)}
        dragControls={bookSheetDrag}
        onAuthExpired={onAuthExpired}
      />
    </div>
  );
}
