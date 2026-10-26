/**
 * «Читаю» rows: server reading history (`/api/profile` recentBooks, `/api/library/continue`)
 * and the device's own recent books share one shape, `LocalRecentReadingItem`.
 */
import type { Book, ServerConfig } from '../types';
import { bookContentUrl, displayCoverUrl, formatAuthorsFromItem, starsFromLibRate, type InpxBookItem } from './inpxClient';
import type { LocalRecentReadingItem } from './localReadingProgress';
import { readOfflineReaderData } from './offlineReaderStore';
import { parseSyncTs } from './readerActivitySync';

export function recentItemToBook(item: LocalRecentReadingItem, config: ServerConfig): Book {
  return {
    id: item.id,
    title: item.title,
    author: item.authorsDisplay,
    ext: item.ext,
    series: item.series,
    seriesNo: item.seriesNo,
    contentUrl: bookContentUrl(config, item.id),
    coverUrl: displayCoverUrl(config, item.id, 'thumb'),
    readProgress: item.readProgress,
    ...(item.rating && item.rating > 0 ? { rating: item.rating } : {}),
  };
}

/** A server history row (profile recentBooks or a `/api/library/continue` item). */
export function serverRecentItem(b: {
  id: string;
  title: string;
  authors?: string;
  authorsDisplay?: string;
  ext?: string;
  series?: string;
  seriesNo?: number | string | null;
  lastOpenedAt?: string;
  readProgress?: number | null;
  libRate?: unknown;
}): LocalRecentReadingItem {
  const rating = starsFromLibRate(b.libRate);
  return {
    id: b.id,
    title: b.title,
    // `/api/library/continue` items carry raw `authors` only; profile rows have `authorsDisplay`.
    authorsDisplay: b.authorsDisplay || formatAuthorsFromItem(b as InpxBookItem) || '',
    ext: (b.ext || 'fb2').replace(/^\./, ''),
    readProgress: b.readProgress != null ? Math.round(Number(b.readProgress)) : 0,
    lastOpenedAt: b.lastOpenedAt || new Date(0).toISOString(),
    series: b.series?.trim() || undefined,
    seriesNo: b.seriesNo != null && b.seriesNo !== '' ? Number(b.seriesNo) : undefined,
    ...(rating ? { rating } : {}),
  };
}

/**
 * Removed from «Читаю» on this device («Убрать» or a server-side removal) after it was last opened:
 * a server list fetched before the removal still has it.
 */
export function isRecentHiddenLocally(item: LocalRecentReadingItem): boolean {
  const hiddenAt = parseSyncTs(readOfflineReaderData(item.id).recentHiddenAt);
  return hiddenAt > 0 && hiddenAt >= parseSyncTs(item.lastOpenedAt);
}
