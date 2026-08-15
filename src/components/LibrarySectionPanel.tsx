import React from 'react';
import { ArrowLeft, AlertCircle, RefreshCw, BookOpen, Filter } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { fetchGenres, fetchLibraryView, isAuthError, isUnreachableServerError, mapServerBook } from '../lib/inpxClient';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import CatalogPagination from './catalog/CatalogPagination';
import CatalogFilterSheet, { type CatalogFilterDraft, type CatalogGenreOption } from './catalog/CatalogFilterSheet';
import CatalogActiveFilterChips from './catalog/CatalogActiveFilterChips';
import BookSortBar from './catalog/BookSortBar';
import CatalogBookList from './catalog/CatalogBookList';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import type { CatalogFormatFilter, CatalogHasSeriesFilter } from './catalog/catalogTypes';
import { BookGridSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { textStyles, touchMin, semantic, radii } from '../ui/tokens';

export type LibrarySectionView = 'recent' | 'recommended';

const PAGE_SIZE = 24;

type LibrarySort = 'recent' | 'relevance' | 'title' | 'rating';

const SORT_OPTIONS: Record<LibrarySectionView, { id: LibrarySort; label: string }[]> = {
  recent: [
    { id: 'recent', label: 'Новые' },
    { id: 'title', label: 'А–Я' },
    { id: 'rating', label: 'Рейтинг' },
  ],
  recommended: [
    { id: 'relevance', label: 'Подборка' },
    { id: 'title', label: 'А–Я' },
    { id: 'rating', label: 'Рейтинг' },
  ],
};

const DEFAULT_SORT: Record<LibrarySectionView, LibrarySort> = {
  recent: 'recent',
  recommended: 'relevance',
};

const EMPTY_FILTERS: CatalogFilterDraft = {
  minRating: 0,
  formatFilter: 'all',
  genreFilters: [],
  yearFilter: 0,
  hasSeriesFilter: 'any',
  sortBy: 'rating',
};

const SECTION_META: Record<
  LibrarySectionView,
  { title: string; subtitle: string; empty: string }
> = {
  recent: {
    title: 'Новинки',
    subtitle: 'Последние поступления в библиотеку',
    empty: 'Нет новых книг',
  },
  recommended: {
    title: 'Рекомендации',
    subtitle: 'Подборка на основе избранных авторов, серий, истории и закладок',
    empty: 'Нет рекомендаций',
  },
};

function hasSeriesToApi(v: CatalogHasSeriesFilter): 0 | 1 | undefined {
  if (v === 'yes') return 1;
  if (v === 'no') return 0;
  return undefined;
}

interface LibrarySectionPanelProps {
  view: LibrarySectionView;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  downloadedBookIds: string[];
  readingProgressByBookId?: Record<string, number>;
  readIds?: Set<string>;
  isAppDark?: boolean;
  isTabActive?: boolean;
  onClose: () => void;
  onOpenBook: (book: Book) => void;
  onOpenDetails?: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  onAuthExpired?: () => void;
  onConnectionLost?: () => void;
}

export default function LibrarySectionPanel({
  view,
  serverConfig,
  storageDirectory,
  downloadedBookIds,
  readingProgressByBookId,
  readIds,
  isAppDark = false,
  isTabActive = true,
  onClose,
  onOpenBook,
  onOpenDetails,
  onBookLongPress,
  onAuthExpired,
  onConnectionLost,
}: LibrarySectionPanelProps) {
  const meta = SECTION_META[view];
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [books, setBooks] = React.useState<Book[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [computing, setComputing] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const loadGen = React.useRef(0);

  const [minRating, setMinRating] = React.useState(0);
  const [formatFilter, setFormatFilter] = React.useState<CatalogFormatFilter>('all');
  const [genreFilters, setGenreFilters] = React.useState<string[]>([]);
  const [yearFilter, setYearFilter] = React.useState(0);
  const [hasSeriesFilter, setHasSeriesFilter] = React.useState<CatalogHasSeriesFilter>('any');
  const [filterSheetOpen, setFilterSheetOpen] = React.useState(false);
  const [genreOptions, setGenreOptions] = React.useState<CatalogGenreOption[]>([]);
  const [sortBy, setSortBy] = React.useState<LibrarySort>(DEFAULT_SORT[view]);
  const { viewMode } = useCatalogViewMode('books');

  useOverlayBackHandler(isTabActive, onClose);

  React.useEffect(() => {
    if (!isTabActive) onClose();
  }, [isTabActive, onClose]);

  React.useEffect(() => {
    setPage(1);
    setMinRating(0);
    setFormatFilter('all');
    setGenreFilters([]);
    setYearFilter(0);
    setHasSeriesFilter('any');
    setFilterSheetOpen(false);
    setSortBy(DEFAULT_SORT[view]);
  }, [view]);

  React.useEffect(() => {
    if (!isTabActive) return;
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
  }, [isTabActive, serverConfig]);

  const hasActiveFilters =
    minRating > 0 ||
    formatFilter !== 'all' ||
    genreFilters.length > 0 ||
    yearFilter > 0 ||
    hasSeriesFilter !== 'any';

  const genreLabels = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of genreOptions) {
      map[g.name] = g.displayName || g.name;
    }
    return map;
  }, [genreOptions]);

  React.useEffect(() => {
    const gen = ++loadGen.current;
    let cancelled = false;
    let pollTimer: number | undefined;

    const load = async (attempt = 0) => {
      setLoading(true);
      setError(false);
      if (attempt === 0) setComputing(false);
      try {
        const res = await fetchLibraryView(serverConfig, view, page, PAGE_SIZE, {
          genre: genreFilters,
          format: formatFilter === 'all' ? undefined : formatFilter,
          year: yearFilter > 0 ? yearFilter : undefined,
          minRate: minRating > 0 ? minRating : undefined,
          hasSeries: hasSeriesToApi(hasSeriesFilter),
          sort: sortBy,
        });
        if (cancelled || loadGen.current !== gen) return;

        if (res.computing && view === 'recommended') {
          setComputing(true);
          setBooks([]);
          setTotal(0);
          setLoading(false);
          if (attempt < 15) {
            pollTimer = window.setTimeout(() => {
              void load(attempt + 1);
            }, 2000);
            return;
          }
          setComputing(false);
          setError(true);
          return;
        }

        const mapped = (res.items || []).map((b) => mapServerBook(b, serverConfig));
        setComputing(false);
        setTotal(Number(res.total) || mapped.length);
        setBooks(mapped);
      } catch (e) {
        if (cancelled || loadGen.current !== gen) return;
        if (isAuthError(e)) onAuthExpired?.();
        else if (isUnreachableServerError(e)) onConnectionLost?.();
        setBooks([]);
        setTotal(0);
        setError(true);
      } finally {
        if (!cancelled && loadGen.current === gen) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [
    serverConfig,
    view,
    page,
    reloadKey,
    minRating,
    formatFilter,
    genreFilters,
    yearFilter,
    hasSeriesFilter,
    sortBy,
    onAuthExpired,
    onConnectionLost,
  ]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page, view, minRating, formatFilter, genreFilters, yearFilter, hasSeriesFilter, sortBy]);

  const handlePageChange = React.useCallback((next: number) => {
    setPage(next);
  }, []);

  const applyFilters = React.useCallback((next: CatalogFilterDraft) => {
    setMinRating(next.minRating);
    setFormatFilter(next.formatFilter);
    setGenreFilters(Array.isArray(next.genreFilters) ? [...next.genreFilters] : []);
    setYearFilter(next.yearFilter);
    setHasSeriesFilter(next.hasSeriesFilter);
    setPage(1);
  }, []);

  const handleSortChange = React.useCallback((id: string) => {
    setSortBy(id as LibrarySort);
    setPage(1);
  }, []);

  const clearAllFilters = React.useCallback(() => {
    applyFilters({ ...EMPTY_FILTERS });
  }, [applyFilters]);

  const handleBookClick = React.useCallback(
    (book: Book) => {
      if (onOpenDetails) {
        onOpenDetails(book);
        return;
      }
      onOpenBook(book);
    },
    [onOpenBook, onOpenDetails],
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
      <div className={`px-4 pt-3 pb-2 shrink-0 border-b ${theme.header}`}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            aria-label="Назад"
            onClick={onClose}
            className={`${touchMin} inline-flex items-center gap-1 px-1 shrink-0 ${textStyles.bodyBold} ${theme.accentText} ${theme.focusRing}`}
          >
            <ArrowLeft className="w-4 h-4" aria-hidden /> Назад
          </button>
          <div className="min-w-0">
            <h2 className={`${textStyles.title} truncate`}>{meta.title}</h2>
            <p className={`${textStyles.caption} ${theme.textMuted} line-clamp-2`}>{meta.subtitle}</p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className={`flex items-center gap-1.5 min-h-12 px-3 py-2 ${radii.button} ${theme.interactive} ${textStyles.captionBold} ${
              hasActiveFilters ? theme.accentActive : `${theme.chip} ${theme.chipHover}`
            }`}
          >
            <Filter className="w-4 h-4" aria-hidden />
            Фильтры{hasActiveFilters ? ' •' : ''}
          </button>
          <div className="flex items-center gap-1 min-w-0">
            <BookSortBar
              value={sortBy}
              options={SORT_OPTIONS[view]}
              onChange={handleSortChange}
            />
          </div>
        </div>

        <CatalogActiveFilterChips
          minRating={minRating}
          formatFilter={formatFilter}
          genreFilters={genreFilters}
          genreLabels={genreLabels}
          yearFilter={yearFilter}
          hasSeriesFilter={hasSeriesFilter}
          selectedAuthor={null}
          selectedSeries={null}
          selectedSubgenre={null}
          onClearMinRating={() => {
            setMinRating(0);
            setPage(1);
          }}
          onClearFormat={() => {
            setFormatFilter('all');
            setPage(1);
          }}
          onClearGenre={(code) => {
            setGenreFilters((prev) => prev.filter((g) => g !== code));
            setPage(1);
          }}
          onClearYear={() => {
            setYearFilter(0);
            setPage(1);
          }}
          onClearHasSeries={() => {
            setHasSeriesFilter('any');
            setPage(1);
          }}
          onClearAuthor={() => {}}
          onClearSeries={() => {}}
          onClearSubgenre={() => {}}
          onClearAll={clearAllFilters}
        />

        {error && !loading ? (
          <div className={`flex items-center justify-between gap-2 py-4 ${textStyles.caption} ${semantic.error}`}>
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
              Не удалось загрузить список
            </span>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className={`shrink-0 inline-flex items-center gap-1 font-bold underline ${theme.focusRing}`}
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden />
              Повторить
            </button>
          </div>
        ) : loading || computing ? (
          <div className="space-y-3" aria-busy aria-label={computing ? 'Подбираем рекомендации…' : 'Загрузка'}>
            {computing && (
              <p className={`${textStyles.caption} ${theme.textMuted}`}>Подбираем рекомендации…</p>
            )}
            <BookGridSkeleton count={9} />
          </div>
        ) : books.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={hasActiveFilters ? 'Ничего не найдено' : meta.empty}
            description={hasActiveFilters ? 'Сбросьте фильтры или измените условия' : meta.subtitle}
            actionLabel={hasActiveFilters ? 'Сбросить фильтры' : undefined}
            onAction={hasActiveFilters ? clearAllFilters : undefined}
          />
        ) : (
          <>
            {total > 0 && (
              <p className={`mb-3 ${textStyles.micro} ${theme.textMuted}`}>
                Найдено: <strong>{total.toLocaleString('ru-RU')}</strong>
              </p>
            )}
            <CatalogBookList
              books={books}
              viewMode={viewMode}
              isServerBrowse
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              isAppDark={isAppDark}
              downloadedBookIds={downloadedBookIds}
              readingProgressByBookId={readingProgressByBookId}
              readIds={readIds}
              onBookClick={handleBookClick}
              onBookLongPress={onBookLongPress}
            />
            <CatalogPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={handlePageChange}
              isAppDark={isAppDark}
            />
          </>
        )}
      </div>

      <CatalogFilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        value={{
          minRating,
          formatFilter,
          genreFilters,
          yearFilter,
          hasSeriesFilter,
          sortBy: 'rating',
        }}
        onApply={applyFilters}
        genreOptions={genreOptions}
        showSort={false}
      />
    </div>
  );
}
