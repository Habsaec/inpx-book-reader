import type { Book } from '../types';
import { bookFileExists, migrateBookChaptersPathIfNeeded } from './bookStorage';
import {
  getDefaultStorageDirectory,
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
  missingBookIds: string[];
  resolvedDirectory?: StorageDirectory & { uri: string };
  changed: boolean;
}

/** Убрать локальные пути — файл удалён с устройства, метаданные устарели. */
export function clearLocalFileMeta(book: Book): Book {
  const next = { ...book };
  delete next.localFileName;
  delete next.storageUri;
  delete next.chaptersPath;
  return next;
}

function pushCandidate(list: StorageDirectory[], dir: StorageDirectory | null | undefined): void {
  const normalized = normalizeStorageDirectory(dir);
  if (!isValidStorageDirectory(normalized)) return;
  if (list.some((c) => c.uri === normalized.uri)) return;
  list.push(normalized);
}

/** Найти фактическое расположение локального файла книги (с fallback по папкам). */
export async function resolveLocalBookFile(
  book: Book,
  primaryStorage: StorageDirectory | null | undefined,
): Promise<ResolvedLocalBookFile | null> {
  const localFileName = book.localFileName?.trim();
  if (!localFileName) return null;

  const candidates: StorageDirectory[] = [];
  pushCandidate(candidates, book.storageUri ? { label: '', uri: book.storageUri } : null);
  pushCandidate(candidates, primaryStorage);
  pushCandidate(candidates, readStoredStorageDirectory());
  pushCandidate(candidates, await getDefaultStorageDirectory());

  for (const dir of candidates) {
    if (await bookFileExists(dir, localFileName)) {
      const resolved = dir as StorageDirectory & { uri: string };
      return { storageUri: resolved.uri, localFileName, directory: resolved };
    }
  }

  return null;
}

/** Проверить наличие локальных файлов; очистить устаревшие метаданные при отсутствии файла. */
export async function verifyDownloadedBooksLocalFiles(
  books: Book[],
  primaryStorage: StorageDirectory | null | undefined,
): Promise<LocalFileVerificationResult> {
  const missingBookIds: string[] = [];
  let resolvedDirectory: (StorageDirectory & { uri: string }) | undefined;

  const updated = await Promise.all(
    books.map(async (book) => {
      if (!book.localFileName?.trim()) return book;

      const loc = await resolveLocalBookFile(book, primaryStorage);
      if (!loc) {
        missingBookIds.push(book.id);
        return clearLocalFileMeta(book);
      }

      if (!resolvedDirectory) resolvedDirectory = loc.directory;

      let next: Book = book;
      if (loc.storageUri !== book.storageUri) {
        next = { ...next, storageUri: loc.storageUri };
      }
      next = await migrateBookChaptersPathIfNeeded(loc.directory, next);
      return next;
    }),
  );

  let changed = false;
  for (let i = 0; i < books.length; i++) {
    const before = books[i];
    const after = updated[i];
    if (
      before.localFileName !== after.localFileName ||
      before.storageUri !== after.storageUri ||
      before.chaptersPath !== after.chaptersPath
    ) {
      changed = true;
      break;
    }
  }

  return { books: changed ? updated : books, missingBookIds, resolvedDirectory, changed };
}
