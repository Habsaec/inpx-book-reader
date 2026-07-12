import { Book } from '../types';
import type { StorageDirectory } from './storageDirectory';
import { registerPlugin } from '@capacitor/core';
import { fileNameFromLaunchUri } from './launchIntent';

const BookStorage = registerPlugin<{
  importContentUri(options: { treeUri: string; contentUri: string }): Promise<{ relativePath: string }>;
}>('BookStorage');

function extFromFileName(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || 'fb2').toLowerCase();
}

function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Импортированная книга';
}

function localImportBookId(relativePath: string): string {
  let hash = 0;
  for (let i = 0; i < relativePath.length; i++) {
    hash = (hash * 31 + relativePath.charCodeAt(i)) | 0;
  }
  return `local:import:${Math.abs(hash)}`;
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
  return (
    books.find((b) => {
      const local = b.localFileName?.toLowerCase();
      return local?.endsWith(name) || local?.endsWith(`imports/${name}`);
    }) ?? null
  );
}
