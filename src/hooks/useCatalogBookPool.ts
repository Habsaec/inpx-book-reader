import React from 'react';
import { buildLocalAggregations } from '../lib/catalogAggregations';
import { filterAndSortBooks, getActiveBookPool } from '../lib/catalogBookPool';
import type { Book } from '../types';
import type { AuthorGroupedState } from './useCatalogData';
import type { CatalogSubTab } from '../components/catalog/catalogTypes';

export interface CatalogBookPoolInput {
  isServerConnected: boolean;
  isSearchActive: boolean;
  subTab: CatalogSubTab;
  searchInput: string;
  selectedAuthor: string | null;
  selectedSeries: string | null;
  selectedSubgenre: { parent: string; name: string } | null;
  minRating: number;
  formatFilter: 'all' | 'fb2' | 'epub' | 'txt';
  genreFilter?: string | string[];
  yearFilter?: number;
  hasSeriesFilter?: 'any' | 'yes' | 'no';
  sortBy: 'rating' | 'downloads' | 'title' | 'year' | 'size';
  booksList: Book[];
  facetBooks: Book[];
  authorGrouped: AuthorGroupedState | null;
  authorOutsideSeries: boolean;
  authorSortBy: 'rating' | 'count' | 'name';
  seriesSortBy: 'rating' | 'count' | 'name';
  serverAuthors: Array<{ key: string; label: string; bookCount: number }>;
  serverSeries: Array<{ key: string; label: string; bookCount: number }>;
  serverGenreGroups: Array<{
    groupName: string;
    items: Array<{ name: string; bookCount?: number; displayName?: string }>;
  }>;
}

export function useCatalogBookPool(input: CatalogBookPoolInput) {
  const {
    isServerConnected,
    isSearchActive,
    subTab,
    searchInput,
    selectedAuthor,
    selectedSeries,
    selectedSubgenre,
    minRating,
    formatFilter,
    genreFilter = '',
    yearFilter = 0,
    hasSeriesFilter = 'any',
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
  } = input;

  const aggregations = isServerConnected
    ? undefined
    : buildLocalAggregations(booksList, authorSortBy, seriesSortBy);

  const isServerBrowse = isServerConnected;

  const authors = isServerBrowse
    ? serverAuthors.map((a) => ({
        key: a.key,
        name: a.label,
        bookCount: a.bookCount,
        avgRating: 4.5,
        totalDownloads: a.bookCount * 50,
        books: [] as Book[],
      }))
    : aggregations?.authors ?? [];

  const series = isServerBrowse
    ? serverSeries.map((s) => ({
        key: s.key,
        name: s.label,
        bookCount: s.bookCount,
        avgRating: 4.5,
        totalDownloads: s.bookCount * 50,
        books: [] as Book[],
      }))
    : aggregations?.series ?? [];

  const genres = isServerBrowse && serverGenreGroups.length
    ? serverGenreGroups.map((g) => ({
        name: g.groupName,
        count: g.items.reduce((sum, i) => sum + (i.bookCount || 0), 0),
        avgRating: 4.5,
        subgenres: Object.fromEntries(
          g.items.map((item) => [
            item.name,
            {
              // ключ Record — код жанра для /api/facet-books; name — подпись
              name: item.displayName?.trim() || item.name,
              count: item.bookCount || 0,
              avgRating: 4.5,
              books: [] as Book[],
            },
          ]),
        ),
      }))
    : aggregations?.genres ?? [];

  const bookPoolCtx = React.useMemo(
    () => ({
      isServerBrowse,
      isSearchActive,
      subTab,
      searchInput,
      selectedAuthor,
      selectedSeries,
      selectedSubgenre,
      minRating,
      formatFilter,
      genreFilter,
      yearFilter,
      hasSeriesFilter,
      sortBy,
      booksList,
      facetBooks,
      authorGrouped,
      authorOutsideSeries,
    }),
    [
      isServerBrowse,
      isSearchActive,
      subTab,
      searchInput,
      selectedAuthor,
      selectedSeries,
      selectedSubgenre,
      minRating,
      formatFilter,
      genreFilter,
      yearFilter,
      hasSeriesFilter,
      sortBy,
      booksList,
      facetBooks,
      authorGrouped,
      authorOutsideSeries,
    ],
  );

  const currentBooks = React.useMemo(
    () => filterAndSortBooks(getActiveBookPool(bookPoolCtx), bookPoolCtx),
    [bookPoolCtx],
  );

  return { authors, series, genres, currentBooks, isServerBrowse };
}
