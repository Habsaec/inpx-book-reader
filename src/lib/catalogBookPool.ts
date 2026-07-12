import type { Book } from '../types';
import type { CatalogFormatFilter } from '../components/catalog/catalogTypes';
import type { DemoBookSort } from './catalogAggregations';

export interface CatalogBookPoolContext {
  isServerBrowse: boolean;
  isSearchActive: boolean;
  subTab: 'books' | 'authors' | 'series' | 'genres';
  searchInput: string;
  selectedAuthor: string | null;
  selectedSeries: string | null;
  selectedSubgenre: { parent: string; name: string } | null;
  minRating: number;
  formatFilter: CatalogFormatFilter;
  sortBy: DemoBookSort;
  booksList: Book[];
  facetBooks: Book[];
  authorGrouped?: {
    standaloneBooks: Book[];
  } | null;
  authorOutsideSeries: boolean;
}

export function getActiveBookPool(ctx: CatalogBookPoolContext): Book[] {
  const {
    isServerBrowse,
    selectedAuthor,
    selectedSeries,
    selectedSubgenre,
    authorGrouped,
    authorOutsideSeries,
    facetBooks,
    booksList,
  } = ctx;

  if (isServerBrowse && selectedAuthor && !selectedSeries && !selectedSubgenre && authorGrouped) {
    if (authorOutsideSeries) return authorGrouped.standaloneBooks;
    return [];
  }
  if (isServerBrowse && (selectedAuthor || selectedSeries || selectedSubgenre) && facetBooks.length) {
    return facetBooks;
  }
  if (selectedAuthor) {
    return booksList.filter((b) => b.author === selectedAuthor);
  }
  if (selectedSeries) {
    return booksList.filter((b) => b.series === selectedSeries);
  }
  if (selectedSubgenre) {
    return booksList.filter(
      (b) => b.genre === selectedSubgenre.parent && b.subgenre === selectedSubgenre.name,
    );
  }
  return booksList;
}

export function filterAndSortBooks(books: Book[], ctx: CatalogBookPoolContext): Book[] {
  let result = [...books];
  const {
    isServerBrowse,
    isSearchActive,
    subTab,
    searchInput,
    selectedAuthor,
    selectedSeries,
    selectedSubgenre,
    minRating,
    formatFilter,
    sortBy,
  } = ctx;

  if (!isServerBrowse && searchInput && !selectedAuthor && !selectedSeries && !selectedSubgenre) {
    const q = searchInput.toLowerCase();
    result = result.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        (b.series && b.series.toLowerCase().includes(q)),
    );
  } else if (!isServerBrowse && searchInput && (selectedAuthor || selectedSeries || selectedSubgenre)) {
    const q = searchInput.toLowerCase();
    result = result.filter((b) => b.title.toLowerCase().includes(q));
  }

  if (minRating > 0) {
    result = result.filter((b) => (b.rating || 0) >= minRating);
  }

  if (formatFilter !== 'all') {
    result = result.filter((b) => b.ext.toLowerCase() === formatFilter.toLowerCase());
  }

  if (!(isServerBrowse && (isSearchActive || subTab === 'books'))) {
    result.sort((a, b) => {
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'downloads') return (b.downloadsCount || 0) - (a.downloadsCount || 0);
      if (sortBy === 'year') return (b.year || 0) - (a.year || 0);
      if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
      return a.title.localeCompare(b.title);
    });
  }

  return result;
}

export function formatSuggestCount(count?: number): string {
  if (count == null || count <= 0) return '';
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'книга'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'книги'
        : 'книг';
  return `${count} ${word}`;
}
