import type { Book } from '../types';
import { bookFileExists } from './bookStorage';
import {
  getDefaultStorageDirectory,
  isValidStorageDirectory,
  readStoredStorageDirectory,
  type StorageDirectory,
} from './storageDirectory';

export interface ResolvedLocalBookFile {
  storageUri: string;
  localFileName: string;
  directory: StorageDirectory & { uri: string };
}

function pushCandidate(list: StorageDirectory[], dir: StorageDirectory | null | undefined): void {
  if (!isValidStorageDirectory(dir)) return;
  if (list.some((c) => c.uri === dir.uri)) return;
  list.push(dir);
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
