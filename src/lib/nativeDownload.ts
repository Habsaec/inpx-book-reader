/**
 * Native HTTP → disk downloads on Android (bypass CapacitorHttp / JS bridge for large payloads).
 */
import { Capacitor } from '@capacitor/core';
import type { Book, ServerConfig } from '../types';
import { ApiError, authHeader, bookContentUrl, isAuthError } from './inpxClient';
import { bookStorageRelativePath } from './bookStorage';
import { isNativeApp } from './platform';
import type { StorageDirectory } from './storageDirectory';
import { isStoragePermissionError } from './storageDirectory';
import { BookStorage } from './bookStoragePlugin';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const SEVEN_ZIP_MAGIC = [0x37, 0x7a, 0xbc, 0xaf] as const;

/** Native Java throws plain "HTTP 401" — remap so isAuthError / UI auth recovery work. */
function rethrowNativeDownloadError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/\bHTTP\s+(\d{3})\b/i);
  if (match) {
    const status = Number(match[1]);
    throw new ApiError(msg.trim() || `Загрузка: HTTP ${status}`, status);
  }
  throw err instanceof Error ? err : new Error(msg);
}

function startsWithMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function appCacheDisplayUrl(appPath: string): Promise<string | null> {
  if (!isNativeApp()) return Promise.resolve(null);
  return BookStorage.getAppCacheFilePath({ path: appPath })
    .then(({ absolutePath }) => Capacitor.convertFileSrc(absolutePath))
    .catch(() => null);
}

export type AppCacheDownloadOutcome = 'ok' | 'miss' | 'failed';

/**
 * Download image into app-private cache.
 * - `ok` — file written
 * - `miss` — definitive 404 (safe to negative-cache)
 * - `failed` — transient / other (do NOT negative-cache)
 * Auth failures throw ApiError.
 */
export async function downloadUrlToAppCacheNative(
  url: string,
  appPath: string,
  headers: Record<string, string>,
): Promise<AppCacheDownloadOutcome> {
  if (!isNativeApp()) return 'failed';
  try {
    const result = await BookStorage.downloadUrlToAppCache({ url, path: appPath, headers });
    if (result.statusCode === 404) return 'miss';
    if (result.statusCode === 401 || result.statusCode === 403) {
      throw new ApiError(`HTTP ${result.statusCode}`, result.statusCode);
    }
    if (result.statusCode >= 200 && result.statusCode < 300 && result.bytesWritten >= 32) {
      return 'ok';
    }
    return 'failed';
  } catch (e) {
    if (isAuthError(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/\bHTTP\s+40[13]\b/i.test(msg)) {
      rethrowNativeDownloadError(e);
    }
    if (/\b404\b/.test(msg)) return 'miss';
    console.warn('[nativeDownload] app cache download failed', appPath, e);
    return 'failed';
  }
}

export interface NativeBookDownloadResult {
  relativePath: string;
  byteLength: number;
  digestSha256: string;
}

export async function downloadBookToStorageNative(
  config: ServerConfig,
  book: Book,
  directory: StorageDirectory,
  jobId: string,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<NativeBookDownloadResult> {
  if (!directory.uri) {
    throw new Error('Не выбрана папка хранения');
  }
  const relativePath = bookStorageRelativePath(book);
  const url = bookContentUrl(config, book.id);
  const headers = authHeader(config);

  let listener: { remove: () => Promise<void> } | null = null;
  if (onProgress) {
    listener = await BookStorage.addListener('storageDownloadProgress', (event) => {
      if (event.jobId !== jobId) return;
      onProgress(event.loaded, event.total);
    });
  }

  const onAbort = () => {
    void BookStorage.cancelStorageDownload({ jobId }).catch(() => {});
  };
  signal?.addEventListener('abort', onAbort);

  try {
    // Avoid dual native streams if a previous attempt for the same jobId is still alive.
    await BookStorage.cancelStorageDownload({ jobId }).catch(() => {});
    let result: {
      bytesWritten: number;
      digestSha256: string;
    };
    try {
      result = await BookStorage.downloadUrlToStorage({
        url,
        treeUri: directory.uri,
        path: relativePath,
        jobId,
        headers,
      });
    } catch (err) {
      rethrowNativeDownloadError(err);
    }
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return {
      relativePath,
      byteLength: result.bytesWritten,
      digestSha256: result.digestSha256,
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await listener?.remove().catch(() => {});
  }
}

export async function assertDownloadedBookReadableNative(
  directory: StorageDirectory,
  book: Book,
  relativePath: string,
): Promise<void> {
  if (!isNativeApp() || !directory.uri) return;
  const ext = (book.ext || 'fb2').replace(/^\./, '').toLowerCase().replace(/\.zip$/, '');
  if (ext !== 'epub') return;

  const { data } = await BookStorage.readStorageFileHeader({
    treeUri: directory.uri,
    path: relativePath,
    maxBytes: 4,
  });
  const header = base64ToBytes(data);
  if (startsWithMagic(header, SEVEN_ZIP_MAGIC)) {
    throw new Error(
      'EPUB пришёл в формате 7z. Обновите INPX Library Server и скачайте книгу заново.',
    );
  }
  if (!startsWithMagic(header, ZIP_MAGIC)) {
    throw new Error('Скачанный файл не похож на EPUB (ZIP). Попробуйте скачать заново.');
  }
}

export async function verifyStorageFileDigestNative(
  directory: StorageDirectory,
  relativePath: string,
  expectedByteLength: number,
  expectedDigest: string,
): Promise<void> {
  if (!directory.uri) {
    throw new Error('Не выбрана папка хранения');
  }
  const info = await getStorageFileInfoWithRetry(directory.uri, relativePath);
  if (info.size !== expectedByteLength) {
    throw new Error(
      `Проверка файла не пройдена: записано ${expectedByteLength} байт, на диске ${info.size}`,
    );
  }
  if (info.digestSha256 !== expectedDigest) {
    throw new Error('Проверка файла не пройдена: контрольная сумма не совпадает');
  }
}

/** After native streaming download, confirm the on-disk object matches size + digest. */
export async function verifyNativeDownloadResult(
  directory: StorageDirectory,
  relativePath: string,
  result: NativeBookDownloadResult,
): Promise<void> {
  if (result.byteLength <= 0) {
    throw new Error('Проверка файла не пройдена: пустой файл');
  }
  await verifyStorageFileDigestNative(
    directory,
    relativePath,
    result.byteLength,
    result.digestSha256,
  );
}

async function getStorageFileInfoWithRetry(
  treeUri: string,
  relativePath: string,
): Promise<{ size: number; digestSha256: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await BookStorage.getStorageFileInfo({ treeUri, path: relativePath });
    } catch (err) {
      // Отозванный SAF-доступ не лечится повторами — отдаём ошибку сразу.
      if (isStoragePermissionError(err)) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Файл не найден после загрузки');
}
