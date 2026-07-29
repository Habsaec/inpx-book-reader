import { Book, ReadingProgress } from '../types';
import { readOfflineReaderData } from './offlineReaderStore';

export function localReaderProgressByBookId(bookIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of bookIds) {
    const pct = Math.round(readOfflineReaderData(id).progress);
    if (pct > 0) out[id] = pct;
  }
  return out;
}

export function upsertProgressFromLocalReader(
  progressList: ReadingProgress[],
  book: Book,
): ReadingProgress[] {
  const data = readOfflineReaderData(book.id);
  const pct = Math.round(data.progress);
  if (pct <= 0 && !data.position) return progressList;

  const lastRead = Date.parse(data.positionChangedAt || data.updatedAt || '') || Date.now();
  if (!Number.isFinite(lastRead)) return progressList;

  const finished = pct >= 95;
  const existing = progressList.find((p) => p.bookId === book.id);

  if (existing) {
    return progressList.map((p) =>
      p.bookId === book.id
        ? {
            ...p,
            bookTitle: book.title || p.bookTitle,
            authorName: book.author || p.authorName,
            percentage: pct,
            finished,
            lastRead: Math.max(p.lastRead, lastRead),
          }
        : p,
    );
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
    .sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt));
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
    const localTs = Date.parse(local.lastOpenedAt);
    const serverTs = Date.parse(existing.lastOpenedAt);
    const useLocal = Number.isFinite(localTs) && (!Number.isFinite(serverTs) || localTs >= serverTs);
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

  return [...byId.values()].sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt));
}
