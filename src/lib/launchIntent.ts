/**
 * Android launch intents — shortcut «Продолжить» и VIEW fb2/epub.
 * @see LaunchIntentPlugin.java
 */

import { registerPlugin } from '@capacitor/core';
import { Book } from '../types';

export type LaunchIntentPayload =
  | { action: 'continue' }
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
  if (action === 'continue') return true;
  if (action === 'view') {
    return typeof (value as { uri?: unknown }).uri === 'string';
  }
  return false;
}

/** Имя файла из content:// или file:// URI. */
export function fileNameFromLaunchUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const withoutQuery = decoded.split('?')[0] ?? decoded;
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

  const exact = books.find((b) => {
    const local = b.localFileName?.toLowerCase();
    if (!local) return false;
    return local === name || local.endsWith(`/${name}`);
  });
  if (exact) return exact;

  return (
    books.find((b) => {
      const local = b.localFileName?.toLowerCase();
      if (!local) return false;
      const base = local.split('/').pop() ?? local;
      return base === name || base.includes(name) || name.includes(base);
    }) ?? null
  );
}
