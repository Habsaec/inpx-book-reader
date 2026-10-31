import React from 'react';
import type { Book } from '../types';

/**
 * «Формат скачивания» — the account preference shared with the web UI
 * (`/api/preferences.downloadFormat`, '' = original file). The app follows it only for
 * formats its own reader opens (EPUB family, converted from FB2 by the server's fb2cng);
 * FB2.ZIP / KFX / AZW8 still download the original file. A converted EPUB syncs its reading
 * position with the FB2 read on the web only approximately (by percentage).
 */
const STORAGE_KEY = 'inpx_download_format';

/** Server format → file extension the app stores and opens. */
const APP_READABLE_FORMATS: Record<string, string> = {
  epub2: 'epub',
  epub3: 'epub',
  kepub: 'epub',
};

let value = readStored();
const listeners = new Set<() => void>();

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function getDownloadFormat(): string {
  return value;
}

export function setDownloadFormat(next: string | null | undefined): void {
  const normalized = String(next || '').trim().toLowerCase();
  if (normalized === value) return;
  value = normalized;
  try {
    if (normalized) localStorage.setItem(STORAGE_KEY, normalized);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDownloadFormat(): string {
  return React.useSyncExternalStore(subscribe, () => value, () => value);
}

/** True when the app downloads this preference as is (otherwise it keeps the original file). */
export function isAppReadableDownloadFormat(format: string): boolean {
  return Boolean(APP_READABLE_FORMATS[String(format || '').toLowerCase()]);
}

/** Server `downloadFormats` in either shape: `['epub2']` or `[{ format: 'epub2' }]`. */
export function normalizeDownloadFormats(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((item) => String((item && typeof item === 'object' ? (item as { format?: unknown }).format : item) || '').toLowerCase())
    .filter(Boolean);
}

/**
 * Format to request for this book, or null for the original file. Only when the server
 * offers it for this very book (`downloadFormats`): the server silently falls back to the
 * source file otherwise, and the file on disk would get the wrong extension.
 */
export function resolveBookDownloadFormat(
  book: Pick<Book, 'ext' | 'downloadFormats'>,
  preference = value,
): { format: string; ext: string } | null {
  const format = String(preference || '').toLowerCase();
  const ext = APP_READABLE_FORMATS[format];
  if (!ext) return null;
  const source = String(book.ext || 'fb2').replace(/^\./, '').toLowerCase();
  if (source !== 'fb2') return null;
  if (!book.downloadFormats?.includes(format)) return null;
  return { format, ext };
}
