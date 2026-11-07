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

/*
 * Formats the server offers for FB2 books right now (`availableDownloadFormats` of `/api/profile`
 * `user` and `/api/preferences`); null = unknown (older server) — then nothing is reported.
 * An admin can switch EPUB / EPUB3 off: the app then quietly saved the FB2 and nobody knew why.
 */
const SERVER_FORMATS_KEY = 'inpx_server_download_formats';
let serverFormats: string[] | null = readServerFormats();
const serverListeners = new Set<() => void>();

function readServerFormats(): string[] | null {
  try {
    const raw = localStorage.getItem(SERVER_FORMATS_KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? list.map((f) => String(f).toLowerCase()) : null;
  } catch {
    return null;
  }
}

export function setServerDownloadFormats(next: unknown): void {
  if (!Array.isArray(next)) return; // older server: keep what we knew
  const list = next.map((f) => String(f || '').toLowerCase()).filter(Boolean);
  if (serverFormats && serverFormats.length === list.length && serverFormats.every((f, i) => f === list[i])) return;
  serverFormats = list;
  try {
    localStorage.setItem(SERVER_FORMATS_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
  for (const listener of serverListeners) listener();
}

export function getServerDownloadFormats(): string[] | null {
  return serverFormats;
}

function subscribeServerFormats(listener: () => void): () => void {
  serverListeners.add(listener);
  return () => serverListeners.delete(listener);
}

export function useServerDownloadFormats(): string[] | null {
  return React.useSyncExternalStore(subscribeServerFormats, () => serverFormats, () => serverFormats);
}

/** The preference is a format the app would download, but the server does not offer it now. */
export function isDownloadFormatOffOnServer(format: string, available: string[] | null = serverFormats): boolean {
  const code = String(format || '').toLowerCase();
  if (!APP_READABLE_FORMATS[code] || !available) return false;
  return !available.includes(code);
}

/**
 * The account asks for an EPUB-family format, the book is FB2, yet this book's server formats lack it
 * (switched off by the admin, no fb2cng): the original file is saved instead — the caller tells the user.
 */
export function downloadFormatFallback(
  book: Pick<Book, 'ext' | 'downloadFormats'>,
  preference = value,
): string | null {
  const format = String(preference || '').toLowerCase();
  if (!APP_READABLE_FORMATS[format]) return null;
  const source = String(book.ext || 'fb2').replace(/^\./, '').toLowerCase();
  if (source !== 'fb2' || !book.downloadFormats) return null;
  return book.downloadFormats.includes(format) ? null : format;
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
