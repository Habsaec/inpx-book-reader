import React from 'react';
import { Filter, Inbox, WifiOff } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles, radii } from '../../ui/tokens';
import EmptyState from '../../ui/EmptyState';
import { Book, ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import type { AuthorGroupedState } from '../../hooks/useCatalogData';
import CatalogActiveFilterChips from './CatalogActiveFilterChips';
import CatalogBookList from './CatalogBookList';
import CatalogFilterSheet, { type CatalogFilterDraft, type CatalogGenreOption } from './CatalogFilterSheet';
import CatalogLoadMore from './CatalogLoadMore';
import CatalogPagination from './CatalogPagination';
import BookSortBar from './BookSortBar';
import { CatalogAuthorGroupedList, CatalogAuthorSeriesShelf } from './CatalogDrilldownPanel';
import type { CatalogBookSort } from '../../lib/inpxClient';
import { useCatalogViewMode } from '../../hooks/useCatalogViewMode';
import type { CatalogFormatFilter, CatalogHasSeriesFilter, DemoBookSort } from './catalogTypes';

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
  /** Book filters — search results and genre pages. */
  showFilters?: boolean;
  /** Hide genre multi-select inside an open genre. */
  showGenrePicker?: boolean;
  /** Server book sort (genre / search). */
  bookSort?: CatalogBookSort;
  onBookSortChange?: (sort: CatalogBookSort) => void;
  /** Compact title/rating chips (genre page). */
  showBookSortBar?: boolean;
  onClearAuthor: () => void;
  onClearSeries: () => void;
  onClearSubgenre: () => void;
  downloadedBookIds: string[];
  downloadingId?: string | null;
  queuedBookIds?: Set<string>;
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
  showGenrePicker = true,
  bookSort = 'rating',
  onBookSortChange,
  showBookSortBar = false,
  onClearAuthor,
  onClearSeries,
  onClearSubgenre,
  downloadedBookIds,
  downloadingId = null,
  queuedBookIds,
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
  const { viewMode } = useCatalogViewMode('books');
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
    (showGenrePicker && genreFilters.length > 0) ||
    (yearFilter >= 1800 && yearFilter <= 2100) ||
    hasSeriesFilter !== 'any';
  const authorRoot =
    Boolean(
      isServerBrowse &&
        selectedAuthor &&
        !selectedSeries &&
        !selectedSubgenre &&
        authorGrouped &&
        !authorOutsideSeries,
    );
  const filteredAuthorGrouped = React.useMemo(() => {
    if (!authorGrouped) return null;
    const match = (book: Book) => {
      if (minRating > 0 && (book.rating ?? 0) < minRating) return false;
      if (formatFilter !== 'all' && (book.ext || '').toLowerCase().replace(/^\./, '') !== formatFilter) {
        return false;
      }
      return true;
    };
    if (minRating <= 0 && formatFilter === 'all') return authorGrouped;
    const series = authorGrouped.series
      .map((s) => {
        const books = (s.books || []).filter(match);
        return books.length ? { ...s, books, bookCount: books.length } : null;
      })
      .filter(Boolean) as typeof authorGrouped.series;
    const standaloneBooks = authorGrouped.standaloneBooks.filter(match);
    return { ...authorGrouped, series, standaloneBooks };
  }, [authorGrouped, minRating, formatFilter]);

  const hasAuthorListBooks =
    Boolean(filteredAuthorGrouped?.series.some((s) => (s.books?.length ?? 0) > 0)) ||
    (filteredAuthorGrouped?.standaloneBooks.length ?? 0) > 0;
  // List = Flibusta groups (series → books). Grid / no books payload = series shelf.
  const authorListGrouped = authorRoot && viewMode === 'list' && hasAuthorListBooks;
  const authorShelfOnly = authorRoot && !authorListGrouped;
  const showEmpty = currentBooks.length === 0 && !authorRoot;

  return (
    <div className="flex-1 flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        {showFilters ? (
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className={`flex items-center gap-2 min-h-12 px-4 py-2.5 ${radii.button} ${theme.interactive} ${textStyles.captionBold} ${
              hasActiveFilters ? theme.accentActive : `${theme.chip} ${theme.chipHover}`
            }`}
          >
            <Filter className="w-4 h-4" aria-hidden />
            Фильтры{hasActiveFilters ? ' •' : ''}
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1 min-w-0">
          {showBookSortBar && onBookSortChange ? (
            <BookSortBar
              value={bookSort}
              options={[
                { id: 'title', label: 'А–Я' },
                { id: 'rating', label: 'Рейтинг' },
              ]}
              onChange={(id) => onBookSortChange(id as CatalogBookSort)}
            />
          ) : null}
        </div>
      </div>

      {showFilters && (
      <CatalogActiveFilterChips
        minRating={minRating}
        formatFilter={formatFilter}
        genreFilters={showGenrePicker ? genreFilters : []}
        genreLabels={genreLabels}
        yearFilter={yearFilter}
        hasSeriesFilter={hasSeriesFilter}
        selectedAuthor={selectedAuthor}
        selectedSeries={selectedSeries}
        /* Genre hero already shows the open genre — chip would duplicate. */
        selectedSubgenre={showGenrePicker ? selectedSubgenre : null}
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

      {authorListGrouped && filteredAuthorGrouped && selectedAuthor ? (
        <CatalogAuthorGroupedList
          authorGrouped={filteredAuthorGrouped}
          isAppDark={isAppDark}
          isServerBrowse={isServerBrowse}
          serverConfig={isServerConnected ? serverConfig : null}
          storageDirectory={storageDirectory}
          downloadedBookIds={downloadedBookIds}
          downloadingId={downloadingId}
          queuedBookIds={queuedBookIds}
          readIds={readIds}
          readingProgressByBookId={readingProgressByBookId}
          onBookClick={onBookClick}
          onBookLongPress={onBookLongPress}
          onOpenSeries={(name) => onOpenSeries(name, selectedAuthor)}
        />
      ) : authorShelfOnly && authorGrouped && selectedAuthor ? (
        <CatalogAuthorSeriesShelf
          authorGrouped={authorGrouped}
          selectedAuthor={selectedAuthor}
          isAppDark={isAppDark}
          onOpenSeries={(name) => onOpenSeries(name, selectedAuthor)}
          onOpenOutsideSeries={onOpenOutsideSeries}
        />
      ) : null}

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
      ) : !authorListGrouped && currentBooks.length > 0 ? (
        <CatalogBookList
          books={currentBooks}
          viewMode={viewMode}
          isServerBrowse={isServerBrowse}
          serverConfig={isServerConnected ? serverConfig : null}
          storageDirectory={storageDirectory}
          isAppDark={isAppDark}
          downloadedBookIds={downloadedBookIds}
          downloadingId={downloadingId}
          queuedBookIds={queuedBookIds}
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
          genreFilters: showGenrePicker ? genreFilters : [],
          yearFilter,
          hasSeriesFilter,
          sortBy,
        }}
        onApply={onApplyFilters}
        genreOptions={genreOptions}
        resolveGenreOptions={showGenrePicker ? resolveGenreOptions : undefined}
        showSort={!isServerBrowse}
        showGenrePicker={showGenrePicker}
      />
      )}
    </div>
  );
}
