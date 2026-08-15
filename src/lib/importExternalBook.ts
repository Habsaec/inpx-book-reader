import { Book } from '../types';
import type { StorageDirectory } from './storageDirectory';
import { BookStorage } from './bookStoragePlugin';
import { fileNameFromLaunchUri } from './launchIntent';

function extFromFileName(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || 'fb2').toLowerCase();
}

function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Импортированная книга';
}

function localImportBookId(relativePath: string): string {
  // Два прохода (31 и 37) + длина: Math.abs(INT_MIN) всё ещё отрицателен,
  // а одиночный 32-битный хеш даёт коллизии → чужие позиции/закладки.
  let h1 = 0;
  let h2 = 7;
  for (let i = 0; i < relativePath.length; i++) {
    h1 = (h1 * 31 + relativePath.charCodeAt(i)) | 0;
    h2 = (h2 * 37 + relativePath.charCodeAt(i) * (i + 1)) | 0;
  }
  return `local:import:${relativePath.length.toString(36)}-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`;
}

/** Импорт fb2/epub из content:// или file:// в папку Imports/. */
export async function importExternalBookFromUri(
  directory: StorageDirectory,
  contentUri: string,
): Promise<Book> {
  if (!directory.uri) throw new Error('Не выбрана папка хранения');
  const { relativePath } = await BookStorage.importContentUri({
    treeUri: directory.uri,
    contentUri,
  });
  const fileName = relativePath.split('/').pop() || 'book.fb2';
  const id = localImportBookId(relativePath);
  return {
    id,
    title: titleFromFileName(fileName),
    author: 'Импорт',
    ext: extFromFileName(fileName),
    localFileName: relativePath,
    storageUri: directory.uri,
    contentUrl: '',
    coverUrl: '',
  };
}

export function isImportedLocalBook(book: Book): boolean {
  return book.id.startsWith('local:import:');
}

export function findImportedBookByUri(books: Book[], uri: string): Book | null {
  const name = fileNameFromLaunchUri(uri);
  if (!name) return null;
  const matches = books.filter((b) => {
    const local = b.localFileName?.toLowerCase();
    if (!local) return false;
    return local === name || local.endsWith(`/${name}`) || local.endsWith(`imports/${name}`);
  });
  // Несколько импортов с одинаковым именем файла — не открываем чужую книгу.
  return matches.length === 1 ? matches[0] : null;
}
