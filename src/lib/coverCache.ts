import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  authHeader,
  coverUrl,
  fetchAuthorPortraitBlob,
  fetchCoverBlob,
  isAuthError,
  normalizeBaseUrl,
} from './inpxClient';
import { encodeBookRef, safeBookIdFileKey } from './bookRef';
import { isNativeApp } from './platform';
import { BookStorage } from './bookStoragePlugin';
import { appCacheDisplayUrl, downloadUrlToAppCacheNative } from './nativeDownload';
import type { ServerConfig } from '../types';
import type { StorageDirectory } from './storageDirectory';

/**
 * Image cache:
 *   memory → app-private files (Android files/image-cache) → IndexedDB (browser) → network
 * SAF/Download is not used for images (unreliable MIME/hidden dirs).
 */

const IDB_COVER = 'inpx_img_cover:';
const IDB_PORTRAIT = 'inpx_img_portrait:';
const IDB_PORTRAIT_MISS = 'inpx_img_portrait_miss';
const IDB_LRU = 'inpx_img_lru';
const APP_COVER_DIR = 'covers';
const APP_PORTRAIT_DIR = 'portraits';

const MAX_MEMORY_ENTRIES = 256;
const MAX_IDB_ENTRIES = 400;
const PORTRAIT_FETCH_CONCURRENCY = 3;
const MAX_PORTRAIT_MISS_ENTRIES = 3000;
const MAX_APP_CACHE_EXISTS_ENTRIES = 400;
const memoryCache = new Map<string, string>();
const cacheOrder: string[] = [];
const inflight = new Map<string, Promise<string | null>>();
const coverTombstones = new Set<string>();
const portraitMissCache = new Set<string>();
const appCacheExistsCache = new Map<string, boolean>();
let portraitMissLoaded = false;
let portraitMissLoadPromise: Promise<void> | null = null;
let portraitFetchActive = 0;
const portraitFetchWaiters: Array<() => void> = [];
let idbLruChain: Promise<void> = Promise.resolve();

function touchCacheKey(key: string): void {
  const idx = cacheOrder.indexOf(key);
  if (idx >= 0) cacheOrder.splice(idx, 1);
  cacheOrder.push(key);
}

function evictMemoryIfNeeded(): void {
  while (cacheOrder.length > MAX_MEMORY_ENTRIES) {
    const oldest = cacheOrder.shift();
    if (!oldest) break;
    // Do not revoke blob: URLs here — mounted <img> may still use them.
    // remember() still revokes when replacing the same key.
    memoryCache.delete(oldest);
  }
}

function remember(key: string, url: string): string {
  if (coverTombstones.has(key)) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    return '';
  }
  const prev = memoryCache.get(key);
  if (prev && prev !== url && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
  memoryCache.set(key, url);
  touchCacheKey(key);
  evictMemoryIfNeeded();
  return url;
}

function rememberAppCacheExists(appPath: string, ok: boolean): void {
  appCacheExistsCache.set(appPath, ok);
  while (appCacheExistsCache.size > MAX_APP_CACHE_EXISTS_ENTRIES) {
    const first = appCacheExistsCache.keys().next().value;
    if (first === undefined) break;
    appCacheExistsCache.delete(first);
  }
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

export function isPortraitMissCached(authorName: string): boolean {
  const name = String(authorName ?? '').trim();
  return name ? portraitMissCache.has(name) : false;
}

async function ensurePortraitMissLoaded(): Promise<void> {
  if (portraitMissLoaded) return;
  if (!portraitMissLoadPromise) {
    portraitMissLoadPromise = (async () => {
      try {
        const raw = (await idbGet(IDB_PORTRAIT_MISS)) as string[] | null;
        if (Array.isArray(raw)) {
          for (const n of raw) {
            const s = String(n ?? '').trim();
            if (s) portraitMissCache.add(s);
          }
        }
      } catch {
        /* best-effort */
      }
      portraitMissLoaded = true;
    })();
  }
  await portraitMissLoadPromise;
}

async function rememberPortraitMiss(authorName: string): Promise<void> {
  const name = String(authorName ?? '').trim();
  if (!name || portraitMissCache.has(name)) return;
  portraitMissCache.add(name);
  try {
    let list = [...portraitMissCache];
    if (list.length > MAX_PORTRAIT_MISS_ENTRIES) {
      list = list.slice(-MAX_PORTRAIT_MISS_ENTRIES);
      portraitMissCache.clear();
      for (const n of list) portraitMissCache.add(n);
    }
    await idbSet(IDB_PORTRAIT_MISS, list);
  } catch {
    /* best-effort */
  }
}

function releasePortraitFetchSlot(): void {
  portraitFetchActive = Math.max(0, portraitFetchActive - 1);
  const next = portraitFetchWaiters.shift();
  if (next) next();
}

async function acquirePortraitFetchSlot(): Promise<void> {
  if (portraitFetchActive < PORTRAIT_FETCH_CONCURRENCY) {
    portraitFetchActive++;
    return;
  }
  await new Promise<void>((resolve) => {
    portraitFetchWaiters.push(resolve);
  });
  portraitFetchActive++;
}

async function withPortraitFetchSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquirePortraitFetchSlot();
  try {
    return await fn();
  } finally {
    releasePortraitFetchSlot();
  }
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
  const run = async () => {
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
  };
  idbLruChain = idbLruChain.catch(() => {}).then(run);
  return idbLruChain;
}

async function persistBlob(entryKey: string, appPath: string, blob: Blob): Promise<void> {
  const b64 = bufferToBase64(await blob.arrayBuffer());
  if (isNativeApp()) {
    try {
      await BookStorage.writeAppCacheFile({ path: appPath, data: b64 });
      rememberAppCacheExists(appPath, true);
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

async function loadPersistedDisplayUrl(appPath: string): Promise<string | null> {
  if (!isNativeApp()) return null;
  if (appCacheExistsCache.get(appPath) === false) return null;
  try {
    const exists = await BookStorage.appCacheFileExists({ path: appPath });
    const ok = Boolean(exists?.exists);
    rememberAppCacheExists(appPath, ok);
    if (!ok) return null;
    return appCacheDisplayUrl(appPath);
  } catch {
    return null;
  }
}

async function loadPersistedBlob(entryKey: string, appPath: string): Promise<Blob | null> {
  if (isNativeApp()) {
    const fileUrl = await loadPersistedDisplayUrl(appPath);
    if (fileUrl) {
      try {
        const res = await fetch(fileUrl);
        const blob = await res.blob();
        if (blob.size >= 32) return blob;
      } catch (e) {
        console.warn('[coverCache] app cache read failed', appPath, e);
      }
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
  appCacheExistsCache.delete(appPath);
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

function urlFromBlob(memKey: string, blob: Blob): string | null {
  const url = remember(memKey, URL.createObjectURL(blob));
  return url || null;
}

function urlFromFile(memKey: string, fileUrl: string): string | null {
  const url = remember(memKey, fileUrl);
  return url || null;
}

/** Prefer a distinct object URL under the full mem key so thumb eviction does not revoke it. */
async function fallbackFullCoverToThumb(
  bookId: string,
  memKey: string,
  config: ServerConfig | null | undefined,
): Promise<string | null> {
  let thumb = await loadPersistedBlob(coverIdbKey(bookId, 'thumb'), appCoverPath(bookId, 'thumb'));
  if (!thumb && config?.url && config.connectionStatus === 'connected') {
    await resolveCoverUrl({ bookId, variant: 'thumb', config });
    thumb = await loadPersistedBlob(coverIdbKey(bookId, 'thumb'), appCoverPath(bookId, 'thumb'));
  }
  if (thumb) return urlFromBlob(memKey, thumb);
  const thumbMem = memoryCache.get(coverMemKey(bookId, 'thumb'));
  if (!thumbMem) return null;
  // Never alias another key's object URL — thumb eviction would revoke full.
  try {
    const res = await fetch(thumbMem);
    const blob = await res.blob();
    if (blob.size >= 32) return urlFromBlob(memKey, blob);
  } catch {
    /* ignore */
  }
  return null;
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
  coverTombstones.delete(memKey);

  const mem = memoryCache.get(memKey);
  if (mem) {
    touchCacheKey(memKey);
    return mem;
  }

  const existing = inflight.get(memKey);
  if (existing) return existing;

  const task = (async () => {
    const cachedUrl = await loadPersistedDisplayUrl(appPath);
    if (cachedUrl) return urlFromFile(memKey, cachedUrl);

    const cached = await loadPersistedBlob(idbKey, appPath);
    if (cached) return urlFromBlob(memKey, cached);

    if (variant === 'full') {
      const thumbUrl = await loadPersistedDisplayUrl(appCoverPath(bookId, 'thumb'));
      if (thumbUrl) {
        const config = options.config;
        const online = Boolean(config?.url && config.connectionStatus === 'connected');
        if (!online) return urlFromFile(memKey, thumbUrl);
      }
      const thumb = await loadPersistedBlob(coverIdbKey(bookId, 'thumb'), appCoverPath(bookId, 'thumb'));
      if (thumb) {
        // Show thumb immediately; still try network for full below if online.
        const config = options.config;
        const online = Boolean(config?.url && config.connectionStatus === 'connected');
        if (!online) return urlFromBlob(memKey, thumb);
      }
    }

    const config = options.config;
    const online = Boolean(config?.url && config.connectionStatus === 'connected');
    if (!online) {
      if (variant === 'full') {
        const thumb = await loadPersistedBlob(coverIdbKey(bookId, 'thumb'), appCoverPath(bookId, 'thumb'));
        if (thumb) return urlFromBlob(memKey, thumb);
      }
      return null;
    }

    try {
      if (isNativeApp()) {
        const outcome = await downloadUrlToAppCacheNative(
          coverUrl(config!, bookId, variant),
          appPath,
          authHeader(config!),
        );
        if (outcome === 'ok') {
          rememberAppCacheExists(appPath, true);
          const fileUrl = await appCacheDisplayUrl(appPath);
          if (fileUrl) return urlFromFile(memKey, fileUrl);
        }
        if (variant === 'full') return fallbackFullCoverToThumb(bookId, memKey, config);
        return null;
      }
      const blob = await fetchCoverBlob(config!, bookId, variant);
      if (!blob || blob.size < 32) {
        if (variant === 'full') return fallbackFullCoverToThumb(bookId, memKey, config);
        return null;
      }
      await persistBlob(idbKey, appPath, blob);
      return urlFromBlob(memKey, blob);
    } catch (e) {
      if (isAuthError(e)) throw e;
      console.warn('[coverCache] fetch cover failed', bookId, e);
      if (variant === 'full') return fallbackFullCoverToThumb(bookId, memKey, config);
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
  } catch (e) {
    if (isAuthError(e)) throw e;
    /* optional cover warm */
  }
}

/** Warm persistent cover cache for on-device / visible books. */
export async function warmCoverCache(options: {
  bookIds: string[];
  directory?: StorageDirectory | null;
  config?: ServerConfig | null;
  concurrency?: number;
  shouldContinue?: () => boolean;
}): Promise<void> {
  const ids = [...new Set(options.bookIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, 4));
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      if (options.shouldContinue && !options.shouldContinue()) return;
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
    coverTombstones.add(memKey);
    const pending = inflight.get(memKey);
    if (pending) await pending.catch(() => null);
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
  /** When false, skip network (server grouped endpoint). */
  hasPortrait?: boolean;
}): Promise<string | null> {
  const name = String(options.authorName ?? '').trim();
  if (!name) return null;
  if (options.hasPortrait === false) {
    await rememberPortraitMiss(name);
    return null;
  }
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
    await ensurePortraitMissLoaded();
    if (portraitMissCache.has(name)) return null;

    const cachedUrl = await loadPersistedDisplayUrl(appPath);
    if (cachedUrl) return urlFromFile(memKey, cachedUrl);

    const cached = await loadPersistedBlob(idbKey, appPath);
    if (cached) return urlFromBlob(memKey, cached);

    const config = options.config;
    if (!config?.url || config.connectionStatus !== 'connected') return null;

    return withPortraitFetchSlot(async () => {
      if (portraitMissCache.has(name)) return null;

      try {
        if (isNativeApp()) {
          const portraitUrl = `${normalizeBaseUrl(config.url)}/api/authors/portrait?name=${encodeURIComponent(name)}`;
          const outcome = await downloadUrlToAppCacheNative(portraitUrl, appPath, authHeader(config));
          if (outcome === 'ok') {
            rememberAppCacheExists(appPath, true);
            const fileUrl = await appCacheDisplayUrl(appPath);
            if (fileUrl) return urlFromFile(memKey, fileUrl);
            return null;
          }
          if (outcome === 'miss') await rememberPortraitMiss(name);
          return null;
        }
        const blob = await fetchAuthorPortraitBlob(config, name);
        if (!blob || blob.size < 32) {
          await rememberPortraitMiss(name);
          return null;
        }
        await persistBlob(idbKey, appPath, blob);
        return urlFromBlob(memKey, blob);
      } catch (e) {
        if (isAuthError(e)) throw e;
        const msg = e instanceof Error ? e.message : String(e);
        if (/\b404\b/.test(msg)) {
          await rememberPortraitMiss(name);
        } else {
          console.warn('[coverCache] fetch portrait failed', name, e);
        }
        return null;
      }
    });
  })().finally(() => {
    inflight.delete(memKey);
  });

  inflight.set(memKey, task);
  return task;
}
