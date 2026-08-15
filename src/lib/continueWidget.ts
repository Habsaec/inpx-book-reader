import { Capacitor, registerPlugin } from '@capacitor/core';
import { safeBookIdFileKey } from './bookRef';
import { BookStorage } from './bookStoragePlugin';

interface ContinueWidgetPlugin {
  updateContinueBook(options: {
    bookId: string;
    title: string;
    author: string;
    coverPath?: string;
    progress?: number;
    rating?: number;
  }): Promise<void>;
}

const ContinueWidget = registerPlugin<ContinueWidgetPlugin>('ContinueWidget');

let updateChain: Promise<void> = Promise.resolve();
let updateSeq = 0;

export function widgetCoverCachePath(bookId: string): string {
  return `covers/${safeBookIdFileKey(bookId)}_thumb.jpg`;
}

async function resolveCoverPath(bookId: string): Promise<string> {
  if (!bookId) return '';
  const key = safeBookIdFileKey(bookId);
  for (const suffix of ['thumb', 'full'] as const) {
    try {
      const path = `covers/${key}_${suffix}.jpg`;
      const exists = await BookStorage.appCacheFileExists({ path });
      if (!exists.exists) continue;
      const { absolutePath } = await BookStorage.getAppCacheFilePath({ path });
      if (absolutePath) return absolutePath;
    } catch {
      /* try next variant */
    }
  }
  return '';
}

export async function syncContinueReadingWidget(book: {
  id: string;
  title: string;
  author?: string;
  progress?: number;
  rating?: number;
} | null): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  const seq = ++updateSeq;
  const coverPath = book?.id ? await resolveCoverPath(book.id) : '';
  const payload = {
    bookId: book?.id || '',
    title: book?.title || '',
    author: book?.author || '',
    coverPath,
    progress: Math.max(0, Math.min(100, Math.round(Number(book?.progress) || 0))),
    rating: Math.max(0, Math.min(5, Math.round(Number(book?.rating) || 0))),
  };
  updateChain = updateChain.catch(() => {}).then(async () => {
    if (seq !== updateSeq) return;
    try {
      await ContinueWidget.updateContinueBook(payload);
    } catch {
      /* widget optional */
    }
  });
  return updateChain;
}
