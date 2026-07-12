import React from 'react';
import { theme } from '../lib/appTheme';
import { Book, ServerConfig } from '../types';
import {
  formatAuthorsFromItem,
  CatalogBookSort,
  CatalogEntitySort,
  SearchSuggestions,
} from '../lib/inpxClient';
import { useBackHandler } from '../hooks/useBackHandler';
import { useHorizontalTabSwipe } from '../hooks/useHorizontalTabSwipe';
import {
  BookOpen,
  AlertCircle,
  Layers,
  Star,
  Plus,
  Check,
  ChevronRight,
  Sparkles,
  Send,
  RotateCcw,
} from 'lucide-react';
import { useDragControls } from 'motion/react';
import { BookListSkeleton } from '../ui/Skeleton';
import { useCatalogSearch } from '../hooks/useCatalogSearch';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useCatalogData } from '../hooks/useCatalogData';
import { useCatalogBookPool } from '../hooks/useCatalogBookPool';
import PullToRefresh from './PullToRefresh';
import CatalogSearchHeader, { type SuggestFlatItem } from './catalog/CatalogSearchHeader';
import CatalogEntityLists from './catalog/CatalogEntityLists';
import CatalogDrilldownPanel from './catalog/CatalogDrilldownPanel';
import CatalogBooksView from './catalog/CatalogBooksView';
import BookDetailsSheet from './catalog/BookDetailsSheet';
import type {
  CatalogSubTab as SubTab,
  DemoBookSort,
  CatalogFormatFilter,
  CatalogViewMode,
} from './catalog/catalogTypes';
import { APP_SETTING_KEYS, getAppSettingString, setAppSettingRaw } from '../lib/appSettings';
import { textStyles, semantic } from '../ui/tokens';
import { bookHasPendingSync } from '../lib/syncStats';

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
    suggestions,
    suggestActiveIdx,
    setSuggestActiveIdx,
    dismissSuggestions,
    isSearchActive,
  } = useCatalogSearch(serverConfig, isServerConnectedEarly, subTab);
  const { history: searchHistory, addQuery: addSearchQuery, removeQuery: removeSearchQuery, clearHistory: clearSearchHistory } = useSearchHistory();

  const [selectedBook, setSelectedBook] = React.useState<Book | null>(null);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const catalogScrollRef = React.useRef<HTMLDivElement>(null);

  // Filtering & Sorting states (серверные сортировки — как /lite/catalog)
  const [catalogSort, setCatalogSort] = React.useState<CatalogBookSort>('title');
  const [entitySort, setEntitySort] = React.useState<CatalogEntitySort>('name');
  const [sortBy, setSortBy] = React.useState<'rating' | 'downloads' | 'title' | 'year' | 'size'>('rating');
  const [minRating, setMinRating] = React.useState<number>(0);
  const [formatFilter, setFormatFilter] = React.useState<'all' | 'fb2' | 'epub' | 'txt'>('all');
  const [viewMode, setViewMode] = React.useState<CatalogViewMode>(() => {
    const saved = getAppSettingString(APP_SETTING_KEYS.catalogView);
    return saved === 'grid' ? 'grid' : 'list';
  });

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

  const handleCatalogReconnectReset = React.useCallback(() => {
    setSelectedAuthor(null);
    setSelectedSeries(null);
    setSelectedSubgenre(null);
    setSearchInput('');
    dismissSuggestions();
  }, [dismissSuggestions, setSelectedAuthor, setSelectedSeries, setSelectedSubgenre, setSearchInput]);

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

  React.useEffect(() => {
    setAppSettingRaw(APP_SETTING_KEYS.catalogView, viewMode);
  }, [viewMode]);

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

  const catalogTabs = ['books', 'authors', 'series', 'genres'] as const;
  const swipeTabsEnabled =
    !selectedBook &&
    !selectedAuthor &&
    !selectedSeries &&
    !selectedSubgenre;

  const tabSwipe = useHorizontalTabSwipe(
    catalogTabs,
    subTab,
    (next) => {
      setSubTab(next);
      setSelectedAuthor(null);
      setSelectedSeries(null);
      setSelectedSubgenre(null);
    },
    { enabled: swipeTabsEnabled }
  );

  const handleDrillDownBack = React.useCallback(() => {
    if (authorOutsideSeries) {
      setAuthorOutsideSeries(false);
      return;
    }
    if (selectedSeries) {
      if (!selectedAuthor && !selectedSubgenre && returnToPreviousTab) {
        onReturnToPreviousTab?.();
        return;
      }
      setSelectedSeries(null);
      return;
    }
    if (selectedAuthor) {
      if (!selectedSubgenre && returnToPreviousTab) {
        onReturnToPreviousTab?.();
        return;
      }
      setSelectedAuthor(null);
      return;
    }
    if (selectedSubgenre) {
      if (returnToPreviousTab) {
        onReturnToPreviousTab?.();
        return;
      }
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
    if (!selectedAuthor && !selectedSeries && !selectedSubgenre && !authorOutsideSeries) return false;
    handleDrillDownBack();
    return true;
  });

  const searchPlaceholder = isServerConnected
    ? (subTab === 'genres' ? 'Быстрый фильтр' : 'Поиск по библиотеке')
    : 'Поиск по названию, автору, серии...';

  const searchField: Exclude<SubTab, 'genres'> =
    subTab === 'genres' ? 'books' : subTab;

  const setSearchField = (field: Exclude<SubTab, 'genres'>) => {
    setSubTab(field);
    setSelectedAuthor(null);
    setSelectedSeries(null);
    setSelectedSubgenre(null);
  };

  const suggestFlatItems = React.useMemo((): SuggestFlatItem[] => {
    if (!suggestions) return [];
    const items: SuggestFlatItem[] = [];
    for (const b of suggestions.books.slice(0, 5)) {
      items.push({ kind: 'book', key: `b-${b.id}`, book: b });
    }
    for (const a of suggestions.authors.slice(0, 5)) {
      items.push({ kind: 'author', key: `a-${a.name}`, author: a });
    }
    for (const s of suggestions.series.slice(0, 5)) {
      items.push({ kind: 'series', key: `s-${s.name}`, series: s });
    }
    return items;
  }, [suggestions]);

  const showSuggestions =
    isServerConnected &&
    subTab !== 'genres' &&
    searchInput.trim().length >= 2 &&
    suggestions != null &&
    suggestFlatItems.length > 0;

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

  const clearAllFilters = React.useCallback(() => {
    setMinRating(0);
    setFormatFilter('all');
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
    if (filterAuthor !== undefined) {
      setSelectedAuthor(filterAuthor);
    }
  };

  const activateSuggestItem = React.useCallback((idx: number) => {
    const item = suggestFlatItems[idx];
    if (!item) return;
    dismissSuggestions();
    if (item.kind === 'book') {
      addSearchQuery(item.book.title);
      handleBookClick({
        id: item.book.id,
        title: item.book.title,
        author: formatAuthorsFromItem(item.book),
        ext: 'fb2',
      });
      return;
    }
    if (item.kind === 'author') {
      addSearchQuery(item.author.name);
      setSearchInput('');
      openAuthorPage(item.author.name);
      return;
    }
    addSearchQuery(item.series.name);
    setSearchInput('');
    openSeriesPage(item.series.name, null);
  }, [suggestFlatItems, addSearchQuery]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions && e.key === 'ArrowDown' && suggestFlatItems.length > 0) {
      e.preventDefault();
      setSuggestActiveIdx(0);
      return;
    }
    if (!showSuggestions || !suggestFlatItems.length) {
      if (e.key === 'Enter' && searchInput.trim().length >= 2) {
        addSearchQuery(searchInput);
      }
      if (e.key === 'Escape') dismissSuggestions();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggestActiveIdx((i) => Math.min(i + 1, suggestFlatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && suggestActiveIdx >= 0) {
      e.preventDefault();
      activateSuggestItem(suggestActiveIdx);
    } else if (e.key === 'Escape') {
      dismissSuggestions();
    }
  };

  // Build Aggregations (Authors, Series, Genres) for demo/offline mode
  const { authors, series, genres, currentBooks, isServerBrowse } = useCatalogBookPool({
    isServerConnected,
    isSearchActive,
    subTab,
    searchInput,
    selectedAuthor,
    selectedSeries,
    selectedSubgenre,
    minRating,
    formatFilter,
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
    !debouncedSearch &&
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
  const showContentSpinner = showBooksSpinner || showBrowseSpinner || facetLoading;

  const toggleGenreExpand = (name: string) => {
    setExpandedGenres(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Theme styling helpers
  const themeHeader = theme.header;
  const themeTextMuted = theme.textMuted;
  const themeAccentBg = theme.accentBg;
  const themeInput = theme.input;

  const catalogDrillDown = Boolean(selectedAuthor || selectedSeries || selectedSubgenre);

  const clearDrilldownSelection = React.useCallback(() => {
    setSelectedAuthor(null);
    setSelectedSeries(null);
    setSelectedSubgenre(null);
  }, [setSelectedAuthor, setSelectedSeries, setSelectedSubgenre]);

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
      {!catalogDrillDown && (
        <CatalogSearchHeader
          subTab={subTab}
          onSubTabChange={setSubTab}
          onClearDrilldown={clearDrilldownSelection}
          isServerConnected={isServerConnected}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onSearchKeyDown={handleSearchKeyDown}
          searchPlaceholder={searchPlaceholder}
          showSuggestions={showSuggestions}
          showSearchHistory={searchHistory.length > 0}
          suggestions={suggestions}
          suggestFlatItems={suggestFlatItems}
          suggestActiveIdx={suggestActiveIdx}
          onActivateSuggest={activateSuggestItem}
          onDismissSuggestions={dismissSuggestions}
          searchHistory={searchHistory}
          onSelectHistoryQuery={setSearchInput}
          onRemoveHistoryQuery={removeSearchQuery}
          onClearSearchHistory={clearSearchHistory}
          catalogSort={catalogSort}
          entitySort={entitySort}
          onCatalogSortChange={setCatalogSort}
          onEntitySortChange={setEntitySort}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
        />
      )}

      {/* Main Aggregations and Catalog content */}
      <PullToRefresh
        scrollRef={catalogScrollRef}
        onRefresh={refreshCatalog}
        disabled={!isServerConnected}
        onScroll={dismissSuggestions}
        scrollProps={tabSwipe}
        className="flex-1 overflow-y-auto px-4 py-3 landscape:max-[500px]:px-2 landscape:max-[500px]:py-2 flex flex-col"
      >
        {error && (
          <div className={`mb-3.5 p-2.5 rounded-lg border flex items-start gap-2 text-xs ${semantic.errorBg}`}>
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

        {isRefreshing && (
          <p className={`mb-2 ${textStyles.caption} ${themeTextMuted}`} role="status">Обновление…</p>
        )}

        {isSearchActive && listTotal > 0 && (
          <p className={`mb-2 ${textStyles.micro} ${themeTextMuted}`}>
            Найдено: <strong>{listTotal.toLocaleString('ru-RU')}</strong>
          </p>
        )}

        {showContentSpinner ? (
          <BookListSkeleton count={6} />
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
              favoriteAuthors={favoriteAuthors}
              favoriteSeries={favoriteSeries}
              onDrillDownBack={handleDrillDownBack}
              onToggleFavoriteAuthor={onToggleFavoriteAuthor}
              onToggleFavoriteSeries={onToggleFavoriteSeries}
            />

            <CatalogBooksView
              subTab={subTab}
              isServerBrowse={isServerBrowse}
              isServerConnected={isServerConnected}
              isAppDark={isAppDark}
              serverConfig={serverConfig}
              selectedAuthor={selectedAuthor}
              selectedSeries={selectedSeries}
              selectedSubgenre={selectedSubgenre}
              authorGrouped={authorGrouped}
              authorOutsideSeries={authorOutsideSeries}
              currentBooks={currentBooks}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              minRating={minRating}
              onMinRatingChange={setMinRating}
              formatFilter={formatFilter as CatalogFormatFilter}
              onFormatFilterChange={setFormatFilter}
              sortBy={sortBy as DemoBookSort}
              onSortByChange={setSortBy}
              onClearAllFilters={clearAllFilters}
              onClearAuthor={() => setSelectedAuthor(null)}
              onClearSeries={() => setSelectedSeries(null)}
              onClearSubgenre={() => setSelectedSubgenre(null)}
              downloadedBookIds={downloadedBookIds}
              readIds={readIds}
              readingProgressByBookId={readingProgressByBookId}
              onBookClick={handleBookClick}
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

            {(subTab === 'authors' || subTab === 'series' || subTab === 'genres') && (
              <CatalogEntityLists
                subTab={subTab}
                isServerBrowse={isServerBrowse}
                isAppDark={isAppDark}
                serverConfig={serverConfig}
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
