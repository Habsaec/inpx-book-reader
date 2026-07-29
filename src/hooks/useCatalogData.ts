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
  CatalogBookSort,
  CatalogEntitySort,
  type InpxBookItem,
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
  series: Array<{ name: string; displayName?: string; bookCount: number }>;
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
}: UseCatalogDataOptions) {
  const [booksLoading, setBooksLoading] = React.useState(false);
  const [booksLoadingMore, setBooksLoadingMore] = React.useState(false);
  const [browseLoading, setBrowseLoading] = React.useState(false);
  const [booksList, setBooksList] = React.useState<Book[]>([]);
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

  const [serverAuthors, setServerAuthors] = React.useState<CatalogAuthorRow[]>([]);
  const [serverSeries, setServerSeries] = React.useState<CatalogSeriesRow[]>([]);
  const [serverGenreGroups, setServerGenreGroups] = React.useState<
    Array<{ groupName: string; items: Array<{ name: string; bookCount?: number }> }>
  >([]);
  const [facetBooks, setFacetBooks] = React.useState<Book[]>([]);
  const [authorGrouped, setAuthorGrouped] = React.useState<AuthorGroupedState | null>(null);
  const [authorOutsideSeries, setAuthorOutsideSeries] = React.useState(false);
  const [facetLoading, setFacetLoading] = React.useState(false);

  listPageRef.current = listPage;

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
    }
  }, [subTab]);

  React.useEffect(() => {
    appendBooksRef.current = false;
    listPageRef.current = 1;
    setListPage(1);
    // Drop stale recent/previous hits so the UI shows a skeleton, not wrong books.
    const genreList = (Array.isArray(genreFilter) ? genreFilter : String(genreFilter || '').split(','))
      .map((g) => g.trim())
      .filter(Boolean);
    const hasFilters =
      minRating >= 1 ||
      formatFilter !== 'all' ||
      genreList.length > 0 ||
      yearFilter > 0 ||
      hasSeriesFilter !== 'any';
    if (debouncedSearch.trim() || hasFilters) {
      setBooksList([]);
    }
  }, [
    debouncedSearch,
    subTab,
    catalogSort,
    entitySort,
    minRating,
    formatFilter,
    genreFilter,
    yearFilter,
    hasSeriesFilter,
  ]);

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
    if (!isServerConnected || selectedAuthor || selectedSeries || selectedSubgenre) return;
    if (pauseListFetch) {
      setBooksLoading(false);
      setBooksLoadingMore(false);
      setBrowseLoading(false);
      setIsRefreshing(false);
      return;
    }

    const reqId = ++dataRequestRef.current;
    const q = debouncedSearch;
    const page = listPageRef.current;
    const isBooks = subTab === 'books';
    const append = appendBooksRef.current;
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
        if (subTab === 'genres' && genresLoadedRef.current) {
          return;
        }

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
        } else if (subTab === 'authors') {
          const data = q.length > 0
            ? await searchCatalog(serverConfig, { q, field: 'authors', sort: entitySort, page })
            : await fetchAuthors(serverConfig, '', page, entitySort);
          if (reqId !== dataRequestRef.current) return;
          setServerAuthors(
            (q.length > 0
              ? (data.items as Array<{ name: string; displayName?: string; bookCount?: number; count?: number }>)
              : data.items
            ).map((a) => ({
              key: a.name,
              label: displayAuthorName(a.name, 'displayName' in a ? a.displayName : undefined),
              bookCount: ('bookCount' in a ? a.bookCount : undefined) ?? ('count' in a ? a.count : undefined) ?? 0,
            })),
          );
          setListTotal(data.total);
          setListPageSize(data.pageSize);
        } else if (subTab === 'series') {
          const data = q.length > 0
            ? await searchCatalog(serverConfig, { q, field: 'series', sort: entitySort, page })
            : await fetchSeries(serverConfig, '', page, entitySort);
          if (reqId !== dataRequestRef.current) return;
          setServerSeries(
            (q.length > 0
              ? (data.items as Array<{ name: string; displayName?: string; bookCount?: number; count?: number }>)
              : data.items
            ).map((s) => ({
              key: s.name,
              label: ('displayName' in s ? s.displayName?.trim() : undefined) || s.name,
              bookCount: ('bookCount' in s ? s.bookCount : undefined) ?? ('count' in s ? s.count : undefined) ?? 0,
            })),
          );
          setListTotal(data.total);
          setListPageSize(data.pageSize);
        } else if (subTab === 'genres') {
          const data = await fetchGenres(serverConfig);
          if (reqId !== dataRequestRef.current) return;
          genresCacheRef.current = Array.isArray(data.groups) ? data.groups : [];
          genresLoadedRef.current = true;
          const groups = applyGenreFilter(genresCacheRef.current, searchInput.trim());
          setListTotal(groups.reduce((n, g) => n + g.items.length, 0));
          setServerGenreGroups(groups);
        }
      } catch (err: unknown) {
        if (reqId !== dataRequestRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Ошибка: ${msg}`);
      } finally {
        if (reqId === dataRequestRef.current) {
          setBooksLoading(false);
          setBooksLoadingMore(false);
          setBrowseLoading(false);
          setIsRefreshing(false);
        }
      }
    })();
  }, [
    debouncedSearch,
    subTab,
    catalogSort,
    entitySort,
    listPage,
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
  ]);

  React.useEffect(() => {
    if (!isServerConnected || subTab !== 'genres' || selectedAuthor || selectedSeries || selectedSubgenre) return;
    if (!genresLoadedRef.current) return;
    const groups = applyGenreFilter(genresCacheRef.current, searchInput.trim());
    setListTotal(groups.reduce((n, g) => n + g.items.length, 0));
    setServerGenreGroups(groups);
  }, [searchInput, subTab, isServerConnected, selectedAuthor, selectedSeries, selectedSubgenre]);

  React.useEffect(() => {
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
    if (!isServerConnected) return;

    void (async () => {
      setFacetLoading(true);
      try {
        if (selectedAuthor && !selectedSeries && !selectedSubgenre) {
          const grouped = await fetchAuthorGrouped(serverConfig, selectedAuthor, catalogSort);
          setAuthorGrouped({
            series: grouped.series,
            standaloneBooks: grouped.standaloneBooks.map((item) => mapServerBook(item, serverConfig) as Book),
            total: grouped.total,
            bioHtml: grouped.bioHtml,
            hasPortrait: grouped.hasPortrait,
            authorName: grouped.authorName || selectedAuthor,
          });
          setAuthorOutsideSeries(false);
          setFacetBooks([]);
        } else {
          setAuthorGrouped(null);
          let facet: 'authors' | 'series' | 'genres' = 'authors';
          let value = selectedSeries || selectedSubgenre?.name || selectedAuthor || '';
          if (selectedSeries) facet = 'series';
          else if (selectedSubgenre) facet = 'genres';
          // Серия: как на сервере — sort=series (по номеру тома), номер из book_series
          const facetSort = selectedSeries ? 'series' : catalogSort;
          const data = await fetchFacetBooks(serverConfig, facet, value, facetPage, {
            author: selectedSeries && selectedAuthor ? selectedAuthor : undefined,
            sort: facetSort,
          });
          setFacetBooks(
            selectedSeries
              ? sortBooksBySeriesVolume(
                  data.items.map(
                    (item) =>
                      mapServerBook(item, serverConfig, {
                        preferredSeries: selectedSeries,
                      }) as Book,
                  ),
                )
              : data.items.map((item) => mapServerBook(item, serverConfig) as Book),
          );
          setFacetTotal(data.total);
          setFacetPageSize(data.pageSize);
        }
      } catch (e) {
        console.error('Facet books failed', e);
        setFacetBooks([]);
        setAuthorGrouped(null);
      } finally {
        setFacetLoading(false);
      }
    })();
  }, [selectedAuthor, selectedSeries, selectedSubgenre, isServerConnected, serverConfig, catalogSort, facetPage]);

  return {
    booksLoading,
    booksLoadingMore,
    browseLoading,
    isRefreshing,
    booksList,
    setBooksList,
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
