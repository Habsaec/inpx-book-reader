import type { Book } from '../types';

/**
 * Human-readable series name for UI. Prefers the server-provided `seriesDisplay`;
 * books saved before that field existed fall back to the lowercase lookup key
 * with a capitalized first letter. Navigation must keep using `book.series`.
 */
export function seriesLabel(book: Pick<Book, 'series' | 'seriesDisplay'>): string {
  const display = book.seriesDisplay?.trim();
  if (display) return display;
  const raw = (book.series || '').trim();
  return raw ? raw.charAt(0).toLocaleUpperCase() + raw.slice(1) : '';
}

/** Volume label for UI. Does not affect title sort. */
export function seriesVolumeLabel(book: {
  seriesNo?: number | string | null;
  seriesNoLabel?: string | null;
}): string {
  const label = book.seriesNoLabel?.trim();
  if (label) return label;
  const raw = book.seriesNo == null ? '' : String(book.seriesNo).trim();
  if (!raw || raw === '0') return '';
  const n = Number(raw.replace(',', '.'));
  if (Number.isFinite(n) && n <= 0) return '';
  return raw;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Catalog titles often already end with `#39`. Drop that when the same volume is prefixed. */
function titleWithoutHashVolume(title: string, volume: string): string {
  const re = new RegExp(`\\s*#\\s*${escapeRegExp(volume)}\\s*$`, 'u');
  return title.replace(re, '').trim();
}

/** Book name on the details page: no volume prefix and no trailing `#N`. */
export function bookTitleWithoutVolume(book: {
  title: string;
  seriesNo?: number | string | null;
  seriesNoLabel?: string | null;
}): string {
  const volume = seriesVolumeLabel(book);
  if (!volume) return book.title;
  return titleWithoutHashVolume(book.title, volume) || book.title;
}

/** Title as shown in lists. Volume prefix is display-only; sort keys stay on `title`. */
export function displayBookTitle(book: {
  title: string;
  seriesNo?: number | string | null;
  seriesNoLabel?: string | null;
}): string {
  const volume = seriesVolumeLabel(book);
  if (!volume) return book.title;
  const name = titleWithoutHashVolume(book.title, volume);
  return name ? `${volume}. ${name}` : volume;
}
