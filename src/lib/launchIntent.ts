/**
 * Android launch intents — shortcut «Продолжить» и VIEW fb2/epub.
 * @see LaunchIntentPlugin.java
 */

import { registerPlugin } from '@capacitor/core';
import { Book } from '../types';

export type LaunchIntentPayload =
  | { action: 'continue'; bookId?: string }
  | { action: 'view'; uri: string; mimeType?: string };

interface LaunchIntentPlugin {
  consumePending(): Promise<LaunchIntentPayload | Record<string, never>>;
  addListener(
    eventName: 'launchIntent',
    listener: (payload: LaunchIntentPayload) => void,
  ): Promise<{ remove: () => void }>;
}

export const LaunchIntent = registerPlugin<LaunchIntentPlugin>('LaunchIntent');

export function isLaunchPayload(value: unknown): value is LaunchIntentPayload {
  if (!value || typeof value !== 'object') return false;
  const action = (value as LaunchIntentPayload).action;
  if (action === 'continue') {
    const bookId = (value as { bookId?: unknown }).bookId;
    return bookId === undefined || typeof bookId === 'string';
  }
  if (action === 'view') {
    return typeof (value as { uri?: unknown }).uri === 'string';
  }
  return false;
}

/** Имя файла из content:// или file:// URI. */
export function fileNameFromLaunchUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const withoutQuery = decoded.split(/[?#]/)[0] ?? decoded;
    const segment = withoutQuery.split('/').pop() ?? '';
    return segment.replace(/^\//, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Поиск скачанной книги по имени файла из внешнего intent. */
export function findBookByLaunchUri(uri: string, books: Book[]): Book | null {
  const name = fileNameFromLaunchUri(uri);
  if (!name) return null;
  const withFile = books.filter((b) => b.localFileName?.trim());

  // Сначала полный суффикс пути — одинаковые имена файлов в разных папках не путаем.
  let decodedPath = '';
  try {
    decodedPath = (decodeURIComponent(uri).split(/[?#]/)[0] ?? '').toLowerCase();
  } catch {
    /* имя файла уже извлечено выше */
  }
  if (decodedPath) {
    const suffixMatches = withFile.filter((b) => decodedPath.endsWith(b.localFileName!.toLowerCase()));
    if (suffixMatches.length > 0) {
      return suffixMatches.sort((a, b) => b.localFileName!.length - a.localFileName!.length)[0];
    }
  }

  const nameMatches = withFile.filter((b) => {
    const local = b.localFileName!.toLowerCase();
    return local === name || local.endsWith(`/${name}`);
  });
  // Несколько книг с одинаковым именем файла — не угадываем, иначе откроется чужая.
  return nameMatches.length === 1 ? nameMatches[0] : null;
}
