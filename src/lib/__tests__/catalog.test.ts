import { describe, it, expect } from 'vitest';
import { buildLocalAggregations } from '../catalogAggregations';
import { filterAndSortBooks, getActiveBookPool, formatSuggestCount } from '../catalogBookPool';
import type { Book } from '../../types';

const sampleBooks: Book[] = [
  {
    id: '1',
    title: 'Alpha',
    author: 'Author A',
    series: 'Series X',
    genre: 'Fantasy',
    subgenre: 'Epic',
    ext: 'fb2',
    rating: 4.8,
    downloadsCount: 100,
    year: 2020,
    size: 500_000,
  },
  {
    id: '2',
    title: 'Beta',
    author: 'Author B',
    series: 'Series Y',
    genre: 'Fantasy',
    subgenre: 'Urban',
    ext: 'epub',
    rating: 3.5,
    downloadsCount: 50,
    year: 2019,
    size: 300_000,
  },
  {
    id: '3',
    title: 'Gamma',
    author: 'Author A',
    ext: 'fb2',
    rating: 4.0,
    downloadsCount: 80,
    year: 2021,
    size: 200_000,
  },
];

describe('catalogAggregations', () => {
  it('groups authors and sorts by count', () => {
    const { authors, series } = buildLocalAggregations(sampleBooks, 'count', 'count');
    expect(authors[0].name).toBe('Author A');
    expect(authors[0].bookCount).toBe(2);
    expect(series).toHaveLength(2);
  });
});

describe('catalogBookPool', () => {
  it('filters by author locally', () => {
    const ctx = {
      isServerBrowse: false,
      isSearchActive: false,
      subTab: 'books' as const,
      searchInput: '',
      selectedAuthor: 'Author A',
      selectedSeries: null,
      selectedSubgenre: null,
      minRating: 0,
      formatFilter: 'all' as const,
      sortBy: 'title' as const,
      booksList: sampleBooks,
      facetBooks: [],
      authorGrouped: null,
      authorOutsideSeries: false,
    };
    const pool = getActiveBookPool(ctx);
    expect(pool).toHaveLength(2);
    expect(pool.every((b) => b.author === 'Author A')).toBe(true);
  });

  it('server drill-down with empty facet does not fall back to hub list', () => {
    const ctx = {
      isServerBrowse: true,
      isSearchActive: false,
      subTab: 'books' as const,
      searchInput: '',
      selectedAuthor: null,
      selectedSeries: 'Series X',
      selectedSubgenre: null,
      minRating: 0,
      formatFilter: 'all' as const,
      sortBy: 'title' as const,
      booksList: sampleBooks,
      facetBooks: [] as Book[],
      authorGrouped: null,
      authorOutsideSeries: false,
    };
    expect(getActiveBookPool(ctx)).toEqual([]);
  });

  it('sorts by rating in demo mode', () => {
    const ctx = {
      isServerBrowse: false,
      isSearchActive: false,
      subTab: 'books' as const,
      searchInput: '',
      selectedAuthor: null,
      selectedSeries: null,
      selectedSubgenre: null,
      minRating: 0,
      formatFilter: 'all' as const,
      sortBy: 'rating' as const,
      booksList: sampleBooks,
      facetBooks: [],
      authorGrouped: null,
      authorOutsideSeries: false,
    };
    const sorted = filterAndSortBooks(sampleBooks, ctx);
    expect(sorted[0].id).toBe('1');
  });

  it('formats suggest count in Russian', () => {
    expect(formatSuggestCount(1)).toContain('книга');
    expect(formatSuggestCount(3)).toContain('книги');
    expect(formatSuggestCount(11)).toContain('книг');
  });
});
