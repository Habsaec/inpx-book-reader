import type { Book } from '../types';

export type DemoBookSort = 'rating' | 'downloads' | 'title' | 'year' | 'size';
export type AuthorSeriesSort = 'rating' | 'count' | 'name';

export interface LocalAuthorAgg {
  name: string;
  bookCount: number;
  avgRating: number;
  totalDownloads: number;
  books: Book[];
}

export interface LocalSeriesAgg {
  name: string;
  bookCount: number;
  avgRating: number;
  totalDownloads: number;
  books: Book[];
}

export interface LocalSubgenreAgg {
  name: string;
  count: number;
  avgRating: number;
  books: Book[];
}

export interface LocalGenreAgg {
  name: string;
  count: number;
  avgRating: number;
  subgenres: Record<string, LocalSubgenreAgg>;
}

export function buildLocalAggregations(
  booksList: Book[],
  authorSortBy: AuthorSeriesSort,
  seriesSortBy: AuthorSeriesSort,
): { authors: LocalAuthorAgg[]; series: LocalSeriesAgg[]; genres: LocalGenreAgg[] } {
  const authorsMap = new Map<string, { books: Book[]; totalRating: number; totalDownloads: number }>();
  const seriesMap = new Map<string, { books: Book[]; totalRating: number; totalDownloads: number }>();
  const genreTree: Record<string, LocalGenreAgg> = {};

  for (const book of booksList) {
    const authorName = book.author || 'Неизвестный автор';
    const authorData = authorsMap.get(authorName) || { books: [], totalRating: 0, totalDownloads: 0 };
    authorData.books.push(book);
    authorData.totalRating += book.rating || 4.5;
    authorData.totalDownloads += book.downloadsCount || 100;
    authorsMap.set(authorName, authorData);

    if (book.series) {
      const seriesData = seriesMap.get(book.series) || { books: [], totalRating: 0, totalDownloads: 0 };
      seriesData.books.push(book);
      seriesData.totalRating += book.rating || 4.5;
      seriesData.totalDownloads += book.downloadsCount || 100;
      seriesMap.set(book.series, seriesData);
    }

    const parentGenre = book.genre || 'Другое';
    const childGenre = book.subgenre || 'Разное';

    if (!genreTree[parentGenre]) {
      genreTree[parentGenre] = { name: parentGenre, count: 0, avgRating: 0, subgenres: {} };
    }
    const pGenre = genreTree[parentGenre];
    pGenre.count += 1;

    if (!pGenre.subgenres[childGenre]) {
      pGenre.subgenres[childGenre] = { name: childGenre, count: 0, avgRating: 0, books: [] };
    }
    const cGenre = pGenre.subgenres[childGenre];
    cGenre.count += 1;
    cGenre.books.push(book);
  }

  for (const parent of Object.values(genreTree)) {
    let totalParentRating = 0;
    for (const sub of Object.values(parent.subgenres)) {
      const subSum = sub.books.reduce((sum, b) => sum + (b.rating || 4.5), 0);
      sub.avgRating = Number((subSum / sub.books.length).toFixed(1));
      totalParentRating += subSum;
    }
    parent.avgRating = Number((totalParentRating / parent.count).toFixed(1));
  }

  const sortAuthors = (a: LocalAuthorAgg, b: LocalAuthorAgg) => {
    if (authorSortBy === 'rating') return b.avgRating - a.avgRating;
    if (authorSortBy === 'count') return b.bookCount - a.bookCount;
    return a.name.localeCompare(b.name);
  };

  const sortSeries = (a: LocalSeriesAgg, b: LocalSeriesAgg) => {
    if (seriesSortBy === 'rating') return b.avgRating - a.avgRating;
    if (seriesSortBy === 'count') return b.bookCount - a.bookCount;
    return a.name.localeCompare(b.name);
  };

  const authors = Array.from(authorsMap.entries())
    .map(([name, data]) => ({
      name,
      bookCount: data.books.length,
      avgRating: Number((data.totalRating / data.books.length).toFixed(1)),
      totalDownloads: data.totalDownloads,
      books: data.books,
    }))
    .sort(sortAuthors);

  const series = Array.from(seriesMap.entries())
    .map(([name, data]) => ({
      name,
      bookCount: data.books.length,
      avgRating: Number((data.totalRating / data.books.length).toFixed(1)),
      totalDownloads: data.totalDownloads,
      books: data.books,
    }))
    .sort(sortSeries);

  return { authors, series, genres: Object.values(genreTree) };
}
