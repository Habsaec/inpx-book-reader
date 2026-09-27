import type { Book } from '../types';

/** Sort key for series volume (numeric first; unnumbered last). */
export function seriesVolumeSortKey(book: Pick<Book, 'seriesNo' | 'seriesNoLabel' | 'title'>): number {
  const raw = (book.seriesNoLabel ?? book.seriesNo ?? '').toString().trim();
  if (!raw) return Number.POSITIVE_INFINITY;
  const n = Number(raw.replace(',', '.'));
  if (Number.isFinite(n)) return n;
  const m = raw.match(/\d+/);
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
}

export function sortBooksBySeriesVolume<T extends Pick<Book, 'seriesNo' | 'seriesNoLabel' | 'title'>>(
  books: T[],
): T[] {
  return [...books].sort((a, b) => {
    const ka = seriesVolumeSortKey(a);
    const kb = seriesVolumeSortKey(b);
    if (ka !== kb) return ka - kb;
    return a.title.localeCompare(b.title, 'ru');
  });
}

/** Page of a series list (24 per page) that should contain this volume when numbers are dense. */
export function seriesPageForVolume(seriesNo: number | undefined, pageSize: number, total: number): number {
  const size = pageSize > 0 ? pageSize : 24;
  if (!seriesNo || seriesNo <= size) return 1;
  const last = Math.max(1, Math.ceil(Math.max(total, 1) / size));
  return Math.min(last, Math.ceil(seriesNo / size));
}

/**
 * Volumes to show on the book page.
 * Prefer later numbers; if this book is last or unnumbered, the rest of the series.
 */
export function booksAfterInSeries<T extends Pick<Book, 'id' | 'seriesNo' | 'seriesNoLabel' | 'title'>>(
  current: T,
  items: T[],
  limit = 12,
): { later: boolean; books: T[] } {
  const others = sortBooksBySeriesVolume(items.filter((item) => item.id !== current.id));
  if (!others.length) return { later: false, books: [] };
  const currentKey = seriesVolumeSortKey(current);
  if (Number.isFinite(currentKey)) {
    const later = others.filter((item) => {
      const key = seriesVolumeSortKey(item);
      return Number.isFinite(key) && key > currentKey;
    });
    if (later.length) return { later: true, books: later.slice(0, limit) };
    const earlier = others.filter((item) => {
      const key = seriesVolumeSortKey(item);
      return Number.isFinite(key) && key < currentKey;
    });
    if (earlier.length) return { later: false, books: earlier.slice(-limit) };
  }
  return { later: false, books: others.slice(0, limit) };
}
