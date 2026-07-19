import React from 'react';
import { Filter, Inbox } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles } from '../../ui/tokens';
import EmptyState from '../../ui/EmptyState';
import { Book, ServerConfig } from '../../types';
import type { AuthorGroupedState } from '../../hooks/useCatalogData';
import CatalogActiveFilterChips from './CatalogActiveFilterChips';
import CatalogBookList from './CatalogBookList';
import CatalogFilterSheet from './CatalogFilterSheet';
import CatalogLoadMore from './CatalogLoadMore';
import CatalogPagination from './CatalogPagination';
import CatalogViewToggle from './CatalogViewToggle';
import { CatalogAuthorSeriesShelf } from './CatalogDrilldownPanel';
import type { CatalogFormatFilter, CatalogViewMode, DemoBookSort } from './catalogTypes';

interface CatalogBooksViewProps {
  subTab: 'books' | 'authors' | 'series' | 'genres';
  isServerBrowse: boolean;
  isServerConnected: boolean;
  isAppDark: boolean;
  serverConfig: ServerConfig;
  selectedAuthor: string | null;
  selectedSeries: string | null;
  selectedSubgenre: { parent: string; name: string } | null;
  authorGrouped: AuthorGroupedState | null;
  authorOutsideSeries: boolean;
  currentBooks: Book[];
  viewMode: CatalogViewMode;
  onViewModeChange: (mode: CatalogViewMode) => void;
  minRating: number;
  onMinRatingChange: (v: number) => void;
  formatFilter: CatalogFormatFilter;
  onFormatFilterChange: (v: CatalogFormatFilter) => void;
  sortBy: DemoBookSort;
  onSortByChange: (v: DemoBookSort) => void;
  onClearAllFilters: () => void;
  onClearAuthor: () => void;
  onClearSeries: () => void;
  onClearSubgenre: () => void;
  downloadedBookIds: string[];
  readIds?: Set<string>;
  readingProgressByBookId?: Record<string, number>;
  onBookClick: (book: Book) => void;
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
  selectedAuthor,
  selectedSeries,
  selectedSubgenre,
  authorGrouped,
  authorOutsideSeries,
  currentBooks,
  viewMode,
  onViewModeChange,
  minRating,
  onMinRatingChange,
  formatFilter,
  onFormatFilterChange,
  sortBy,
  onSortByChange,
  onClearAllFilters,
  onClearAuthor,
  onClearSeries,
  onClearSubgenre,
  downloadedBookIds,
  readIds,
  readingProgressByBookId,
  onBookClick,
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
  const showBooksSection = subTab === 'books' || Boolean(selectedAuthor || selectedSeries || selectedSubgenre);
  if (!showBooksSection) return null;

  const hasDemoFilters = !isServerBrowse && (minRating > 0 || formatFilter !== 'all');
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
      {!isServerBrowse && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl ${theme.interactive} ${textStyles.captionBold} ${
              hasDemoFilters ? theme.accentActive : `${theme.chip} ${theme.chipHover}`
            }`}
          >
            <Filter className="w-4 h-4" aria-hidden />
            Фильтры{hasDemoFilters ? ' •' : ''}
          </button>
        </div>
      )}

      <CatalogActiveFilterChips
        minRating={minRating}
        formatFilter={formatFilter}
        selectedAuthor={selectedAuthor}
        selectedSeries={selectedSeries}
        selectedSubgenre={selectedSubgenre}
        onClearMinRating={() => onMinRatingChange(0)}
        onClearFormat={() => onFormatFilterChange('all')}
        onClearAuthor={onClearAuthor}
        onClearSeries={onClearSeries}
        onClearSubgenre={onClearSubgenre}
        onClearAll={onClearAllFilters}
      />

      {isServerBrowse && selectedAuthor && !selectedSeries && !selectedSubgenre && !authorOutsideSeries && authorGrouped && (
        <CatalogAuthorSeriesShelf
          authorGrouped={authorGrouped}
          selectedAuthor={selectedAuthor}
          isAppDark={isAppDark}
          onOpenSeries={(name) => onOpenSeries(name, selectedAuthor)}
          onOpenOutsideSeries={onOpenOutsideSeries}
        />
      )}

      <div className="flex items-center justify-end mb-2">
        <CatalogViewToggle mode={viewMode} onChange={onViewModeChange} />
      </div>

      {showEmpty ? (
        <EmptyState
          icon={Inbox}
          title="Нет подходящих книг"
          description="Попробуйте изменить условия фильтрации"
        />
      ) : currentBooks.length > 0 ? (
        <CatalogBookList
          books={currentBooks}
          viewMode={viewMode}
          isServerBrowse={isServerBrowse}
          serverConfig={isServerConnected ? serverConfig : null}
          isAppDark={isAppDark}
          downloadedBookIds={downloadedBookIds}
          readIds={readIds}
          readingProgressByBookId={readingProgressByBookId}
          onBookClick={onBookClick}
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

      {!isServerBrowse && (
        <CatalogFilterSheet
          open={filterSheetOpen}
          onClose={() => setFilterSheetOpen(false)}
          minRating={minRating}
          onMinRatingChange={onMinRatingChange}
          formatFilter={formatFilter}
          onFormatFilterChange={onFormatFilterChange}
          sortBy={sortBy}
          onSortByChange={onSortByChange}
          onReset={() => {
            onMinRatingChange(0);
            onFormatFilterChange('all');
          }}
        />
      )}
    </div>
  );
}
