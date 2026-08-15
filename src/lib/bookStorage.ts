/**
 * Работа с файловой системой Android через Storage Access Framework.
 * 
 * 📱 ТОЛЬКО ANDROID. Использует нативный Capacitor-плагин BookStorage.
 * 
 * @see AGENTS.md — приложение только для Android
 */

import { Capacitor } from '@capacitor/core';
import { Book } from '../types';
import type { StorageDirectory } from './storageDirectory';
import { isStoragePermissionError } from './storageDirectory';
import { computeBufferDigest } from './fileDigest';
import { legacyStrippedBookIdFileKey, safeBookIdFileKey } from './bookRef';
import { BookStorage } from './bookStoragePlugin';
import { isNativeApp } from './platform';
import { verifyStorageFileDigestNative } from './nativeDownload';

const META_DIR = '.inpx-reader';

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    // "#" is legal on disk, but Capacitor file URLs treat it as a fragment
    // and return 404; generated download paths must stay fetchable by WebView.
    .replace(/[\/:*?"<>|\\#]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    // vfat silently strips trailing dots/spaces → stored name would never match on-disk.
    .replace(/[. ]+$/, '')
    .slice(0, 120);
  // Не давать сегменты "." / ".." — иначе путь уезжает из папки библиотеки.
  if (!cleaned || cleaned === '.' || cleaned === '..' || /^\.+$/.test(cleaned)) {
    return '_';
  }
  return cleaned;
}

/** Расширение из относительного пути на диске (`Author/Series/1-Title.epub` → `epub`). */
export function extFromStoragePath(relativePath: string): string {
  const m = relativePath.match(/\.([a-z0-9]+)$/i);
  return m?.[1]?.toLowerCase() || '';
}

export function bookStorageRelativePath(book: Book): string {
  const author = sanitizeFileName(book.author || 'Неизвестный автор');
  const series = sanitizeFileName(book.series || 'Без серии');
  const title = sanitizeFileName(book.title || 'Без названия');
  const ext = (book.ext || 'fb2').replace(/^\./, '');
  // Distinct bookIds can share author/series/title — suffix keeps SAF paths unique.
  const idKey = safeBookIdFileKey(book.id);

  const prefix = book.seriesNo != null && book.seriesNo > 0 ? `${book.seriesNo}-` : '';
  // vfat/exFAT limit is 255 UTF-16 units per component — cap with headroom.
  const MAX_COMPONENT = 240;
  let fileName = `${prefix}${title}.${idKey}.${ext}`;
  if (fileName.length > MAX_COMPONENT) {
    const titleBudget = Math.max(16, MAX_COMPONENT - prefix.length - idKey.length - ext.length - 2);
    const shortTitle = (title.length > titleBudget ? title.slice(0, titleBudget) : title).replace(/[. ]+$/, '') || '_';
    fileName = `${prefix}${shortTitle}.${idKey}.${ext}`;
    if (fileName.length > MAX_COMPONENT) {
      const idBudget = Math.max(16, MAX_COMPONENT - prefix.length - shortTitle.length - ext.length - 2);
      fileName = `${prefix}${shortTitle}.${idKey.slice(0, idBudget)}.${ext}`;
    }
  }

  return `${author}/${series}/${fileName}`;
}

/** @deprecated use bookStorageRelativePath */
export function bookDisplayFileName(book: Book): string {
  return bookStorageRelativePath(book);
}

export function bookChaptersPath(bookId: string): string {
  return `${META_DIR}/${safeBookIdFileKey(bookId)}.json`;
}

function legacyBookChaptersPath(bookId: string): string {
  return `${META_DIR}/${legacyStrippedBookIdFileKey(bookId)}.json`;
}

async function migrateTextMetaFile(
  treeUri: string,
  fromPath: string,
  toPath: string,
): Promise<boolean> {
  if (!fromPath || !toPath || fromPath === toPath) return false;
  try {
    const dest = await BookStorage.fileExists({ treeUri, path: toPath });
    if (dest?.exists) {
      try {
        await BookStorage.deleteFile({ treeUri, path: fromPath });
      } catch {
        /* orphan ok */
      }
      return true;
    }
    const src = await BookStorage.fileExists({ treeUri, path: fromPath });
    if (!src?.exists) return false;
    const { content } = await BookStorage.readTextFile({ treeUri, path: fromPath });
    await BookStorage.writeTextFile({ treeUri, path: toPath, content });
    try {
      await BookStorage.deleteFile({ treeUri, path: fromPath });
    } catch {
      /* orphan ok */
    }
    return true;
  } catch {
    return false;
  }
}

/** Move legacy chapters JSON to `safeBookIdFileKey` path; return updated book if path changed. */
export async function migrateBookChaptersPathIfNeeded(
  directory: StorageDirectory,
  book: Book,
): Promise<Book> {
  if (!directory.uri || !book.id) return book;
  const canonical = bookChaptersPath(book.id);
  const candidates = new Set<string>();
  if (book.chaptersPath?.trim()) candidates.add(book.chaptersPath.trim());
  const legacy = legacyBookChaptersPath(book.id);
  if (legacy !== canonical) candidates.add(legacy);

  for (const from of candidates) {
    if (from === canonical) continue;
    await migrateTextMetaFile(directory.uri, from, canonical);
  }

  if (book.chaptersPath === canonical) return book;
  return { ...book, chaptersPath: canonical };
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return bufferToBase64(buffer);
}

export async function persistBookToDirectory(
  directory: StorageDirectory,
  book: Book,
  originalBuffer: ArrayBuffer,
  chaptersJson: string,
): Promise<{ localFileName: string; chaptersPath: string }> {
  if (!directory.uri) {
    throw new Error('Не выбрана папка хранения');
  }

  const localFileName = bookStorageRelativePath(book);
  const chaptersPath = bookChaptersPath(book.id);
  const treeUri = directory.uri;

  try {
    await BookStorage.writeBinaryFile({
      treeUri,
      path: localFileName,
      data: bufferToBase64(originalBuffer),
    });

    await BookStorage.writeTextFile({
      treeUri,
      path: chaptersPath,
      content: chaptersJson,
    });
  } catch (err) {
    // Avoid orphan binary without chapters meta.
    await BookStorage.deleteFile({ treeUri, path: localFileName }).catch(() => {});
    await BookStorage.deleteFile({ treeUri, path: chaptersPath }).catch(() => {});
    throw err;
  }

  return { localFileName, chaptersPath };
}

/** Persist chapters JSON when the book binary was already written natively. */
export async function persistBookMetadataToDirectory(
  directory: StorageDirectory,
  book: Book,
  chaptersJson: string,
): Promise<{ localFileName: string; chaptersPath: string }> {
  if (!directory.uri) {
    throw new Error('Не выбрана папка хранения');
  }

  const localFileName = bookStorageRelativePath(book);
  const chaptersPath = bookChaptersPath(book.id);
  const treeUri = directory.uri;

  try {
    await BookStorage.writeTextFile({
      treeUri,
      path: chaptersPath,
      content: chaptersJson,
    });
  } catch (err) {
    await BookStorage.deleteFile({ treeUri, path: localFileName }).catch(() => {});
    await BookStorage.deleteFile({ treeUri, path: chaptersPath }).catch(() => {});
    throw err;
  }

  return { localFileName, chaptersPath };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function readBinaryFileFromDirectory(
  directory: StorageDirectory,
  relativePath: string,
): Promise<ArrayBuffer> {
  if (!directory.uri) {
    throw new Error('Не выбрана папка хранения');
  }
  const result = await BookStorage.readBinaryFile({ treeUri: directory.uri, path: relativePath });
  return base64ToArrayBuffer(result.data);
}

export type ResolveStorageFileUrlOptions = {
  /** Skip downloads disk path (already 404'd) and copy into app-private book-cache. */
  preferCache?: boolean;
};

/**
 * Fetchable file URL for the reader: Capacitor `_capacitor_file_` path, never base64
 * through the JS bridge (OOM on 20+ MB FB2/EPUB). Downloads-backed trees use the
 * disk file when readable; SAF trees are streamed into `files/book-cache/`.
 */
export async function resolveStorageFileUrl(
  directory: StorageDirectory,
  relativePath: string,
  options?: ResolveStorageFileUrlOptions,
): Promise<string | null> {
  if (!isNativeApp() || !directory.uri || !relativePath) return null;
  if (!options?.preferCache) {
    try {
      const { absolutePath } = await BookStorage.getStorageFilePath({
        treeUri: directory.uri,
        path: relativePath,
      });
      if (absolutePath) return Capacitor.convertFileSrc(absolutePath);
    } catch {
      /* fall through to book-cache copy */
    }
  }
  try {
    const { absolutePath } = await BookStorage.copyStorageFileToBookCache({
      treeUri: directory.uri,
      path: relativePath,
    });
    if (!absolutePath) return null;
    return Capacitor.convertFileSrc(absolutePath);
  } catch (err) {
    if (isStoragePermissionError(err)) throw err;
    return null;
  }
}

export type BookFileState = 'exists' | 'missing' | 'unknown';

/**
 * Три исхода вместо boolean: transient-ошибка моста/SAF ('unknown') не должна
 * трактоваться как «файла нет» — иначе верификация затирает валидные метаданные.
 */
export async function checkBookFileState(
  directory: StorageDirectory,
  relativePath: string,
): Promise<BookFileState> {
  if (!directory.uri || !relativePath) return 'missing';
  try {
    const result = await BookStorage.fileExists({ treeUri: directory.uri, path: relativePath });
    return result?.exists ? 'exists' : 'missing';
  } catch (err) {
    if (isStoragePermissionError(err)) throw err;
    // fileExists может отсутствовать в старой сборке — не блокируем UI, но и не считаем файл отсутствующим
    console.warn('[bookStorage] fileExists check failed:', err);
    return 'unknown';
  }
}

export async function bookFileExists(
  directory: StorageDirectory,
  relativePath: string,
): Promise<boolean> {
  return (await checkBookFileState(directory, relativePath)) === 'exists';
}

/** Проверка размера и digest после записи через SAF. */
export async function verifyBookFileIntegrity(
  directory: StorageDirectory,
  relativePath: string,
  expectedByteLength: number,
  expectedDigest: string,
): Promise<void> {
  if (isNativeApp()) {
    await verifyStorageFileDigestNative(directory, relativePath, expectedByteLength, expectedDigest);
    return;
  }
  const buf = await readBinaryFileFromDirectory(directory, relativePath);
  if (buf.byteLength !== expectedByteLength) {
    throw new Error(
      `Проверка файла не пройдена: записано ${expectedByteLength} байт, прочитано ${buf.byteLength}`,
    );
  }
  const digest = await computeBufferDigest(buf);
  if (digest !== expectedDigest) {
    throw new Error('Проверка файла не пройдена: контрольная сумма не совпадает');
  }
}

/** @deprecated use verifyBookFileIntegrity */
export async function verifyBookFileSize(
  directory: StorageDirectory,
  relativePath: string,
  expectedByteLength: number,
): Promise<void> {
  const buf = await readBinaryFileFromDirectory(directory, relativePath);
  if (buf.byteLength !== expectedByteLength) {
    throw new Error(
      `Проверка файла не пройдена: записано ${expectedByteLength} байт, прочитано ${buf.byteLength}`,
    );
  }
}

export async function loadChaptersFromDirectory(
  directory: StorageDirectory,
  chaptersPath: string,
): Promise<string> {
  if (!directory.uri) {
    throw new Error('Не выбрана папка хранения');
  }
  const result = await BookStorage.readTextFile({ treeUri: directory.uri, path: chaptersPath });
  return result.content;
}

export async function removeBookFromDirectory(
  directory: StorageDirectory,
  localFileName?: string,
  chaptersPath?: string,
): Promise<void> {
  if (!directory.uri) return;
  const treeUri = directory.uri;
  const tasks: Promise<void>[] = [];
  if (localFileName) {
    tasks.push(BookStorage.deleteFile({ treeUri, path: localFileName }));
  }
  if (chaptersPath) {
    tasks.push(BookStorage.deleteFile({ treeUri, path: chaptersPath }));
  }
  await Promise.allSettled(tasks);
}
