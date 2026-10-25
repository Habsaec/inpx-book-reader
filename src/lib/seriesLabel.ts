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

/**
 * Same series? Books carry the INPX spelling («Адвокат империи»), favorites and catalog
 * keys the lowercase `series_catalog.name` — compare case-, space- and ё-insensitively.
 */
export function sameSeriesName(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) =>
    String(v ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru').replace(/ё/g, 'е');
  const x = norm(a);
  return Boolean(x) && x === norm(b);
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

const BOOK_FILE_EXT = /\.(fb2\.zip|fb2|fbz|epub|zip|pdf|txt|djvu|mobi|azw3)$/i;
/** Download-site tails people leave in file names: `Litmir.net_bid212581_8d7a7`, `(royallib.com)`… */
const SITE_TAIL = /[\s_.-]*(?:\(?\s*(?:litmir|flibusta|royallib|rulit|libking|coollib|lib\.rus\.ec|bookz|twirpx)[^)\s]*\)?)(?:[\s_.-]*(?:bid)?\d+)?(?:[\s_.-]*[0-9a-f]{4,})?\s*$/i;

/**
 * A title that is really a file name (books opened from a folder before their metadata is read,
 * or saved that way earlier) → something readable: no extension, no site tail, spaces for `_`.
 * Real titles pass through unchanged.
 */
export function cleanFileLikeTitle(title: string): string {
  const raw = (title || '').trim();
  const looksLikeFile = BOOK_FILE_EXT.test(raw) || (raw.includes('_') && !/\s/.test(raw));
  if (!looksLikeFile) return raw;
  let name = raw.replace(BOOK_FILE_EXT, '');
  name = name.replace(SITE_TAIL, '');
  name = name.replace(/_+/g, ' ').replace(/\s*-\s*/g, ' — ').replace(/\s{2,}/g, ' ').trim();
  name = name.replace(/^—\s*|\s*—$/g, '').trim();
  return name || raw;
}

/** Book name on the details page: no volume prefix and no trailing `#N`. */
export function bookTitleWithoutVolume(book: {
  title: string;
  seriesNo?: number | string | null;
  seriesNoLabel?: string | null;
}): string {
  const title = cleanFileLikeTitle(book.title);
  const volume = seriesVolumeLabel(book);
  if (!volume) return title;
  return titleWithoutHashVolume(title, volume) || title;
}

/** «Том 33» under a title in tiles and lists (the volume no longer sits in front of the name). */
export function volumeCaption(book: { seriesNo?: number | string | null; seriesNoLabel?: string | null }): string {
  const volume = seriesVolumeLabel(book);
  return volume ? `Том ${volume}` : '';
}

/**
 * One-line title for sheet headers, search suggestions and screen readers: «Кодекс Охотника, том 33».
 * Tiles and rows show `bookTitleWithoutVolume` with `volumeCaption` on its own line instead.
 */
export function displayBookTitle(book: {
  title: string;
  seriesNo?: number | string | null;
  seriesNoLabel?: string | null;
}): string {
  const volume = seriesVolumeLabel(book);
  const name = bookTitleWithoutVolume(book);
  if (!volume) return name;
  return name ? `${name}, том ${volume}` : `Том ${volume}`;
}
