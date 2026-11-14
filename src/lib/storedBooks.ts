/**
 * Books already downloaded into the library folder, found again from their files — after a
 * reinstall the app's own list is empty, but every downloaded file still carries its book id in
 * its name (`bookStorageRelativePath`: `<Author>/<Series>/<N>-<Title>.<idKey>.<ext>`).
 * Without this the app downloaded the same books again next to the old files.
 */

import type { Book, ServerConfig } from '../types';
import { decodeBookRef } from './bookRef';
import { bookChaptersPath, transliterateFilePart } from './bookStorage';
import { BookStorage } from './bookStoragePlugin';
import { bookContentUrl, displayCoverUrl } from './inpxClient';
import type { StorageDirectory } from './storageDirectory';
import { t } from '../i18n';

export interface StoredBookFile {
  id: string;
  title: string;
  author: string;
  series?: string;
  seriesNo?: number;
  ext: string;
  /** Relative path inside the library folder. */
  localFileName: string;
  /** A «name (N).ext» copy (made by Android when a write could not see the original). */
  duplicate: boolean;
}

/** «Без серии» / «Неизвестный автор» in both interface languages and both file-name styles. */
function placeholderNames(): Set<string> {
  const out = new Set<string>();
  for (const label of [t('common.noSeries'), t('common.unknownAuthor'), 'Без серии', 'Неизвестный автор', 'No series', 'Unknown author']) {
    out.add(label.toLowerCase());
    out.add(transliterateFilePart(label).toLowerCase());
  }
  return out;
}

/** `8_701371` → `8:701371`, `b64_…` → the decoded id; anything else is not a server id we wrote. */
export function bookIdFromFileKey(key: string): string | null {
  if (!key) return null;
  if (key.startsWith('b64_')) return decodeBookRef(key.slice(4));
  const m = /^(\d+)_(\d+)$/.exec(key);
  if (m) return `${m[1]}:${m[2]}`;
  // Folder sources on the server use 32-hex ids (no ':'), written as they are.
  if (/^[0-9a-f]{32}$/.test(key)) return key;
  return null;
}

const DUP_RE = /^(.+) \((\d{1,4})\)$/;

export function parseStoredBookPath(path: string): StoredBookFile | null {
  const parts = String(path || '').split('/').filter(Boolean);
  if (parts.length === 0) return null;
  let file = parts[parts.length - 1]!;
  const lower = file.toLowerCase();
  const ext = lower.endsWith('.fb2.zip') ? 'fb2.zip' : lower.slice(lower.lastIndexOf('.') + 1);
  if (!ext || ext === lower) return null;
  let stem = file.slice(0, file.length - ext.length - 1);
  let duplicate = false;
  const dup = DUP_RE.exec(stem);
  if (dup) {
    stem = dup[1]!;
    duplicate = true;
  }
  const dot = stem.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = bookIdFromFileKey(stem.slice(dot + 1));
  if (!id) return null;
  let title = stem.slice(0, dot);
  let seriesNo: number | undefined;
  const skip = placeholderNames();
  const author = parts.length >= 2 && !skip.has(parts[0]!.toLowerCase()) ? parts[0]! : '';
  const series = parts.length >= 3 && !skip.has(parts[1]!.toLowerCase()) ? parts[1]! : undefined;
  // «N-» is a volume number only inside a series folder: «13-й воин», «11-22-63» are whole titles.
  const numbered = series ? /^(\d{1,5})-(.+)$/.exec(title) : null;
  if (numbered) {
    seriesNo = Number(numbered[1]);
    title = numbered[2]!;
  }
  file = parts.join('/');
  return {
    id,
    title: title.trim() || t('bookStorage.untitled'),
    author,
    ...(series ? { series } : {}),
    ...(series && seriesNo ? { seriesNo } : {}),
    ext: ext === 'fb2.zip' ? 'fb2' : ext,
    localFileName: file,
    duplicate,
  };
}

/**
 * One entry per book id: the original file wins over its «(N)» copies; a copy is used only when
 * the original is gone. Books the app already knows (by id or by file) are left out.
 */
export function pickStoredBooks(paths: string[], known: Array<Pick<Book, 'id' | 'localFileName'>>): StoredBookFile[] {
  const knownIds = new Set(known.map((b) => b.id));
  const knownFiles = new Set(known.map((b) => (b.localFileName || '').trim()).filter(Boolean));
  const byId = new Map<string, StoredBookFile>();
  for (const path of paths) {
    const parsed = parseStoredBookPath(path);
    if (!parsed || knownIds.has(parsed.id) || knownFiles.has(parsed.localFileName)) continue;
    const prev = byId.get(parsed.id);
    if (!prev || (prev.duplicate && !parsed.duplicate)) byId.set(parsed.id, parsed);
  }
  return [...byId.values()];
}

// --- Finding them on the device ---

/** Android 11+: without «All files access» a reinstalled app does not see its old files in Download/. */
export async function hasStoredFilesAccess(): Promise<boolean> {
  try {
    return Boolean((await BookStorage.hasAllFilesAccess())?.granted);
  } catch {
    return true;
  }
}

/** The system «All files access» screen for this app; true when granted afterwards. */
export async function requestStoredFilesAccess(): Promise<boolean> {
  try {
    return Boolean((await BookStorage.requestAllFilesAccess())?.granted);
  } catch {
    return false;
  }
}

/** The default library folder in Download/ (where reinstall ownership loss bites); SAF trees keep their grant. */
export function isDownloadsLibraryFolder(directory: StorageDirectory | null | undefined): boolean {
  return Boolean(directory?.uri && directory.uri.startsWith('downloads://'));
}

/**
 * Registers the books found in the library folder that the app does not know yet. Returns how many
 * were added. Metadata comes from the path; the server id is matched later by the usual alias
 * resolution (`/api/books/resolve`), so books from an older source id work too.
 */
export async function reattachStoredBooks(options: {
  directory: StorageDirectory | null;
  known: Book[];
  config: ServerConfig;
  register: (book: Book) => void;
}): Promise<number> {
  const treeUri = options.directory?.uri;
  if (!treeUri) return 0;
  let paths: string[] = [];
  try {
    paths = (await BookStorage.listBookFiles({ treeUri }))?.paths ?? [];
  } catch {
    return 0;
  }
  const found = pickStoredBooks(paths, options.known);
  for (const file of found) {
    const chaptersPath = bookChaptersPath(file.id);
    const hasChapters = await BookStorage.fileExists({ treeUri, path: chaptersPath })
      .then((r) => Boolean(r?.exists))
      .catch(() => false);
    options.register({
      id: file.id,
      title: file.title,
      author: file.author,
      ...(file.series ? { series: file.series, seriesDisplay: file.series } : {}),
      ...(file.seriesNo ? { seriesNo: file.seriesNo } : {}),
      ext: file.ext,
      localFileName: file.localFileName,
      storageUri: treeUri,
      ...(hasChapters ? { chaptersPath } : {}),
      contentUrl: bookContentUrl(options.config, file.id),
      coverUrl: displayCoverUrl(options.config, file.id),
    });
  }
  return found.length;
}

/** «name (N)» copies next to their originals in the library folder: counted, or removed when `remove`. */
export async function cleanupStoredDuplicates(
  directory: StorageDirectory | null,
  remove: boolean,
): Promise<{ count: number; bytes: number; deleted: number }> {
  const none = { count: 0, bytes: 0, deleted: 0 };
  if (!directory?.uri) return none;
  try {
    const res = await BookStorage.cleanupDuplicateFiles({ treeUri: directory.uri, delete: remove });
    return { count: Number(res?.count) || 0, bytes: Number(res?.bytes) || 0, deleted: Number(res?.deleted) || 0 };
  } catch {
    return none;
  }
}

/** `app_meta`: the «find books downloaded before?» question was asked on this install. */
export const STORED_BOOKS_ASKED_KEY = 'stored_books_asked';
/** Settings → «Найти скачанные книги»: App runs the scan (it holds the library list). */
export const STORED_BOOKS_RESCAN_EVENT = 'inpx-stored-books-rescan';
