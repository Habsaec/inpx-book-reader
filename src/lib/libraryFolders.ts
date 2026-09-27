import { APP_SETTING_KEYS, getAppSettingJson, setAppSettingJson } from './appSettings';
import {
  DEFAULT_STORAGE_LABEL,
  DEFAULT_STORAGE_URI,
  isValidStorageDirectory,
  type StorageDirectory,
} from './storageDirectory';

export interface LibraryFolder {
  id: string;
  label: string;
  uri: string;
}

export interface LibraryFolderSet {
  folders: LibraryFolder[];
  defaultId: string;
  /** Не показывать папку по умолчанию в разделе «Папки». */
  hideDefaultInLocal?: boolean;
}

function folderId(): string {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

/** downloads://Имя и SAF-дерево Download/Имя — одна и та же папка. */
function folderKey(uri: string): string {
  const raw = String(uri || '').trim();
  if (raw.startsWith('downloads://')) {
    const name = decodeURIComponent(raw.slice('downloads://'.length)).replace(/\/+$/, '');
    return name ? `downloads:${name.toLowerCase()}` : raw;
  }
  try {
    const decoded = decodeURIComponent(raw);
    const at = decoded.toLowerCase().lastIndexOf('download/');
    if (at >= 0) {
      const name = decoded.slice(at + 'download/'.length).split(/[/?#]/)[0].replace(/\/+$/, '');
      if (name) return `downloads:${name.toLowerCase()}`;
    }
  } catch {
    /* uri stays as its own key */
  }
  return raw;
}

function sameFolder(a: { uri: string }, b: { uri: string }): boolean {
  return folderKey(a.uri) === folderKey(b.uri);
}

/** downloads:// и content:// на одну и ту же папку Download/Имя. */
export function sameLibraryFolder(a: string, b: string): boolean {
  return folderKey(a) === folderKey(b);
}

function preferFolder(current: LibraryFolder, incoming: LibraryFolder): LibraryFolder {
  const incomingBuiltin = incoming.uri.startsWith('downloads://');
  const currentBuiltin = current.uri.startsWith('downloads://');
  const kept = incomingBuiltin && !currentBuiltin ? { ...incoming, id: current.id } : current;
  const name = folderKey(kept.uri).startsWith('downloads:')
    ? decodeURIComponent(kept.uri.startsWith('downloads://') ? kept.uri.slice('downloads://'.length) : kept.label)
    : kept.label;
  const label = name.replace(/\/+$/, '').toLowerCase() === 'inpxlibraryreader'
    ? DEFAULT_STORAGE_LABEL
    : kept.label;
  return { ...kept, label };
}

function collapse(folders: LibraryFolder[], defaultId: string): LibraryFolderSet {
  const order: string[] = [];
  const byKey = new Map<string, LibraryFolder>();
  let defaultKey = '';
  for (const folder of folders) {
    const key = folderKey(folder.uri);
    if (folder.id === defaultId) defaultKey = key;
    const prev = byKey.get(key);
    if (!prev) {
      order.push(key);
      byKey.set(key, folder);
    } else {
      byKey.set(key, preferFolder(prev, folder));
    }
  }
  const list = order.map((key) => byKey.get(key)!);
  const chosen = list.find((f) => folderKey(f.uri) === defaultKey) || list[0];
  return { folders: list, defaultId: chosen?.id || '' };
}

function normalize(raw: LibraryFolderSet | null, fallback: StorageDirectory | null): LibraryFolderSet {
  const folders = Array.isArray(raw?.folders)
    ? raw.folders.filter((f) => f && f.uri && f.label && f.id)
    : [];
  const hideDefaultInLocal = Boolean(raw?.hideDefaultInLocal);
  if (!folders.length) {
    const uri = isValidStorageDirectory(fallback) ? fallback.uri : DEFAULT_STORAGE_URI;
    const label = isValidStorageDirectory(fallback) ? fallback.label : DEFAULT_STORAGE_LABEL;
    const id = 'builtin';
    return { ...collapse([{ id, label, uri }], id), hideDefaultInLocal };
  }
  return { ...collapse(folders, raw?.defaultId || folders[0].id), hideDefaultInLocal };
}

export function readLibraryFolders(fallback: StorageDirectory | null): LibraryFolderSet {
  const stored = getAppSettingJson<LibraryFolderSet | null>(APP_SETTING_KEYS.libraryFolders, null);
  const next = normalize(stored, fallback);
  const storedCount = stored?.folders?.length ?? 0;
  if (stored && storedCount !== next.folders.length) {
    setAppSettingJson(APP_SETTING_KEYS.libraryFolders, next);
  }
  return next;
}

export function writeLibraryFolders(set: LibraryFolderSet): LibraryFolderSet {
  const next = normalize(set, null);
  setAppSettingJson(APP_SETTING_KEYS.libraryFolders, next);
  return next;
}

export function defaultLibraryFolder(set: LibraryFolderSet): LibraryFolder {
  return set.folders.find((f) => f.id === set.defaultId) || set.folders[0];
}

export function addLibraryFolder(current: LibraryFolderSet, picked: StorageDirectory & { uri: string }): LibraryFolderSet {
  if (current.folders.some((f) => sameFolder(f, picked))) return current;
  const folder: LibraryFolder = { id: folderId(), label: picked.label, uri: picked.uri };
  return writeLibraryFolders({ ...current, folders: [...current.folders, folder] });
}

export function setDefaultLibraryFolder(current: LibraryFolderSet, id: string): LibraryFolderSet {
  if (!current.folders.some((f) => f.id === id)) return current;
  return writeLibraryFolders({ ...current, defaultId: id });
}

export function removeLibraryFolder(current: LibraryFolderSet, id: string): LibraryFolderSet {
  const folders = current.folders.filter((f) => f.id !== id);
  if (!folders.length || folders.length === current.folders.length) return current;
  const defaultId = current.defaultId === id ? folders[0].id : current.defaultId;
  return writeLibraryFolders({ ...current, folders, defaultId });
}

export function setHideDefaultInLocal(current: LibraryFolderSet, hidden: boolean): LibraryFolderSet {
  if (Boolean(current.hideDefaultInLocal) === hidden) return current;
  return writeLibraryFolders({ ...current, hideDefaultInLocal: hidden });
}
