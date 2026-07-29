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
