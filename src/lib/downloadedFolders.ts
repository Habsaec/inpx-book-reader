import type { Book } from '../types';

/** «Скачанные» as they lie in the library folder: `localFileName` = «Автор/Серия/N-Название.<id>.ext». */
export interface DownloadedFolder {
  name: string;
  /** Books in this folder and every folder below it. */
  count: number;
}

export interface DownloadedFolderView {
  folders: DownloadedFolder[];
  books: Book[];
}

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

function splitPath(book: Book): { dirs: string[]; file: string } {
  const parts = String(book.localFileName || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  const file = parts.pop() || book.title || '';
  return { dirs: parts, file };
}

/**
 * One folder level: sub-folders (by name, numbers in natural order) and the books lying right here
 * (by file name, so «1-…», «2-…», «10-…» keep the volume order the files have on disk).
 * A book without a stored path lies at the top level.
 */
export function downloadedFolderView(books: Book[], path: string[]): DownloadedFolderView {
  const folders = new Map<string, DownloadedFolder>();
  const here: Array<{ book: Book; file: string }> = [];
  for (const book of books) {
    const { dirs, file } = splitPath(book);
    if (dirs.length < path.length || path.some((p, i) => dirs[i] !== p)) continue;
    if (dirs.length === path.length) {
      here.push({ book, file });
      continue;
    }
    const name = dirs[path.length];
    const folder = folders.get(name);
    if (folder) folder.count += 1;
    else folders.set(name, { name, count: 1 });
  }
  return {
    folders: [...folders.values()].sort((a, b) => collator.compare(a.name, b.name)),
    books: here.sort((a, b) => collator.compare(a.file, b.file)).map((x) => x.book),
  };
}

/** Longest part of `path` that still holds books (a folder emptied by a delete is left). */
export function existingDownloadedPath(books: Book[], path: string[]): string[] {
  let p = path;
  while (p.length) {
    const view = downloadedFolderView(books, p);
    if (view.folders.length || view.books.length) return p;
    p = p.slice(0, -1);
  }
  return p;
}
