import React from 'react';
import { Filter, Inbox, WifiOff } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles } from '../../ui/tokens';
import EmptyState from '../../ui/EmptyState';
import { Book, ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import type { AuthorGroupedState } from '../../hooks/useCatalogData';
import CatalogActiveFilterChips from './CatalogActiveFilterChips';
import CatalogBookList from './CatalogBookList';
import CatalogFilterSheet, { type CatalogFilterDraft, type CatalogGenreOption } from './CatalogFilterSheet';
import CatalogLoadMore from './CatalogLoadMore';
import CatalogPagination from './CatalogPagination';
import CatalogViewToggle from './CatalogViewToggle';
import { CatalogAuthorSeriesShelf } from './CatalogDrilldownPanel';
import type { CatalogFormatFilter, CatalogHasSeriesFilter, CatalogViewMode, DemoBookSort } from './catalogTypes';

interface CatalogBooksViewProps {
  subTab: 'books' | 'authors' | 'series' | 'genres';
  isServerBrowse: boolean;
  isServerConnected: boolean;
  isAppDark: boolean;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  selectedAuthor: string | null;
  selectedSeries: string | null;
  selectedSubgenre: { parent: string; name: string } | null;
  authorGrouped: AuthorGroupedState | null;
  authorOutsideSeries: boolean;
  currentBooks: Book[];
  minRating: number;
  onMinRatingChange: (v: number) => void;
  formatFilter: CatalogFormatFilter;
  onFormatFilterChange: (v: CatalogFormatFilter) => void;
  genreFilters: string[];
  onGenreFiltersChange: (codes: string[]) => void;
  genreOptions: CatalogGenreOption[];
  resolveGenreOptions?: () => Promise<CatalogGenreOption[]>;
  yearFilter: number;
  onYearFilterChange: (year: number) => void;
  hasSeriesFilter: CatalogHasSeriesFilter;
  onHasSeriesFilterChange: (v: CatalogHasSeriesFilter) => void;
  sortBy: DemoBookSort;
  onSortByChange: (v: DemoBookSort) => void;
  onApplyFilters: (next: CatalogFilterDraft) => void;
  onClearAllFilters: () => void;
  /** Book filters only for search results — hidden on author/series browse. */
  showFilters?: boolean;
  onClearAuthor: () => void;
  onClearSeries: () => void;
  onClearSubgenre: () => void;
  downloadedBookIds: string[];
  readIds?: Set<string>;
  readingProgressByBookId?: Record<string, number>;
  onBookClick: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  onOpenSeries: (name: string, author: string) => void;
  onOpenOutsideSeries: () => void;
  booksListLength: number;
  listTotal: number;
  booksLoadingMore: boolean;
  onLoadMoreBooks: () => void;
  facetBooksLength: number;
  facetPage: number;
  facetPageSize: number;
  facetTotal: number;
  onFacetPageChange: (page: number) => void;
  onScrollToTop: () => void;
}

export default function CatalogBooksView({
  subTab,
  isServerBrowse,
  isServerConnected,
  isAppDark,
  serverConfig,
  storageDirectory,
  selectedAuthor,
  selectedSeries,
  selectedSubgenre,
  authorGrouped,
  authorOutsideSeries,
  currentBooks,
  minRating,
  onMinRatingChange,
  formatFilter,
  onFormatFilterChange,
  genreFilters,
  onGenreFiltersChange,
  genreOptions,
  resolveGenreOptions,
  yearFilter,
  onYearFilterChange,
  hasSeriesFilter,
  onHasSeriesFilterChange,
  sortBy,
  onSortByChange,
  onApplyFilters,
  onClearAllFilters,
  showFilters = true,
  onClearAuthor,
  onClearSeries,
  onClearSubgenre,
  downloadedBookIds,
  readIds,
  readingProgressByBookId,
  onBookClick,
  onBookLongPress,
  onOpenSeries,
  onOpenOutsideSeries,
  booksListLength,
  listTotal,
  booksLoadingMore,
  onLoadMoreBooks,
  facetBooksLength,
  facetPage,
  facetPageSize,
  facetTotal,
  onFacetPageChange,
  onScrollToTop,
}: CatalogBooksViewProps) {
  const [filterSheetOpen, setFilterSheetOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<CatalogViewMode>('grid');
  const showBooksSection = subTab === 'books' || Boolean(selectedAuthor || selectedSeries || selectedSubgenre);
  if (!showBooksSection) return null;

  const genreLabels = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of genreOptions) {
      map[g.name] = g.displayName || g.name;
    }
    return map;
  }, [genreOptions]);
  const hasActiveFilters =
    minRating > 0 ||
    formatFilter !== 'all' ||
    genreFilters.length > 0 ||
    (yearFilter >= 1800 && yearFilter <= 2100) ||
    hasSeriesFilter !== 'any';
  const authorShelfOnly =
    isServerBrowse &&
    selectedAuthor &&
    !selectedSeries &&
    !selectedSubgenre &&
    authorGrouped &&
    !authorOutsideSeries;
  const showEmpty = currentBooks.length === 0 && !authorShelfOnly;

  return (
    <div className="flex-1 flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        {showFilters ? (
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className={`flex items-center gap-1.5 min-h-12 px-3 py-2 rounded-xl ${theme.interactive} ${textStyles.captionBold} ${
              hasActiveFilters ? theme.accentActive : `${theme.chip} ${theme.chipHover}`
            }`}
          >
            <Filter className="w-4 h-4" aria-hidden />
            Фильтры{hasActiveFilters ? ' •' : ''}
          </button>
        ) : (
          <span />
        )}
        <CatalogViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {showFilters && (
      <CatalogActiveFilterChips
        minRating={minRating}
        formatFilter={formatFilter}
        genreFilters={genreFilters}
        genreLabels={genreLabels}
        yearFilter={yearFilter}
        hasSeriesFilter={hasSeriesFilter}
        selectedAuthor={selectedAuthor}
        selectedSeries={selectedSeries}
        selectedSubgenre={selectedSubgenre}
        onClearMinRating={() => onMinRatingChange(0)}
        onClearFormat={() => onFormatFilterChange('all')}
        onClearGenre={(code) => onGenreFiltersChange(genreFilters.filter((g) => g !== code))}
        onClearYear={() => onYearFilterChange(0)}
        onClearHasSeries={() => onHasSeriesFilterChange('any')}
        onClearAuthor={onClearAuthor}
        onClearSeries={onClearSeries}
        onClearSubgenre={onClearSubgenre}
        onClearAll={onClearAllFilters}
      />
      )}

      {isServerBrowse && selectedAuthor && !selectedSeries && !selectedSubgenre && !authorOutsideSeries && authorGrouped && (
        <CatalogAuthorSeriesShelf
          authorGrouped={authorGrouped}
          selectedAuthor={selectedAuthor}
          isAppDark={isAppDark}
          onOpenSeries={(name) => onOpenSeries(name, selectedAuthor)}
          onOpenOutsideSeries={onOpenOutsideSeries}
        />
      )}

      {showEmpty ? (
        !isServerConnected ? (
          <EmptyState
            icon={WifiOff}
            tone="offline"
            title="Нет подключения"
            description="Подключитесь к серверу, чтобы искать книги в каталоге"
            actionLabel={hasActiveFilters || selectedAuthor || selectedSeries || selectedSubgenre ? 'Сбросить фильтры' : undefined}
            onAction={hasActiveFilters || selectedAuthor || selectedSeries || selectedSubgenre ? onClearAllFilters : undefined}
            actionVariant="primary"
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="Ничего не найдено"
            description="Попробуйте другой запрос или сбросьте фильтры"
            actionLabel={hasActiveFilters || selectedAuthor || selectedSeries || selectedSubgenre ? 'Сбросить' : undefined}
            onAction={hasActiveFilters || selectedAuthor || selectedSeries || selectedSubgenre ? onClearAllFilters : undefined}
          />
        )
      ) : currentBooks.length > 0 ? (
        <CatalogBookList
          books={currentBooks}
          viewMode={viewMode}
          isServerBrowse={isServerBrowse}
          serverConfig={isServerConnected ? serverConfig : null}
          storageDirectory={storageDirectory}
          isAppDark={isAppDark}
          downloadedBookIds={downloadedBookIds}
          readIds={readIds}
          readingProgressByBookId={readingProgressByBookId}
          onBookClick={onBookClick}
          onBookLongPress={onBookLongPress}
          showSeriesVolume={Boolean(selectedSeries)}
        />
      ) : null}

      {isServerBrowse && subTab === 'books' && !selectedAuthor && !selectedSeries && !selectedSubgenre && (
        <CatalogLoadMore
          loaded={booksListLength}
          total={listTotal}
          loading={booksLoadingMore}
          onLoadMore={onLoadMoreBooks}
        />
      )}

      {isServerBrowse && (selectedSeries || selectedSubgenre || (selectedAuthor && facetBooksLength > 0)) && (
        <CatalogPagination
          page={facetPage}
          pageSize={facetPageSize}
          total={facetTotal}
          isAppDark={isAppDark}
          onPageChange={(p) => {
            onFacetPageChange(p);
            onScrollToTop();
          }}
        />
      )}

      {showFilters && (
      <CatalogFilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        value={{
          minRating,
          formatFilter,
          genreFilters,
          yearFilter,
          hasSeriesFilter,
          sortBy,
        }}
        onApply={onApplyFilters}
        genreOptions={genreOptions}
        resolveGenreOptions={resolveGenreOptions}
        showSort={!isServerBrowse}
      />
      )}
    </div>
  );
}
