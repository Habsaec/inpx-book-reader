import { Book, ReadingProgress } from '../types';
import { readOfflineReaderData } from './offlineReaderStore';
import { parseSyncTs } from './readerActivitySync';

export function localReaderProgressByBookId(bookIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of bookIds) {
    const pct = Math.round(readOfflineReaderData(id).progress);
    if (pct > 0) out[id] = pct;
  }
  return out;
}

/** A stored lastRead this far past the device clock came from a clock that was ahead. */
const FUTURE_SKEW_MS = 60 * 1000;

export function upsertProgressFromLocalReader(
  progressList: ReadingProgress[],
  book: Book,
  nowMs = Date.now(),
): ReadingProgress[] {
  const data = readOfflineReaderData(book.id);
  const pct = Math.round(data.progress);
  if (pct <= 0 && !data.position) return progressList;

  // Date.parse(...) || Date.now() превращал NaN в «сейчас» — битая метка времени
  // выбрасывала книгу наверх «Продолжить чтение».
  const parsed = parseSyncTs(data.positionChangedAt || data.updatedAt);
  if (!parsed) return progressList;
  const lastRead = parsed;

  const finished = pct >= 95;
  const existing = progressList.find((p) => p.bookId === book.id);

  if (existing) {
    return progressList.map((p) => {
      if (p.bookId !== book.id) return p;
      // LWW: процент/флаг перезаписываем только если локальное чтение не старше.
      // Метка «из будущего» (часы устройства потом ушли назад) иначе навсегда держала
      // старый процент: книга после чтения показывала прежние 30%.
      const storedInFuture = p.lastRead > nowMs + FUTURE_SKEW_MS;
      const localWins = storedInFuture || lastRead >= p.lastRead;
      return {
        ...p,
        bookTitle: book.title || p.bookTitle,
        authorName: book.author || p.authorName,
        percentage: localWins ? pct : p.percentage,
        finished: localWins ? finished : p.finished,
        lastRead: storedInFuture ? lastRead : Math.max(p.lastRead, lastRead),
      };
    });
  }

  return [
    ...progressList,
    {
      bookId: book.id,
      bookTitle: book.title,
      authorName: book.author,
      currentChapter: 0,
      percentage: pct,
      scrollPosition: 0,
      charPosition: 0,
      lastRead,
      finished,
    },
  ];
}

export type LocalRecentReadingItem = {
  id: string;
  title: string;
  authorsDisplay: string;
  ext: string;
  readProgress: number;
  lastOpenedAt: string;
  series?: string;
  seriesNo?: number;
  /** Library rating 1–5 from INPX `libRate` when known. */
  rating?: number;
};

export function buildLocalRecentReading(books: Book[]): LocalRecentReadingItem[] {
  return books
    .map((book) => {
      const data = readOfflineReaderData(book.id);
      if (data.recentHiddenAt) return null;
      const progress = Math.round(data.progress);
      if (progress <= 0 || !(data.positionChangedAt || data.updatedAt)) return null;
      const rating = Math.max(0, Math.min(5, Math.round(Number(book.rating) || 0)));
      const item: LocalRecentReadingItem = {
        id: book.id,
        title: book.title,
        authorsDisplay: book.author,
        ext: (book.ext || 'fb2').replace(/^\./, ''),
        readProgress: progress,
        lastOpenedAt: data.positionChangedAt || data.updatedAt || '',
        series: book.series,
        seriesNo: book.seriesNo,
        ...(rating > 0 ? { rating } : {}),
      };
      return item;
    })
    .filter((item): item is LocalRecentReadingItem => item != null)
    .sort((a, b) => parseSyncTs(b.lastOpenedAt) - parseSyncTs(a.lastOpenedAt));
}

export function mergeRecentReadingLists(
  serverRecent: LocalRecentReadingItem[],
  localRecent: LocalRecentReadingItem[],
): LocalRecentReadingItem[] {
  const byId = new Map<string, LocalRecentReadingItem>();

  for (const item of serverRecent) {
    byId.set(item.id, { ...item });
  }

  for (const local of localRecent) {
    const existing = byId.get(local.id);
    if (!existing) {
      byId.set(local.id, local);
      continue;
    }
    const localTs = parseSyncTs(local.lastOpenedAt);
    const serverTs = parseSyncTs(existing.lastOpenedAt);
    const useLocal = localTs > 0 && (serverTs === 0 || localTs >= serverTs);
    const merged: LocalRecentReadingItem = {
      ...existing,
      ...(useLocal ? local : {}),
      readProgress: useLocal ? local.readProgress : existing.readProgress,
      lastOpenedAt: useLocal ? local.lastOpenedAt : existing.lastOpenedAt,
    };
    const rating = existing.rating || local.rating;
    if (rating && rating > 0) merged.rating = rating;
    byId.set(local.id, merged);
  }

  return [...byId.values()].sort((a, b) => parseSyncTs(b.lastOpenedAt) - parseSyncTs(a.lastOpenedAt));
}

/**
 * «Читаю» lists books in progress only (like the web: reading history minus read books):
 * marked read on the server or finished here (≥ 99%) drop out.
 */
export function withoutFinishedReading<T extends { id: string; readProgress?: number }>(
  items: T[],
  readIds?: Set<string> | null,
  progressByBookId?: Record<string, number> | null,
): T[] {
  return items.filter((item) => {
    if (readIds?.has(item.id)) return false;
    const pct = Math.round(Number(progressByBookId?.[item.id] ?? item.readProgress) || 0);
    return pct < 99;
  });
}

/**
 * Books of the local «недавно читали» that the server's «Читаю» no longer has although they were
 * last read before the server's history last changed: removed there (web «Убрать»), so hide them
 * here too. A book read after that change is kept — its history may not have reached the server.
 */
export function recentRemovedOnServer(
  local: LocalRecentReadingItem[],
  serverIds: Set<string>,
  serverHistoryRev: string | null | undefined,
  readIds?: Set<string> | null,
): string[] {
  const revTs = parseSyncTs(serverHistoryRev);
  if (!revTs) return [];
  return local
    .filter((item) => {
      if (serverIds.has(item.id) || readIds?.has(item.id)) return false;
      const ts = parseSyncTs(item.lastOpenedAt);
      return ts > 0 && ts < revTs;
    })
    .map((item) => item.id);
}
