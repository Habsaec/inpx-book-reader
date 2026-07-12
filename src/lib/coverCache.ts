import { registerPlugin } from '@capacitor/core';
import { fetchCoverBlob } from './inpxClient';
import type { ServerConfig } from '../types';
import type { StorageDirectory } from './storageDirectory';

const META_DIR = '.inpx-reader/covers';

interface BookStoragePlugin {
  writeBinaryFile(options: { treeUri: string; path: string; data: string }): Promise<void>;
  readBinaryFile(options: { treeUri: string; path: string }): Promise<{ data: string }>;
  deleteFile(options: { treeUri: string; path: string }): Promise<void>;
}

const BookStorage = registerPlugin<BookStoragePlugin>('BookStorage');

const MAX_COVER_CACHE = 48;
const memoryCache = new Map<string, string>();
const cacheOrder: string[] = [];

function touchCacheKey(key: string): void {
  const idx = cacheOrder.indexOf(key);
  if (idx >= 0) cacheOrder.splice(idx, 1);
  cacheOrder.push(key);
}

function evictCoverCacheIfNeeded(): void {
  while (cacheOrder.length > MAX_COVER_CACHE) {
    const oldest = cacheOrder.shift();
    if (!oldest) break;
    const prev = memoryCache.get(oldest);
    if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
    memoryCache.delete(oldest);
  }
}

function cacheKey(bookId: string, variant: 'thumb' | 'full'): string {
  return `${variant}:${bookId}`;
}

export function coverRelativePath(bookId: string, variant: 'thumb' | 'full'): string {
  const suffix = variant === 'full' ? 'full' : 'thumb';
  return `${META_DIR}/${bookId}_${suffix}.jpg`;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
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

export async function readCoverFromDirectory(
  directory: StorageDirectory,
  bookId: string,
  variant: 'thumb' | 'full',
): Promise<string | null> {
  const key = cacheKey(bookId, variant);
  const cached = memoryCache.get(key);
  if (cached) {
    touchCacheKey(key);
    return cached;
  }

  if (!directory.uri) return null;
  try {
    const result = await BookStorage.readBinaryFile({
      treeUri: directory.uri,
      path: coverRelativePath(bookId, variant),
    });
    const blob = new Blob([base64ToArrayBuffer(result.data)], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    memoryCache.set(key, url);
    touchCacheKey(key);
    evictCoverCacheIfNeeded();
    return url;
  } catch {
    return null;
  }
}

export async function saveCoverToDirectory(
  directory: StorageDirectory,
  bookId: string,
  blob: Blob,
  variant: 'thumb' | 'full' = 'thumb',
): Promise<void> {
  if (!directory.uri) return;
  const buffer = await blob.arrayBuffer();
  await BookStorage.writeBinaryFile({
    treeUri: directory.uri,
    path: coverRelativePath(bookId, variant),
    data: bufferToBase64(buffer),
  });
  const key = cacheKey(bookId, variant);
  const prev = memoryCache.get(key);
  if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  memoryCache.set(key, url);
  touchCacheKey(key);
  evictCoverCacheIfNeeded();
}

export async function cacheCoverFromServer(
  directory: StorageDirectory,
  config: ServerConfig,
  bookId: string,
): Promise<void> {
  if (!directory.uri || config.connectionStatus !== 'connected') return;
  try {
    const blob = await fetchCoverBlob(config, bookId, 'thumb');
    if (blob) await saveCoverToDirectory(directory, bookId, blob, 'thumb');
  } catch {
    /* optional */
  }
}

export async function removeCoverFromDirectory(
  directory: StorageDirectory,
  bookId: string,
): Promise<void> {
  if (!directory.uri) return;
  for (const variant of ['thumb', 'full'] as const) {
    const key = cacheKey(bookId, variant);
    const prev = memoryCache.get(key);
    if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
    memoryCache.delete(key);
    try {
      await BookStorage.deleteFile({
        treeUri: directory.uri,
        path: coverRelativePath(bookId, variant),
      });
    } catch {
      /* ignore */
    }
  }
}
