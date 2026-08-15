import React from 'react';
import {
  fetchRecentBooks,
  searchCatalog,
  fetchAuthors,
  fetchSeries,
  fetchGenres,
  fetchFacetBooks,
  fetchAuthorGrouped,
  mapServerBook,
  displayAuthorName,
  isAuthError,
  isUnreachableServerError,
  CatalogBookSort,
  CatalogEntitySort,
  type InpxBookItem,
  type CatalogSearchHints,
} from '../lib/inpxClient';
import type { Book, ServerConfig } from '../types';
import type { CatalogSubTab } from '../components/catalog/catalogTypes';
import { sortBooksBySeriesVolume } from '../lib/seriesVolumeSort';

export interface CatalogAuthorRow {
  key: string;
  label: string;
  bookCount: number;
}

export interface CatalogSeriesRow {
  key: string;
  label: string;
  bookCount: number;
}

export interface AuthorGroupedState {
  series: Array<{
    name: string;
    displayName?: string;
    bookCount: number;
    books?: Book[];
  }>;
  standaloneBooks: Book[];
  total: number;
  bioHtml?: string;
  hasPortrait?: boolean;
  authorName?: string;
}

export interface UseCatalogDataOptions {
  serverConfig: ServerConfig;
  isServerConnected: boolean;
  subTab: CatalogSubTab;
  debouncedSearch: string;
  searchInput: string;
  catalogSort: CatalogBookSort;
  entitySort: CatalogEntitySort;
  selectedAuthor: string | null;
  selectedSeries: string | null;
  selectedSubgenre: { parent: string; name: string } | null;
  minRating?: number;
  formatFilter?: 'all' | 'fb2' | 'epub' | 'txt';
  genreFilter?: string | string[];
  yearFilter?: number;
  hasSeriesFilter?: 'any' | 'yes' | 'no';
  /** When true, skip books/authors/series list fetch (unified search hub is shown). */
  pauseListFetch?: boolean;
  onReconnectReset?: () => void;
  onAuthExpired?: () => void;
  onConnectionLost?: () => void;
}

function applyGenreFilter(
  groups: Array<{
    groupName: string;
    items: Array<{ name: string; bookCount?: number; displayName?: string }>;
  }>,
  q: string,
) {
  if (!q) return groups;
  const lq = q.toLowerCase();
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) =>
        it.name.toLowerCase().includes(lq)
        || (it.displayName || '').toLowerCase().includes(lq)
        || g.groupName.toLowerCase().includes(lq)),
    }))
    .filter((g) => g.items.length > 0);
}

function catalogErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.trim() || 'Не удалось загрузить каталог';
}

export function useCatalogData({
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
  minRating = 0,
  formatFilter = 'all',
  genreFilter = '',
  yearFilter = 0,
  hasSeriesFilter = 'any',
  pauseListFetch = false,
  onReconnectReset,
  onAuthExpired,
  onConnectionLost,
}: UseCatalogDataOptions) {
  const onAuthExpiredRef = React.useRef(onAuthExpired);
  onAuthExpiredRef.current = onAuthExpired;
  const onConnectionLostRef = React.useRef(onConnectionLost);
  onConnectionLostRef.current = onConnectionLost;

  const handleFetchError = React.useCallback((err: unknown) => {
    if (isAuthError(err)) {
      onAuthExpiredRef.current?.();
      setError(catalogErrorMessage(err));
      return;
    }
    if (isUnreachableServerError(err)) {
      onConnectionLostRef.current?.();
    }
    setError(catalogErrorMessage(err));
  }, []);

  const [booksLoading, setBooksLoading] = React.useState(false);
  const [booksLoadingMore, setBooksLoadingMore] = React.useState(false);
  const [browseLoading, setBrowseLoading] = React.useState(false);
  const [booksList, setBooksList] = React.useState<Book[]>([]);
  const [searchHints, setSearchHints] = React.useState<CatalogSearchHints | null>(null);
  const [listPage, setListPage] = React.useState(1);
  const [paginationVersion, setPaginationVersion] = React.useState(0);
  const [listTotal, setListTotal] = React.useState(0);
  const [listPageSize, setListPageSize] = React.useState(24);
  const [facetPage, setFacetPage] = React.useState(1);
  const [facetTotal, setFacetTotal] = React.useState(0);
  const [facetPageSize, setFacetPageSize] = React.useState(24);
  const [error, setError] = React.useState('');
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const dataRequestRef = React.useRef(0);
  const listPageRef = React.useRef(1);
  const appendBooksRef = React.useRef(false);
  const booksListRef = React.useRef(booksList);
  booksListRef.current = booksList;
  const genresCacheRef = React.useRef<Array<{ groupName: string; items: Array<{ name: string; bookCount?: number }> }>>([]);
  const genresLoadedRef = React.useRef(false);
  const genresSortRef = React.useRef<CatalogEntitySort | null>(null);
  const listFilterKeyRef = React.useRef('');

  const [serverAuthors, setServerAuthors] = React.useState<CatalogAuthorRow[]>([]);
  const [serverSeries, setServerSeries] = React.useState<CatalogSeriesRow[]>([]);
  const [serverGenreGroups, setServerGenreGroups] = React.useState<
    Array<{ groupName: string; items: Array<{ name: string; bookCount?: number }> }>
  >([]);
  const [facetBooks, setFacetBooks] = React.useState<Book[]>([]);
  const [authorGrouped, setAuthorGrouped] = React.useState<AuthorGroupedState | null>(null);
  const [authorOutsideSeries, setAuthorOutsideSeries] = React.useState(false);
  const [facetLoading, setFacetLoading] = React.useState(false);

  const hasMoreBooks = subTab === 'books' && booksList.length > 0 && booksList.length < listTotal;

  const handleListPageChange = React.useCallback((p: number) => {
    appendBooksRef.current = false;
    listPageRef.current = p;
    setListPage(p);
    setPaginationVersion((v) => v + 1);
  }, []);

  const loadMoreBooks = React.useCallback(() => {
    if (!hasMoreBooks || booksLoading || booksLoadingMore) return;
    appendBooksRef.current = true;
    const next = listPageRef.current + 1;
    listPageRef.current = next;
    setListPage(next);
    setPaginationVersion((v) => v + 1);
  }, [booksLoading, booksLoadingMore, hasMoreBooks]);

  const refreshCatalog = React.useCallback(async () => {
    appendBooksRef.current = false;
    listPageRef.current = 1;
    setListPage(1);
    setPaginationVersion((v) => v + 1);
    if (subTab === 'genres') {
      genresLoadedRef.current = false;
      genresSortRef.current = null;
    }
  }, [subTab]);

  React.useEffect(() => {
    setFacetPage(1);
  }, [
    selectedAuthor,
    selectedSeries,
    selectedSubgenre,
    catalogSort,
    minRating,
    formatFilter,
    genreFilter,
    yearFilter,
    hasSeriesFilter,
  ]);

  React.useEffect(() => {
    if (!isServerConnected || selectedAuthor || selectedSeries || selectedSubgenre) {
      // Invalidate in-flight hub list fetches so they cannot overwrite facet/drill-down UI.
      dataRequestRef.current += 1;
      // Сиротский fetch не сбросит флаги сам (reqId уже не совпадёт) — гасим здесь,
      // иначе «Обновление…» висит всё время drill-down.
      setBooksLoading(false);
      setBooksLoadingMore(false);
      setBrowseLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (pauseListFetch) {
      dataRequestRef.current += 1;
      setBooksLoading(false);
      setBooksLoadingMore(false);
      setBrowseLoading(false);
      setIsRefreshing(false);
      return;
    }

    let append = appendBooksRef.current;
    appendBooksRef.current = false;

    const genreList = (Array.isArray(genreFilter) ? genreFilter : String(genreFilter || '').split(','))
      .map((g) => g.trim())
      .filter(Boolean);
    const bookFilters = {
      format: formatFilter !== 'all' ? formatFilter : undefined,
      minRate: minRating >= 1 ? Math.floor(minRating) : undefined,
      genre: genreList.length ? genreList : undefined,
      year: yearFilter >= 1800 && yearFilter <= 2100 ? yearFilter : undefined,
      hasSeries:
        hasSeriesFilter === 'yes' ? (1 as const) : hasSeriesFilter === 'no' ? (0 as const) : undefined,
    };
    const hasBookFilters = Boolean(
      bookFilters.format ||
        bookFilters.minRate ||
        (Array.isArray(bookFilters.genre) && bookFilters.genre.length) ||
        bookFilters.year ||
        bookFilters.hasSeries === 0 ||
        bookFilters.hasSeries === 1,
    );

    const filterKey = [
      debouncedSearch,
      subTab,
      catalogSort,
      entitySort,
      minRating,
      formatFilter,
      genreList.join(','),
      yearFilter,
      hasSeriesFilter,
    ].join('|');
    const filterChanged = listFilterKeyRef.current !== filterKey;
    listFilterKeyRef.current = filterKey;

    // Filters always reset pagination — never append a new filter onto an old list.
    if (filterChanged) {
      append = false;
      listPageRef.current = 1;
      setListPage((p) => (p === 1 ? p : 1));
      setBooksList([]);
    }

    const reqId = ++dataRequestRef.current;
    const q = debouncedSearch;
    const page = listPageRef.current;
    const isBooks = subTab === 'books';

    if (
      subTab === 'genres' &&
      genresLoadedRef.current &&
      genresSortRef.current === entitySort
    ) {
      setBooksLoading(false);
      setBooksLoadingMore(false);
      setIsRefreshing(false);
      setBrowseLoading(false);
      return;
    }

    if (isBooks) {
      if (append) setBooksLoadingMore(true);
      else if (q.length > 0 || hasBookFilters || booksListRef.current.length === 0) setBooksLoading(true);
      else setIsRefreshing(true);
    } else {
      setBrowseLoading(true);
    }
    setError('');

    void (async () => {
      try {
        if (subTab === 'books') {
          const data =
            q.length > 0 || hasBookFilters
              ? await searchCatalog(serverConfig, {
                  q: q.length > 0 ? q : '',
                  field: 'books',
                  sort: catalogSort,
                  page,
                  ...bookFilters,
                })
              : await fetchRecentBooks(serverConfig, page, catalogSort);
          if (reqId !== dataRequestRef.current) return;
          const mapped = data.items.map((item) => mapServerBook(item as InpxBookItem, serverConfig) as Book);
          setBooksList((prev) => (append && page > 1 ? [...prev, ...mapped] : mapped));
          setListTotal(data.total);
          setListPageSize(data.pageSize);
          if (!append || page <= 1) {
            setSearchHints(
              q.length > 0 && 'searchHints' in data && data.searchHints
                ? data.searchHints
                : null,
            );
          }
        } else if (subTab === 'authors') {
          // Browse + live filter via /api/browse/authors?q= (same as typing on server).
          const data = await fetchAuthors(serverConfig, q, page, entitySort);
          if (reqId !== dataRequestRef.current) return;
          setServerAuthors(
            data.items.map((a) => ({
              key: a.name,
              label: displayAuthorName(a.name, a.displayName),
              bookCount: a.bookCount ?? 0,
            })),
          );
          setListTotal(data.total);
          setListPageSize(data.pageSize);
        } else if (subTab === 'series') {
          const data = await fetchSeries(serverConfig, q, page, entitySort);
          if (reqId !== dataRequestRef.current) return;
          setServerSeries(
            data.items.map((s) => ({
              key: s.name,
              label: s.displayName?.trim() || s.name,
              bookCount: s.bookCount ?? 0,
            })),
          );
          setListTotal(data.total);
          setListPageSize(data.pageSize);
        } else if (subTab === 'genres') {
          const data = await fetchGenres(serverConfig, entitySort);
          if (reqId !== dataRequestRef.current) return;
          genresCacheRef.current = Array.isArray(data.groups) ? data.groups : [];
          genresLoadedRef.current = true;
          genresSortRef.current = entitySort;
          const groups = applyGenreFilter(genresCacheRef.current, searchInput.trim());
          setListTotal(groups.reduce((n, g) => n + g.items.length, 0));
          setServerGenreGroups(groups);
        }
      } catch (err: unknown) {
        if (reqId !== dataRequestRef.current) return;
        handleFetchError(err);
      } finally {
        if (reqId === dataRequestRef.current) {
          setBooksLoading(false);
          setBooksLoadingMore(false);
          setBrowseLoading(false);
          setIsRefreshing(false);
        }
      }
    })();
    return () => {
      dataRequestRef.current += 1;
    };
  }, [
    debouncedSearch,
    subTab,
    catalogSort,
    entitySort,
    paginationVersion,
    isServerConnected,
    selectedAuthor,
    selectedSeries,
    selectedSubgenre,
    serverConfig,
    minRating,
    formatFilter,
    genreFilter,
    yearFilter,
    hasSeriesFilter,
    pauseListFetch,
    handleFetchError,
  ]);

  React.useEffect(() => {
    if (!isServerConnected || subTab !== 'genres' || selectedAuthor || selectedSeries || selectedSubgenre) return;
    if (!genresLoadedRef.current) return;
    const groups = applyGenreFilter(genresCacheRef.current, searchInput.trim());
    setListTotal(groups.reduce((n, g) => n + g.items.length, 0));
    setServerGenreGroups(groups);
  }, [searchInput, subTab, isServerConnected, selectedAuthor, selectedSeries, selectedSubgenre]);

  const reconnectKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = `${serverConfig.url}|${serverConfig.connectionStatus}`;
    const prev = reconnectKeyRef.current;
    reconnectKeyRef.current = key;
    // Skip first mount — remount must not wipe App-level drill-down (author/series).
    if (prev === null) return;
    if (prev === key) return;
    onReconnectReset?.();
    setFacetBooks([]);
    setAuthorGrouped(null);
    setAuthorOutsideSeries(false);
    setListTotal(0);
    appendBooksRef.current = false;
    listPageRef.current = 1;
    setListPage(1);
    setPaginationVersion(0);
    setFacetPage(1);
    genresLoadedRef.current = false;
    genresCacheRef.current = [];
    setBooksList([]);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverConfig.url, serverConfig.connectionStatus]);

  React.useEffect(() => {
    if (!selectedAuthor && !selectedSeries && !selectedSubgenre) {
      setFacetBooks([]);
      setAuthorGrouped(null);
      setAuthorOutsideSeries(false);
      return;
    }
    if (!isServerConnected || pauseListFetch) {
      setFacetLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setFacetLoading(true);
      setError('');
      try {
        if (selectedAuthor && !selectedSeries && !selectedSubgenre) {
          const grouped = await fetchAuthorGrouped(serverConfig, selectedAuthor, catalogSort);
          if (cancelled) return;
          setAuthorGrouped({
            series: grouped.series.map((s) => ({
              name: s.name,
              displayName: s.displayName,
              bookCount: s.bookCount,
              books: Array.isArray(s.books)
                ? sortBooksBySeriesVolume(
                    s.books.map(
                      (item) =>
                        mapServerBook(item, serverConfig, {
                          preferredSeries: s.name,
                        }) as Book,
                    ),
                  )
                : undefined,
            })),
            standaloneBooks: grouped.standaloneBooks.map((item) => mapServerBook(item, serverConfig) as Book),
            total: grouped.total,
            bioHtml: grouped.bioHtml,
            hasPortrait: grouped.hasPortrait,
            authorName: grouped.authorName || selectedAuthor,
          });
          // Keep authorOutsideSeries — refetch (sort/filters) must not kick user out of «Вне серий».
          setFacetBooks([]);
        } else {
          setAuthorGrouped(null);
          let facet: 'authors' | 'series' | 'genres' = 'authors';
          let value = selectedSeries || selectedSubgenre?.name || selectedAuthor || '';
          if (selectedSeries) facet = 'series';
          else if (selectedSubgenre) facet = 'genres';
          // Book sorts from header (rating/title/…); series default is set by openSeriesPage → 'series'
          const data = await fetchFacetBooks(serverConfig, facet, value, facetPage, {
            author: selectedSeries && selectedAuthor ? selectedAuthor : undefined,
            sort: catalogSort,
            format: formatFilter !== 'all' ? formatFilter : undefined,
            year: yearFilter >= 1800 && yearFilter <= 2100 ? yearFilter : undefined,
            minRate: minRating >= 1 ? Math.floor(minRating) : undefined,
            hasSeries:
              hasSeriesFilter === 'yes' ? 1 : hasSeriesFilter === 'no' ? 0 : undefined,
          });
          if (cancelled) return;
          const mapped = data.items.map((item) =>
            mapServerBook(item, serverConfig, {
              preferredSeries: selectedSeries || undefined,
            }) as Book,
          );
          // Only re-order locally when sorting by series volume; otherwise keep server order.
          setFacetBooks(
            selectedSeries && catalogSort === 'series' ? sortBooksBySeriesVolume(mapped) : mapped,
          );
          setFacetTotal(data.total);
          setFacetPageSize(data.pageSize);
        }
      } catch (e) {
        if (cancelled) return;
        handleFetchError(e);
        setFacetBooks([]);
        setAuthorGrouped(null);
      } finally {
        if (!cancelled) setFacetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedAuthor,
    selectedSeries,
    selectedSubgenre,
    isServerConnected,
    pauseListFetch,
    serverConfig,
    catalogSort,
    facetPage,
    minRating,
    formatFilter,
    yearFilter,
    hasSeriesFilter,
    handleFetchError,
  ]);

  return {
    booksLoading,
    booksLoadingMore,
    browseLoading,
    isRefreshing,
    booksList,
    setBooksList,
    searchHints,
    listPage,
    listTotal,
    listPageSize,
    facetPage,
    setFacetPage,
    facetTotal,
    facetPageSize,
    error,
    setError,
    serverAuthors,
    serverSeries,
    serverGenreGroups,
    facetBooks,
    authorGrouped,
    authorOutsideSeries,
    setAuthorOutsideSeries,
    facetLoading,
    hasMoreBooks,
    loadMoreBooks,
    refreshCatalog,
    handleListPageChange,
  };
}
