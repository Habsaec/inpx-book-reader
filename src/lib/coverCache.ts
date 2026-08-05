import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { registerPlugin } from '@capacitor/core';
import { fetchAuthorPortraitBlob, fetchCoverBlob } from './inpxClient';
import { encodeBookRef, safeBookIdFileKey } from './bookRef';
import { isNativeApp } from './platform';
import type { ServerConfig } from '../types';
import type { StorageDirectory } from './storageDirectory';

/**
 * Image cache:
 *   memory → app-private files (Android files/image-cache) → IndexedDB (browser) → network
 * SAF/Download is not used for images (unreliable MIME/hidden dirs).
 */

const IDB_COVER = 'inpx_img_cover:';
const IDB_PORTRAIT = 'inpx_img_portrait:';
const IDB_LRU = 'inpx_img_lru';
const APP_COVER_DIR = 'covers';
const APP_PORTRAIT_DIR = 'portraits';

interface BookStoragePlugin {
  appCacheFileExists(options: { path: string }): Promise<{ exists: boolean }>;
  writeAppCacheFile(options: { path: string; data: string }): Promise<void>;
  readAppCacheFile(options: { path: string }): Promise<{ data: string }>;
  deleteAppCacheFile(options: { path: string }): Promise<void>;
  /** Legacy SAF helpers — unused for new image writes. */
  writeBinaryFile?(options: { treeUri: string; path: string; data: string }): Promise<void>;
  readBinaryFile?(options: { treeUri: string; path: string }): Promise<{ data: string }>;
  deleteFile?(options: { treeUri: string; path: string }): Promise<void>;
  fileExists?(options: { treeUri: string; path: string }): Promise<{ exists: boolean }>;
}

const BookStorage = registerPlugin<BookStoragePlugin>('BookStorage');

const MAX_MEMORY_ENTRIES = 256;
const MAX_IDB_ENTRIES = 400;
const memoryCache = new Map<string, string>();
const cacheOrder: string[] = [];
const inflight = new Map<string, Promise<string | null>>();

function touchCacheKey(key: string): void {
  const idx = cacheOrder.indexOf(key);
  if (idx >= 0) cacheOrder.splice(idx, 1);
  cacheOrder.push(key);
}

function evictMemoryIfNeeded(): void {
  while (cacheOrder.length > MAX_MEMORY_ENTRIES) {
    const oldest = cacheOrder.shift();
    if (!oldest) break;
    const prev = memoryCache.get(oldest);
    if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
    memoryCache.delete(oldest);
  }
}

function remember(key: string, url: string): string {
  const prev = memoryCache.get(key);
  if (prev && prev !== url && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
  memoryCache.set(key, url);
  touchCacheKey(key);
  evictMemoryIfNeeded();
  return url;
}

function coverMemKey(bookId: string, variant: 'thumb' | 'full'): string {
  return `cover:${variant}:${bookId}`;
}

function portraitMemKey(authorName: string): string {
  return `portrait:${authorName}`;
}

function coverIdbKey(bookId: string, variant: 'thumb' | 'full'): string {
  return `${IDB_COVER}${variant}:${bookId}`;
}

function portraitIdbKey(authorName: string): string {
  return `${IDB_PORTRAIT}${authorName}`;
}

function appCoverPath(bookId: string, variant: 'thumb' | 'full'): string {
  const suffix = variant === 'full' ? 'full' : 'thumb';
  return `${APP_COVER_DIR}/${safeBookIdFileKey(bookId)}_${suffix}.jpg`;
}

function appPortraitPath(authorName: string): string {
  return `${APP_PORTRAIT_DIR}/${safeAuthorPortraitFileKey(authorName)}.jpg`;
}

export function peekCoverMemory(bookId: string, variant: 'thumb' | 'full' = 'thumb'): string | null {
  return memoryCache.get(coverMemKey(bookId, variant)) ?? null;
}

export function peekPortraitMemory(authorName: string): string | null {
  return memoryCache.get(portraitMemKey(authorName)) ?? null;
}

/** Legacy SAF path (tests / old installs). New writes go to app-private `covers/`. */
export function coverRelativePath(bookId: string, variant: 'thumb' | 'full'): string {
  return `.inpx-reader/covers/${safeBookIdFileKey(bookId)}_${variant === 'full' ? 'full' : 'thumb'}.jpg`;
}

export function safeAuthorPortraitFileKey(authorName: string): string {
  const name = String(authorName ?? '').trim();
  if (!name) return 'unknown';
  return `a_${encodeBookRef(name)}`.slice(0, 200);
}

export function portraitRelativePath(authorName: string): string {
  return `.inpx-reader/portraits/${safeAuthorPortraitFileKey(authorName)}.jpg`;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function blobFromBase64(b64: string): Blob | null {
  try {
    if (!b64 || b64.length < 32) return null;
    const blob = new Blob([base64ToArrayBuffer(b64)], { type: 'image/jpeg' });
    return blob.size >= 32 ? blob : null;
  } catch {
    return null;
  }
}

async function touchIdbLru(entryKey: string): Promise<void> {
  try {
    const raw = (await idbGet(IDB_LRU)) as string[] | null;
    const list = Array.isArray(raw) ? raw.filter((k) => k !== entryKey) : [];
    list.push(entryKey);
    while (list.length > MAX_IDB_ENTRIES) {
      const oldest = list.shift();
      if (oldest) {
        try {
          await idbDel(oldest);
        } catch {
          /* ignore */
        }
      }
    }
    await idbSet(IDB_LRU, list);
  } catch {
    /* LRU best-effort */
  }
}

async function persistBlob(entryKey: string, appPath: string, blob: Blob): Promise<void> {
  const b64 = bufferToBase64(await blob.arrayBuffer());
  if (isNativeApp()) {
    try {
      await BookStorage.writeAppCacheFile({ path: appPath, data: b64 });
      return;
    } catch (e) {
      console.warn('[coverCache] app cache write failed', appPath, e);
    }
  }
  try {
    await idbSet(entryKey, b64);
    await touchIdbLru(entryKey);
  } catch (e) {
    console.warn('[coverCache] idb write failed', entryKey, e);
  }
}

async function loadPersistedBlob(entryKey: string, appPath: string): Promise<Blob | null> {
  if (isNativeApp()) {
    try {
      const exists = await BookStorage.appCacheFileExists({ path: appPath });
      if (exists?.exists) {
        const result = await BookStorage.readAppCacheFile({ path: appPath });
        const blob = blobFromBase64(result.data);
        if (blob) return blob;
      }
    } catch (e) {
      console.warn('[coverCache] app cache read failed', appPath, e);
    }
  }
  try {
    const b64 = await idbGet(entryKey);
    if (typeof b64 === 'string') {
      const blob = blobFromBase64(b64);
      if (blob) {
        void touchIdbLru(entryKey);
        // Promote browser-cached blob into app files when available.
        if (isNativeApp()) {
          void BookStorage.writeAppCacheFile({ path: appPath, data: b64 }).catch(() => {});
        }
        return blob;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function deletePersisted(entryKey: string, appPath: string): Promise<void> {
  if (isNativeApp()) {
    try {
      await BookStorage.deleteAppCacheFile({ path: appPath });
    } catch {
      /* ignore */
    }
  }
  try {
    await idbDel(entryKey);
  } catch {
    /* ignore */
  }
}

function urlFromBlob(memKey: string, blob: Blob): string {
  return remember(memKey, URL.createObjectURL(blob));
}

export async function readCoverFromDirectory(
  _directory: StorageDirectory,
  bookId: string,
  variant: 'thumb' | 'full',
): Promise<string | null> {
  return resolveCoverUrl({ bookId, variant, config: null });
}

export async function saveCoverToDirectory(
  _directory: StorageDirectory,
  bookId: string,
  blob: Blob,
  variant: 'thumb' | 'full' = 'thumb',
): Promise<string | null> {
  if (blob.size < 32) return null;
  const memKey = coverMemKey(bookId, variant);
  await persistBlob(coverIdbKey(bookId, variant), appCoverPath(bookId, variant), blob);
  return urlFromBlob(memKey, blob);
}

/**
 * Resolve cover blob URL: memory → app files / IDB → network.
 * `directory` kept for API compat; images no longer depend on SAF folder.
 */
export async function resolveCoverUrl(options: {
  bookId: string;
  variant?: 'thumb' | 'full';
  directory?: StorageDirectory | null;
  config?: ServerConfig | null;
}): Promise<string | null> {
  const bookId = String(options.bookId ?? '').trim();
  if (!bookId) return null;
  const variant = options.variant ?? 'thumb';
  const memKey = coverMemKey(bookId, variant);
  const idbKey = coverIdbKey(bookId, variant);
  const appPath = appCoverPath(bookId, variant);

  const mem = memoryCache.get(memKey);
  if (mem) {
    touchCacheKey(memKey);
    return mem;
  }

  const existing = inflight.get(memKey);
  if (existing) return existing;

  const task = (async () => {
    const cached = await loadPersistedBlob(idbKey, appPath);
    if (cached) return urlFromBlob(memKey, cached);

    if (variant === 'full') {
      const thumb = await loadPersistedBlob(coverIdbKey(bookId, 'thumb'), appCoverPath(bookId, 'thumb'));
      if (thumb) {
        // Show thumb immediately; still try network for full below if online.
        const config = options.config;
        const online = Boolean(config?.url && config.connectionStatus === 'connected');
        if (!online) return urlFromBlob(coverMemKey(bookId, 'thumb'), thumb);
      }
    }

    const config = options.config;
    const online = Boolean(config?.url && config.connectionStatus === 'connected');
    if (!online) {
      if (variant === 'full') {
        const thumb = await loadPersistedBlob(coverIdbKey(bookId, 'thumb'), appCoverPath(bookId, 'thumb'));
        if (thumb) return urlFromBlob(coverMemKey(bookId, 'thumb'), thumb);
      }
      return null;
    }

    try {
      const blob = await fetchCoverBlob(config!, bookId, variant);
      if (!blob || blob.size < 32) {
        if (variant === 'full') {
          return resolveCoverUrl({ bookId, variant: 'thumb', config });
        }
        return null;
      }
      await persistBlob(idbKey, appPath, blob);
      return urlFromBlob(memKey, blob);
    } catch (e) {
      console.warn('[coverCache] fetch cover failed', bookId, e);
      if (variant === 'full') {
        return resolveCoverUrl({ bookId, variant: 'thumb', config });
      }
      return null;
    }
  })().finally(() => {
    inflight.delete(memKey);
  });

  inflight.set(memKey, task);
  return task;
}

export async function cacheCoverFromServer(
  directory: StorageDirectory,
  config: ServerConfig,
  bookId: string,
): Promise<void> {
  if (config.connectionStatus !== 'connected') return;
  try {
    await resolveCoverUrl({ bookId, variant: 'thumb', directory, config });
  } catch {
    /* optional */
  }
}

/** Warm persistent cover cache for on-device / visible books. */
export async function warmCoverCache(options: {
  bookIds: string[];
  directory?: StorageDirectory | null;
  config?: ServerConfig | null;
  concurrency?: number;
}): Promise<void> {
  const ids = [...new Set(options.bookIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const bookId = ids[i++]!;
      if (peekCoverMemory(bookId, 'thumb')) continue;
      await resolveCoverUrl({
        bookId,
        variant: 'thumb',
        directory: options.directory,
        config: options.config,
      });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

export async function removeCoverFromDirectory(
  _directory: StorageDirectory,
  bookId: string,
): Promise<void> {
  for (const variant of ['thumb', 'full'] as const) {
    const memKey = coverMemKey(bookId, variant);
    const prev = memoryCache.get(memKey);
    if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
    memoryCache.delete(memKey);
    const orderIdx = cacheOrder.indexOf(memKey);
    if (orderIdx >= 0) cacheOrder.splice(orderIdx, 1);
    await deletePersisted(coverIdbKey(bookId, variant), appCoverPath(bookId, variant));
  }
}

export async function readPortraitFromDirectory(
  _directory: StorageDirectory,
  authorName: string,
): Promise<string | null> {
  return resolveAuthorPortraitUrl({ authorName, config: null });
}

export async function savePortraitToDirectory(
  _directory: StorageDirectory,
  authorName: string,
  blob: Blob,
): Promise<string | null> {
  const name = String(authorName ?? '').trim();
  if (!name || blob.size < 32) return null;
  const memKey = portraitMemKey(name);
  await persistBlob(portraitIdbKey(name), appPortraitPath(name), blob);
  return urlFromBlob(memKey, blob);
}

export async function resolveAuthorPortraitUrl(options: {
  authorName: string;
  directory?: StorageDirectory | null;
  config?: ServerConfig | null;
}): Promise<string | null> {
  const name = String(options.authorName ?? '').trim();
  if (!name) return null;
  const memKey = portraitMemKey(name);
  const idbKey = portraitIdbKey(name);
  const appPath = appPortraitPath(name);

  const mem = memoryCache.get(memKey);
  if (mem) {
    touchCacheKey(memKey);
    return mem;
  }

  const existing = inflight.get(memKey);
  if (existing) return existing;

  const task = (async () => {
    const cached = await loadPersistedBlob(idbKey, appPath);
    if (cached) return urlFromBlob(memKey, cached);

    const config = options.config;
    if (!config?.url || config.connectionStatus !== 'connected') return null;

    try {
      const blob = await fetchAuthorPortraitBlob(config, name);
      if (!blob || blob.size < 32) return null;
      await persistBlob(idbKey, appPath, blob);
      return urlFromBlob(memKey, blob);
    } catch (e) {
      console.warn('[coverCache] fetch portrait failed', name, e);
      return null;
    }
  })().finally(() => {
    inflight.delete(memKey);
  });

  inflight.set(memKey, task);
  return task;
}
