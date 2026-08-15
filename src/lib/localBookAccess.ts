import type { Book } from '../types';
import { checkBookFileState, migrateBookChaptersPathIfNeeded } from './bookStorage';
import {
  getDefaultStorageDirectory,
  isStoragePermissionError,
  isValidStorageDirectory,
  normalizeStorageDirectory,
  readStoredStorageDirectory,
  type StorageDirectory,
} from './storageDirectory';

export interface ResolvedLocalBookFile {
  storageUri: string;
  localFileName: string;
  directory: StorageDirectory & { uri: string };
}

export interface LocalFileVerificationResult {
  books: Book[];
  /** Подмножество books с фактически изменёнными local-полями (для merge по id). */
  changedBooks: Book[];
  missingBookIds: string[];
  /** Проверка не дала определённого ответа (transient bridge/SAF ошибки) — метаданные сохранены. */
  unknownBookIds: string[];
  resolvedDirectory?: StorageDirectory & { uri: string };
  changed: boolean;
}

export type LocalBookFileStatus = 'found' | 'missing' | 'unknown';

export interface LocalBookFileResolution {
  status: LocalBookFileStatus;
  resolved?: ResolvedLocalBookFile;
}

/** Убрать локальные пути — файл удалён с устройства, метаданные устарели. */
export function clearLocalFileMeta(book: Book): Book {
  const next = { ...book };
  delete next.localFileName;
  delete next.storageUri;
  delete next.chaptersPath;
  return next;
}

function safGrantRank(uri: string | undefined): number {
  if (uri?.startsWith('content://')) return 0;
  if (uri?.startsWith('downloads://')) return 2;
  return 1;
}

function pushCandidate(list: StorageDirectory[], dir: StorageDirectory | null | undefined): void {
  const normalized = normalizeStorageDirectory(dir);
  if (!isValidStorageDirectory(normalized)) return;
  if (list.some((c) => c.uri === normalized.uri)) return;
  list.push(normalized);
}

/**
 * Найти фактическое расположение локального файла книги (с fallback по папкам).
 * 'unknown' — ни одна папка не дала определённого ответа (transient ошибки, отозванные деревья).
 */
export async function resolveLocalBookFileDetailed(
  book: Book,
  primaryStorage: StorageDirectory | null | undefined,
): Promise<LocalBookFileResolution> {
  const localFileName = book.localFileName?.trim();
  if (!localFileName) return { status: 'missing' };

  const candidates: StorageDirectory[] = [];
  pushCandidate(candidates, primaryStorage);
  pushCandidate(candidates, readStoredStorageDirectory());
  pushCandidate(candidates, book.storageUri ? { label: '', uri: book.storageUri } : null);
  pushCandidate(candidates, await getDefaultStorageDirectory());
  candidates.sort((a, b) => safGrantRank(a.uri) - safGrantRank(b.uri));

  let sawUnknown = false;
  for (const dir of candidates) {
    try {
      const state = await checkBookFileState(dir, localFileName);
      if (state === 'exists') {
        const resolved = dir as StorageDirectory & { uri: string };
        return { status: 'found', resolved: { storageUri: resolved.uri, localFileName, directory: resolved } };
      }
      if (state === 'unknown') sawUnknown = true;
    } catch (err) {
      // Revoked SAF tree on one candidate must not block fallbacks (Downloads / other trees).
      if (!isStoragePermissionError(err)) {
        console.warn('[localBookAccess] file check failed:', err);
      }
      sawUnknown = true;
    }
  }

  return { status: sawUnknown ? 'unknown' : 'missing' };
}

/** Найти фактическое расположение локального файла книги (с fallback по папкам). */
export async function resolveLocalBookFile(
  book: Book,
  primaryStorage: StorageDirectory | null | undefined,
): Promise<ResolvedLocalBookFile | null> {
  const res = await resolveLocalBookFileDetailed(book, primaryStorage);
  return res.status === 'found' && res.resolved ? res.resolved : null;
}

/** До 4 native bridge-вызовов на книгу — проверяем пачками, чтобы не задавить мост. */
const VERIFY_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Проверить наличие локальных файлов; очистить устаревшие метаданные при отсутствии файла. */
export async function verifyDownloadedBooksLocalFiles(
  books: Book[],
  primaryStorage: StorageDirectory | null | undefined,
): Promise<LocalFileVerificationResult> {
  const missingBookIds: string[] = [];
  const unknownBookIds: string[] = [];
  let resolvedDirectory: (StorageDirectory & { uri: string }) | undefined;

  const updated = await mapWithConcurrency(books, VERIFY_CONCURRENCY, async (book) => {
    if (!book.localFileName?.trim()) return book;

    let res: LocalBookFileResolution;
    try {
      res = await resolveLocalBookFileDetailed(book, primaryStorage);
    } catch (err) {
      // Одна проблемная книга не должна ронять проверку остальных.
      console.warn('[localBookAccess] verify failed for book', book.id, err);
      unknownBookIds.push(book.id);
      return book;
    }

    if (res.status === 'unknown') {
      unknownBookIds.push(book.id);
      return book;
    }
    if (res.status === 'missing' || !res.resolved) {
      missingBookIds.push(book.id);
      return clearLocalFileMeta(book);
    }

    const loc = res.resolved;
    if (!resolvedDirectory) resolvedDirectory = loc.directory;

    let next: Book = book;
    if (loc.storageUri !== book.storageUri) {
      next = { ...next, storageUri: loc.storageUri };
    }
    next = await migrateBookChaptersPathIfNeeded(loc.directory, next);
    return next;
  });

  const changedBooks: Book[] = [];
  for (let i = 0; i < books.length; i++) {
    const before = books[i];
    const after = updated[i];
    if (
      before.localFileName !== after.localFileName ||
      before.storageUri !== after.storageUri ||
      before.chaptersPath !== after.chaptersPath
    ) {
      changedBooks.push(after);
    }
  }
  const changed = changedBooks.length > 0;

  return {
    books: changed ? updated : books,
    changedBooks,
    missingBookIds,
    unknownBookIds,
    resolvedDirectory,
    changed,
  };
}
