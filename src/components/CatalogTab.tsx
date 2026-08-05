import React from 'react';
import { theme } from '../lib/appTheme';
import { Book, ServerConfig } from '../types';
import {
  CatalogBookSort,
  CatalogEntitySort,
} from '../lib/inpxClient';
import { useBackHandler } from '../hooks/useBackHandler';
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
import CatalogSearchOverview from './catalog/CatalogSearchOverview';
import CatalogEntityLists from './catalog/CatalogEntityLists';
import CatalogDrilldownPanel from './catalog/CatalogDrilldownPanel';
import CatalogBooksView from './catalog/CatalogBooksView';
import BookDetailsSheet from './catalog/BookDetailsSheet';
import type {
  CatalogSubTab as SubTab,
  DemoBookSort,
  CatalogFormatFilter,
  CatalogHasSeriesFilter,
} from './catalog/catalogTypes';
import { textStyles, semantic } from '../ui/tokens';
import { bookHasPendingSync } from '../lib/syncStats';
import type { StorageDirectory } from '../lib/storageDirectory';
import { fetchSearchOverview, fetchSearchGenres, fetchGenres, type CatalogField } from '../lib/inpxClient';
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
  onOpenSyncCenter?: () => void;
  onBookLongPress?: (book: Book) => void;
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
  onOpenSyncCenter,
  onBookLongPress,
}: CatalogTabProps) {
  const [localSubTab, setLocalSubTab] = React.useState<SubTab>('books');
  const subTab = propSubTab !== undefined ? propSubTab : localSubTab;
  const setSubTab = onSubTabChange || setLocalSubTab;

  const isServerConnectedEarly =
    Boolean(serverConfig.url) && serverConfig.connectionStatus === 'connected';

  const {
    searchInput,
    setSearchInput,
    debouncedSearch,
    submitSearch,
    clearSearch,
    isSearchActive,
  } = useCatalogSearch(serverConfig, isServerConnectedEarly, subTab);
  const { history: searchHistory, addQuery: addSearchQuery, removeQuery: removeSearchQuery, clearHistory: clearSearchHistory } = useSearchHistory();

  /** idle → overview (hub) → results (field list) */
  const [searchPhase, setSearchPhase] = React.useState<'idle' | 'overview' | 'results'>('idle');
  const [searchOverview, setSearchOverview] = React.useState<{
    books: number;
    authors: number;
    series: number;
    booksCapped?: boolean;
  } | null>(null);
  const [overviewLoading, setOverviewLoading] = React.useState(false);

  const [selectedBook, setSelectedBook] = React.useState<Book | null>(null);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const catalogScrollRef = React.useRef<HTMLDivElement>(null);

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
    if (!isServerConnected) {
      setGenreOptions([]);
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
      .catch(() => {
        if (!cancelled) setGenreOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isServerConnected, serverConfig]);

  const handleCatalogReconnectReset = React.useCallback(() => {
    setSelectedAuthor(null);
    setSelectedSeries(null);
    setSelectedSubgenre(null);
    clearSearch();
    setSearchPhase('idle');
    setSearchOverview(null);
  }, [clearSearch, setSelectedAuthor, setSelectedSeries, setSelectedSubgenre]);

  const catalog = useCatalogData({
    serverConfig,
    isServerConnected,
    subTab,
    debouncedSearch,
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
    pauseListFetch: searchPhase === 'overview',
    onReconnectReset: handleCatalogReconnectReset,
  });

  const {
    booksLoading,
    booksLoadingMore,
    browseLoading,
    booksList,
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

  const scrollCatalogToTop = () => {
    catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleListPageChange = React.useCallback((p: number) => {
    changeListPage(p);
    scrollCatalogToTop();
  }, [changeListPage]);

  const scrollStorageKey = `inpx_catalog_scroll_${subTab}`;
  React.useEffect(() => {
    if (!selectedBook) return;
    sessionStorage.setItem(scrollStorageKey, String(catalogScrollRef.current?.scrollTop ?? 0));
  }, [selectedBook, scrollStorageKey]);

  React.useEffect(() => {
    if (selectedBook || !isTabActive) return;
    const saved = sessionStorage.getItem(scrollStorageKey);
    if (!saved) return;
    requestAnimationFrame(() => {
      catalogScrollRef.current?.scrollTo({ top: Number(saved) });
    });
  }, [selectedBook, isTabActive, scrollStorageKey]);

  const handleDrillDownBack = React.useCallback(() => {
    if (authorOutsideSeries) {
      setAuthorOutsideSeries(false);
      return;
    }
    // Серия внутри страницы автора — один шаг вверх по drill-down.
    if (selectedSeries && selectedAuthor) {
      setSelectedSeries(null);
      return;
    }
    // Пришли из избранного/другой вкладки — не оставлять на списке «Авторы»/«Серии».
    if (returnToPreviousTab && (selectedSeries || selectedAuthor || selectedSubgenre)) {
      onReturnToPreviousTab?.();
      return;
    }
    if (selectedSeries) {
      setSelectedSeries(null);
      return;
    }
    if (selectedAuthor) {
      setSelectedAuthor(null);
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
      setSearchPhase('overview');
      setSubTab('books');
      return true;
    }
    if (searchPhase === 'overview') {
      clearSearch();
      setSearchPhase('idle');
      setSearchOverview(null);
      setSubTab('books');
      setMinRating(0);
      setFormatFilter('all');
      setGenreFilters([]);
      setYearFilter(0);
      setHasSeriesFilter('any');
      return true;
    }
    if (returnToPreviousTab) {
      onReturnToPreviousTab?.();
      return true;
    }
    if (subTab !== 'books') {
      setSubTab('books');
      return true;
    }
    return false;
  });

  const searchPlaceholder = isServerConnected
    ? 'Книга, автор или серия'
    : 'Поиск по названию, автору, серии…';

  const searchField: Exclude<SubTab, 'genres'> =
    subTab === 'genres' ? 'books' : subTab;

  const setSearchField = (field: Exclude<SubTab, 'genres'>) => {
    setSubTab(field);
    setSelectedAuthor(null);
    setSelectedSeries(null);
    setSelectedSubgenre(null);
  };

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
      Boolean(debouncedSearch.trim()) ||
      formatFilter !== 'all' ||
      Boolean(year) ||
      minRating >= 1 ||
      hasSeriesFilter !== 'any';

    if (!hasScope) return genreOptions;

    try {
      const data = await fetchSearchGenres(serverConfig, {
        q: debouncedSearch.trim() || undefined,
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
    debouncedSearch,
    formatFilter,
    yearFilter,
    minRating,
    hasSeriesFilter,
    genreFilters,
    serverConfig,
  ]);

  const clearAllFilters = React.useCallback(() => {
    setMinRating(0);
    setFormatFilter('all');
    setGenreFilters([]);
    setYearFilter(0);
    setHasSeriesFilter('any');
    setSelectedAuthor(null);
    setSelectedSeries(null);
    setSelectedSubgenre(null);
    setAuthorOutsideSeries(false);
  }, [setSelectedAuthor, setSelectedSeries, setSelectedSubgenre]);

  const handleBookClick = (book: Book) => {
    setSelectedBook(book);
  };

  const openAuthorPage = (authorName: string) => {
    setSelectedBook(null);
    setSelectedSeries(null);
    setSelectedSubgenre(null);
    setAuthorOutsideSeries(false);
    setSelectedAuthor(authorName);
  };

  const openSeriesPage = (seriesName: string, filterAuthor?: string | null) => {
    setSelectedBook(null);
    setSelectedSubgenre(null);
    setSelectedSeries(seriesName);
    setCatalogSort('series');
    if (filterAuthor !== undefined) {
      setSelectedAuthor(filterAuthor);
    }
  };

  // Build Aggregations (Authors, Series, Genres) for demo/offline mode
  const { authors, series, genres, currentBooks, isServerBrowse } = useCatalogBookPool({
    isServerConnected,
    isSearchActive,
    subTab,
    searchInput: debouncedSearch,
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
  const showContentSpinner =
    !idleBooksHome &&
    searchPhase !== 'overview' &&
    (showBooksSpinner || showBrowseSpinner || facetLoading || showSearchPending);

  const toggleGenreExpand = (name: string) => {
    setExpandedGenres(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Theme styling helpers
  const themeHeader = theme.header;
  const themeTextMuted = theme.textMuted;
  const themeAccentBg = theme.accentBg;
  const themeInput = theme.input;

  const catalogDrillDown = Boolean(selectedAuthor || selectedSeries || selectedSubgenre);
  const resultsFromHub = searchPhase === 'results' && isSearchActive && !catalogDrillDown;
  // Entity browse hides the book grid; book search results must keep CatalogBooksView.
  const entityBrowseActive =
    searchPhase !== 'overview' &&
    !catalogDrillDown &&
    (subTab === 'authors' || subTab === 'series' || subTab === 'genres');
  const showHeaderBack = entityBrowseActive || resultsFromHub;
  const showBrowseLanding =
    searchPhase === 'idle' &&
    subTab === 'books' &&
    !catalogDrillDown &&
    !isSearchActive &&
    !hasBookFilters;
  const showSearchHub = searchPhase === 'overview' && isSearchActive;

  const clearDrilldownSelection = React.useCallback(() => {
    setSelectedAuthor(null);
    setSelectedSeries(null);
    setSelectedSubgenre(null);
    setAuthorOutsideSeries(false);
  }, [setSelectedAuthor, setSelectedSeries, setSelectedSubgenre]);

  const resetSearchHub = React.useCallback(() => {
    clearSearch();
    setSearchPhase('idle');
    setSearchOverview(null);
    setMinRating(0);
    setFormatFilter('all');
    setGenreFilters([]);
    setYearFilter(0);
    setHasSeriesFilter('any');
  }, [clearSearch]);

  const loadSearchOverview = React.useCallback(async (q: string) => {
    if (!isServerConnected) {
      setSearchOverview({ books: 0, authors: 0, series: 0 });
      return;
    }
    setOverviewLoading(true);
    try {
      const data = await fetchSearchOverview(serverConfig, q);
      setSearchOverview({
        books: data.books?.total ?? 0,
        authors: data.authors?.total ?? 0,
        series: data.series?.total ?? 0,
        booksCapped: Boolean(data.books?.capped),
      });
    } catch {
      setSearchOverview({ books: 0, authors: 0, series: 0 });
    } finally {
      setOverviewLoading(false);
    }
  }, [isServerConnected, serverConfig]);

  const handleSubmitSearch = React.useCallback(() => {
    const q = submitSearch();
    if (!q) return;
    addSearchQuery(q);
    clearDrilldownSelection();
    setSubTab('books');
    setSearchPhase('overview');
    void loadSearchOverview(q);
  }, [submitSearch, addSearchQuery, clearDrilldownSelection, setSubTab, loadSearchOverview]);

  const openSearchField = React.useCallback((field: CatalogField) => {
    clearDrilldownSelection();
    setSubTab(field);
    setSearchPhase('results');
  }, [clearDrilldownSelection, setSubTab]);

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
      <CatalogSearchHeader
          subTab={subTab}
          onSubTabChange={setSubTab}
          onClearDrilldown={clearDrilldownSelection}
          isServerConnected={isServerConnected}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onSubmitSearch={handleSubmitSearch}
          onClearSearch={resetSearchHub}
          searchPlaceholder={searchPlaceholder}
          showSearchHistory={searchHistory.length > 0}
          searchHistory={searchHistory}
          onSelectHistoryQuery={(q) => {
            clearDrilldownSelection();
            const next = submitSearch(q);
            if (!next) return;
            addSearchQuery(next);
            setSubTab('books');
            setSearchPhase('overview');
            void loadSearchOverview(next);
          }}
          onRemoveHistoryQuery={removeSearchQuery}
          onClearSearchHistory={clearSearchHistory}
          catalogSort={catalogSort}
          entitySort={entitySort}
          onCatalogSortChange={setCatalogSort}
          onEntitySortChange={setEntitySort}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          browseModeActive={showHeaderBack}
          onLeaveBrowse={() => {
            if (searchPhase === 'results' && isSearchActive) {
              setSearchPhase('overview');
              setSubTab('books');
              return;
            }
            setSubTab('books');
          }}
        />

      {/* Main Aggregations and Catalog content */}
      <PullToRefresh
        scrollRef={catalogScrollRef}
        onRefresh={refreshCatalog}
        disabled={!isServerConnected}
        className="flex-1 overflow-y-auto px-4 py-3 landscape:max-[500px]:px-2 landscape:max-[500px]:py-2 flex flex-col"
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
            {onOpenSyncCenter && (
              <button
                type="button"
                onClick={onOpenSyncCenter}
                className={`shrink-0 font-bold underline ${theme.focusRing}`}
              >
                Проверить
              </button>
            )}
          </div>
        )}

        {isRefreshing && (
          <p className={`mb-2 ${textStyles.caption} ${themeTextMuted}`} role="status">Обновление…</p>
        )}

        {((searchPhase === 'results' || hasBookFilters) && listTotal > 0) && (
          <p className={`mb-2 ${textStyles.micro} ${themeTextMuted}`}>
            Найдено: <strong>{listTotal.toLocaleString('ru-RU')}</strong>
          </p>
        )}

        {showContentSpinner ? (
          <BookListSkeleton count={6} />
        ) : showSearchHub ? (
          <CatalogSearchOverview
            query={debouncedSearch}
            totals={searchOverview ?? { books: 0, authors: 0, series: 0 }}
            loading={overviewLoading}
            onOpenField={openSearchField}
          />
        ) : showBrowseLanding ? (
          <CatalogBrowseLanding
            onBrowse={(tab) => {
              clearDrilldownSelection();
              setSubTab(tab);
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col">

            <CatalogDrilldownPanel
              selectedAuthor={selectedAuthor}
              selectedSeries={selectedSeries}
              selectedSubgenre={selectedSubgenre}
              authorOutsideSeries={authorOutsideSeries}
              authorGrouped={authorGrouped}
              currentBooksCount={currentBooks.length}
              isServerBrowse={isServerBrowse}
              isAppDark={isAppDark}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              favoriteAuthors={favoriteAuthors}
              favoriteSeries={favoriteSeries}
              onDrillDownBack={handleDrillDownBack}
              onToggleFavoriteAuthor={onToggleFavoriteAuthor}
              onToggleFavoriteSeries={onToggleFavoriteSeries}
            />

            {!entityBrowseActive && (
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
              showFilters={isSearchActive && searchPhase === 'results' && !catalogDrillDown}
              onClearAuthor={() => setSelectedAuthor(null)}
              onClearSeries={() => setSelectedSeries(null)}
              onClearSubgenre={() => setSelectedSubgenre(null)}
              downloadedBookIds={downloadedBookIds}
              readIds={readIds}
              readingProgressByBookId={readingProgressByBookId}
              onBookClick={handleBookClick}
              onBookLongPress={onBookLongPress}
              onOpenSeries={(name, author) => openSeriesPage(name, author)}
              onOpenOutsideSeries={() => setAuthorOutsideSeries(true)}
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
            )}

            {(subTab === 'authors' || subTab === 'series' || subTab === 'genres') && (
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
                onSelectSubgenre={(parent, name) => setSelectedSubgenre({ parent, name })}
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

      <BookDetailsSheet
        book={selectedBook}
        onClose={() => setSelectedBook(null)}
        serverConfig={serverConfig}
        storageDirectory={storageDirectory}
        isServerConnected={isServerConnected}
        downloadedBookIds={downloadedBookIds}
        downloadingId={downloadingId}
        queuedBookIds={queuedBookIds}
        downloadError={downloadError}
        onDownload={handleDownload}
        onOpenBook={onOpenBook}
        bookmarkIds={bookmarkIds}
        readIds={readIds}
        onToggleBookBookmark={onToggleBookBookmark}
        onToggleRead={onToggleRead}
        isAppDark={isAppDark}
        onOpenAuthor={openAuthorPage}
        onOpenSeries={(name) => openSeriesPage(name, null)}
        hasPendingSync={selectedBook ? downloadedBookIds.includes(selectedBook.id) && bookHasPendingSync(selectedBook.id) : false}
        onOpenSyncCenter={() => {
          onOpenSyncCenter?.();
          setSelectedBook(null);
        }}
        dragControls={bookSheetDrag}
      />
    </div>
  );
}
