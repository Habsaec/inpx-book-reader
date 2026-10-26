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
  updateFollowing(options: { books: WidgetFollowingBook[] }): Promise<void>;
  updateLibrary(options: { name: string; logoPath: string }): Promise<void>;
  placedWidgets(): Promise<Partial<Record<'continue' | 'tts' | 'following', number>>>;
}

interface WidgetFollowingBook {
  bookId: string;
  title: string;
  author: string;
  ext: string;
  coverPath: string;
}

/** Covers on the «Новое у любимых» widget (2 rows × 4 at most). */
export const FOLLOWING_WIDGET_MAX_BOOKS = 8;

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

function isAndroidApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function clampPercent(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

export async function syncContinueReadingWidget(book: {
  id: string;
  title: string;
  author?: string;
  progress?: number;
  rating?: number;
} | null): Promise<void> {
  if (!isAndroidApp()) return;
  const seq = ++updateSeq;
  const coverPath = book?.id ? await resolveCoverPath(book.id) : '';
  const payload = {
    bookId: book?.id || '',
    title: book?.title || '',
    author: book?.author || '',
    coverPath,
    progress: clampPercent(book?.progress),
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

let lastFollowingKey = '';

/** «Новое у любимых» widget. Covers must already be in the app cover cache (`warmCoverCache`). */
export async function syncFollowingWidget(
  books: Array<{ id: string; title: string; author?: string; ext?: string }>,
): Promise<void> {
  if (!isAndroidApp()) return;
  const payload: WidgetFollowingBook[] = [];
  for (const book of books.slice(0, FOLLOWING_WIDGET_MAX_BOOKS)) {
    payload.push({
      bookId: book.id,
      title: book.title || '',
      author: book.author || '',
      ext: book.ext || '',
      coverPath: await resolveCoverPath(book.id),
    });
  }
  const key = JSON.stringify(payload);
  if (key === lastFollowingKey) return;
  try {
    await ContinueWidget.updateFollowing({ books: payload });
    lastFollowingKey = key;
  } catch {
    /* widget optional */
  }
}

/** True when a «Новое у любимых» widget is placed (only then the app asks the server for it). */
export async function isFollowingWidgetPlaced(): Promise<boolean> {
  if (!isAndroidApp()) return false;
  try {
    return ((await ContinueWidget.placedWidgets()).following ?? 0) > 0;
  } catch {
    return false;
  }
}

const WIDGET_LOGO_PATH = 'branding/widget-logo';
let lastLibraryKey = '';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Library name + logo at the top of every widget. The logo is copied into the app cache as a file
 * the widgets decode; SVG cannot be decoded there, so the name stays alone.
 */
export async function syncLibraryWidget(name: string, logo: Blob | null): Promise<void> {
  if (!isAndroidApp()) return;
  const usableLogo = logo && logo.size > 0 && !/svg/i.test(logo.type) ? logo : null;
  const key = `${name}|${usableLogo ? `${usableLogo.type}:${usableLogo.size}` : ''}`;
  if (key === lastLibraryKey) return;
  let logoPath = '';
  if (usableLogo) {
    try {
      await BookStorage.writeAppCacheFile({ path: WIDGET_LOGO_PATH, data: await blobToBase64(usableLogo) });
      logoPath = (await BookStorage.getAppCacheFilePath({ path: WIDGET_LOGO_PATH })).absolutePath || '';
    } catch {
      logoPath = '';
    }
  }
  try {
    await ContinueWidget.updateLibrary({ name, logoPath });
    lastLibraryKey = key;
  } catch {
    /* widget optional */
  }
}
