import {
  fetchBookMeta,
  fetchFacetBooks,
  mapServerBook,
  pickSeriesFromItem,
  type InpxBookItem,
} from './inpxClient';
import type { Book, ServerConfig } from '../types';

export interface SeriesTrackItem {
  id: string;
  title: string;
  seriesNo?: number;
  book: Book;
}

export interface NextInSeriesResult {
  seriesName: string;
  seriesDisplayName: string;
  current: Book;
  next: Book;
  track: SeriesTrackItem[];
}

export async function fetchAllSeriesBooks(
  config: ServerConfig,
  seriesName: string,
  author?: string,
): Promise<InpxBookItem[]> {
  const all: InpxBookItem[] = [];
  let page = 1;
  let total = Infinity;
  while (all.length < total && page <= 40) {
    const data = await fetchFacetBooks(config, 'series', seriesName, page, {
      sort: 'series',
      author,
    });
    total = data.total ?? all.length + data.items.length;
    all.push(...data.items);
    if (data.items.length === 0) break;
    page += 1;
  }
  return all;
}

export async function loadSeriesTrack(
  config: ServerConfig,
  seriesName: string,
  author?: string,
): Promise<SeriesTrackItem[]> {
  const items = await fetchAllSeriesBooks(config, seriesName, author);
  return buildSeriesTrack(items, config);
}

export function buildSeriesTrack(
  items: InpxBookItem[],
  config: ServerConfig,
): SeriesTrackItem[] {
  return items.map((item) => {
    const book = mapServerBook(item, config);
    const { seriesNo } = pickSeriesFromItem(item);
    return {
      id: item.id,
      title: item.title,
      seriesNo: seriesNo ?? book.seriesNo,
      book,
    };
  });
}

/**
 * Resolve the next unread volume in the same series after `bookId`.
 * Uses GET /api/books/:id/meta + GET /api/facet-books?facet=series&sort=series.
 */
export async function resolveNextInSeries(
  config: ServerConfig,
  bookId: string,
  readIds: Set<string> | string[],
  opts?: { author?: string; treatCurrentAsRead?: boolean },
): Promise<NextInSeriesResult | null> {
  const readSet = readIds instanceof Set ? readIds : new Set(readIds);
  const meta = await fetchBookMeta(config, bookId);
  if (!meta) return null;

  const { series, seriesNo } = pickSeriesFromItem(meta);
  if (!series) return null;

  const displayName =
    meta.seriesList?.[0]?.displayName?.trim() ||
    meta.series?.trim() ||
    series;

  const items = await fetchAllSeriesBooks(config, series, opts?.author);
  if (items.length === 0) return null;

  const track = buildSeriesTrack(items, config);
  const idx = items.findIndex((b) => b.id === bookId);
  if (idx < 0) {
    // Fallback: find by seriesNo order
    const sorted = [...items].sort((a, b) => {
      const na = pickSeriesFromItem(a).seriesNo ?? 0;
      const nb = pickSeriesFromItem(b).seriesNo ?? 0;
      return na - nb;
    });
    const curIdx = sorted.findIndex((b) => b.id === bookId);
    const start = curIdx >= 0 ? curIdx + 1 : 0;
    for (let i = start; i < sorted.length; i++) {
      const candidate = sorted[i];
      if (opts?.treatCurrentAsRead && candidate.id === bookId) continue;
      if (!readSet.has(candidate.id) && candidate.id !== bookId) {
        return {
          seriesName: series,
          seriesDisplayName: displayName,
          current: mapServerBook(meta, config),
          next: mapServerBook(candidate, config),
          track: buildSeriesTrack(sorted, config),
        };
      }
    }
    return null;
  }

  for (let i = idx + 1; i < items.length; i++) {
    const candidate = items[i];
    if (!readSet.has(candidate.id)) {
      return {
        seriesName: series,
        seriesDisplayName: displayName,
        current: mapServerBook(meta, config),
        next: mapServerBook(candidate, config),
        track,
      };
    }
  }

  // If seriesNo suggests a later volume not ordered after current id:
  if (seriesNo != null) {
    for (const candidate of items) {
      if (candidate.id === bookId) continue;
      const n = pickSeriesFromItem(candidate).seriesNo;
      if (n != null && n > seriesNo && !readSet.has(candidate.id)) {
        return {
          seriesName: series,
          seriesDisplayName: displayName,
          current: mapServerBook(meta, config),
          next: mapServerBook(candidate, config),
          track,
        };
      }
    }
  }

  return null;
}
