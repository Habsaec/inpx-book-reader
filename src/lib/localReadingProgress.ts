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

  const lastRead = data.updatedAt ? Date.parse(data.updatedAt) : Date.now();
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
            finished: finished || p.finished,
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
};

export function buildLocalRecentReading(books: Book[]): LocalRecentReadingItem[] {
  return books
    .map((book) => {
      const data = readOfflineReaderData(book.id);
      const progress = Math.round(data.progress);
      if (progress <= 0 || !data.updatedAt) return null;
      const item: LocalRecentReadingItem = {
        id: book.id,
        title: book.title,
        authorsDisplay: book.author,
        ext: (book.ext || 'fb2').replace(/^\./, ''),
        readProgress: progress,
        lastOpenedAt: data.updatedAt,
        series: book.series,
        seriesNo: book.seriesNo,
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
    byId.set(local.id, {
      ...existing,
      readProgress: Math.max(existing.readProgress, local.readProgress),
      lastOpenedAt: localTs > serverTs ? local.lastOpenedAt : existing.lastOpenedAt,
    });
  }

  return [...byId.values()].sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt));
}
