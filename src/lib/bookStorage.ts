/**
 * Работа с файловой системой Android через Storage Access Framework.
 * 
 * 📱 ТОЛЬКО ANDROID. Использует нативный Capacitor-плагин BookStorage.
 * 
 * @see AGENTS.md — приложение только для Android
 */

import { registerPlugin } from '@capacitor/core';
import { Book } from '../types';
import type { StorageDirectory } from './storageDirectory';
import { computeBufferDigest } from './fileDigest';

const META_DIR = '.inpx-reader';

interface BookStoragePlugin {
  writeBinaryFile(options: { treeUri: string; path: string; data: string }): Promise<void>;
  readBinaryFile(options: { treeUri: string; path: string }): Promise<{ data: string }>;
  writeTextFile(options: { treeUri: string; path: string; content: string }): Promise<void>;
  readTextFile(options: { treeUri: string; path: string }): Promise<{ content: string }>;
  deleteFile(options: { treeUri: string; path: string }): Promise<void>;
  importContentUri(options: { treeUri: string; contentUri: string }): Promise<{ relativePath: string }>;
  fileExists(options: { treeUri: string; path: string }): Promise<{ exists: boolean }>;
}

const BookStorage = registerPlugin<BookStoragePlugin>('BookStorage');

export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/[\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
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

  const fileName =
    book.seriesNo != null && book.seriesNo > 0
      ? `${book.seriesNo}-${title}.${ext}`
      : `${title}.${ext}`;

  return `${author}/${series}/${fileName}`;
}

/** @deprecated use bookStorageRelativePath */
export function bookDisplayFileName(book: Book): string {
  return bookStorageRelativePath(book);
}

export function bookChaptersPath(bookId: string): string {
  return `${META_DIR}/${bookId}.json`;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
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

export async function bookFileExists(
  directory: StorageDirectory,
  relativePath: string,
): Promise<boolean> {
  if (!directory.uri || !relativePath) return false;
  try {
    const result = await BookStorage.fileExists({ treeUri: directory.uri, path: relativePath });
    return Boolean(result?.exists);
  } catch (err) {
    // fileExists может отсутствовать в старой сборке — не блокируем UI, но не считаем файл существующим
    console.warn('[bookStorage] fileExists check failed:', err);
    return false;
  }
}

/** Проверка размера и digest после записи через SAF. */
export async function verifyBookFileIntegrity(
  directory: StorageDirectory,
  relativePath: string,
  expectedByteLength: number,
  expectedDigest: string,
): Promise<void> {
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
