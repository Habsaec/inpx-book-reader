import { registerPlugin } from '@capacitor/core';
import { APP_SETTING_KEYS, getAppSettingJson, setAppSettingJson } from './appSettings';
import { isAndroid } from './platform';
import { BookStorage } from './bookStoragePlugin';

export interface StorageDirectory {
  label: string;
  uri?: string;
}

export const DEFAULT_STORAGE_LABEL = 'Download/INPXLibraryReader';
export const DEFAULT_STORAGE_URI = 'downloads://INPXLibraryReader';

interface FolderPickerPlugin {
  pickFolder(): Promise<{ uri: string; label: string }>;
}

const FolderPicker = registerPlugin<FolderPickerPlugin>('FolderPicker');

export const STORAGE_PERMISSION_REVOKED_MSG =
  'Доступ к папке отозван. Выберите папку хранения в настройках.';

export function isStoragePermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /PERMISSION_REVOKED|доступ к папке отозван|SecurityException|Permission Denial|permission denied/i.test(
    msg,
  );
}

function hasValidStorageUri(uri: string | undefined | null): uri is string {
  if (!uri || !uri.trim()) return false;
  return (
    uri.startsWith('downloads://') ||
    uri.startsWith('file://') ||
    uri.startsWith('content://')
  );
}

export function isValidStorageDirectory(
  directory: StorageDirectory | null | undefined,
): directory is StorageDirectory & { uri: string } {
  return Boolean(directory && hasValidStorageUri(directory.uri));
}

export function readStoredStorageDirectory(): StorageDirectory | null {
  const parsed = getAppSettingJson<StorageDirectory | null>(APP_SETTING_KEYS.storageDirectory, null);
  return isValidStorageDirectory(parsed) ? parsed : null;
}

export function writeStoredStorageDirectory(directory: StorageDirectory): void {
  if (!isValidStorageDirectory(directory)) return;
  setAppSettingJson(APP_SETTING_KEYS.storageDirectory, directory);
}

/** Probe native access; content:// trees can be revoked by Android after pick. */
export async function checkStorageAccess(
  directory: StorageDirectory | null | undefined,
): Promise<{ ok: boolean; code?: string }> {
  if (!isValidStorageDirectory(directory)) {
    return { ok: false, code: 'INVALID' };
  }
  if (!directory.uri.startsWith('content://')) {
    return { ok: true };
  }
  if (!isAndroid()) {
    return { ok: true };
  }
  try {
    return await BookStorage.checkAccess({ treeUri: directory.uri });
  } catch {
    return { ok: false, code: 'REVOKED' };
  }
}

async function fetchDefaultStorageDirectoryWithRetry(
  maxAttempts = 10,
  delayMs = 200,
): Promise<StorageDirectory | null> {
  if (!isAndroid()) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await BookStorage.getDefaultStorageDirectory();
      if (hasValidStorageUri(result?.uri)) {
        return { label: result.label || DEFAULT_STORAGE_LABEL, uri: result.uri };
      }
    } catch {
      /* Capacitor bridge may not be ready yet */
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Android 10+ uses a fixed virtual URI handled natively.
  return { label: DEFAULT_STORAGE_LABEL, uri: DEFAULT_STORAGE_URI };
}

export async function getDefaultStorageDirectory(): Promise<StorageDirectory | null> {
  return fetchDefaultStorageDirectoryWithRetry(3, 150);
}

async function recoverPersistedDownloadsTree(
  label: string,
): Promise<StorageDirectory | null> {
  if (!isAndroid()) return null;
  try {
    const result = await BookStorage.getPersistedDownloadsTree({ folder: 'INPXLibraryReader' });
    if (result?.uri?.startsWith('content://')) {
      return { label: label || DEFAULT_STORAGE_LABEL, uri: result.uri };
    }
  } catch {
    /* plugin missing on older builds */
  }
  return null;
}

/**
 * Resolve storage directory: saved SAF folder or platform default.
 * If a saved content:// tree was revoked, fall back to the default Downloads folder.
 */
export async function ensureStorageDirectory(
  current: StorageDirectory | null | undefined,
): Promise<StorageDirectory | null> {
  if (isValidStorageDirectory(current)) {
    if (current.uri.startsWith('downloads://')) {
      const recovered = await recoverPersistedDownloadsTree(current.label);
      if (recovered) return recovered;
    }
    const access = await checkStorageAccess(current);
    if (access.ok) return current;
    if (current.uri.startsWith('content://')) {
      const recovered = await recoverPersistedDownloadsTree(current.label);
      if (recovered) return recovered;
      return fetchDefaultStorageDirectoryWithRetry();
    }
  }

  const stored = readStoredStorageDirectory();
  if (isValidStorageDirectory(stored)) {
    if (stored.uri.startsWith('downloads://')) {
      const recovered = await recoverPersistedDownloadsTree(stored.label);
      if (recovered) return recovered;
    }
    const access = await checkStorageAccess(stored);
    if (access.ok) return stored;
    if (stored.uri.startsWith('content://')) {
      const recovered = await recoverPersistedDownloadsTree(stored.label);
      if (recovered) return recovered;
      return fetchDefaultStorageDirectoryWithRetry();
    }
  }

  const recovered = await recoverPersistedDownloadsTree(DEFAULT_STORAGE_LABEL);
  if (recovered) return recovered;
  return fetchDefaultStorageDirectoryWithRetry();
}

export async function pickStorageDirectory(): Promise<StorageDirectory | null> {
  try {
    const result = await FolderPicker.pickFolder();
    const directory = { label: result.label || 'Папка', uri: result.uri };
    if (!isValidStorageDirectory(directory)) {
      throw new Error('Android вернул некорректный адрес папки');
    }
    writeStoredStorageDirectory(directory);
    return directory;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('cancel')) return null;
    throw error;
  }
}

export function isDefaultStorageDirectory(directory: StorageDirectory | null | undefined): boolean {
  if (!directory) return false;
  return (
    directory.label === DEFAULT_STORAGE_LABEL ||
    directory.uri === DEFAULT_STORAGE_URI ||
    directory.uri?.startsWith('downloads://') === true
  );
}

/** Keep SAF grants verbatim: converting them to downloads:// discards the permission. */
export function normalizeStorageDirectory(directory: StorageDirectory | null | undefined): StorageDirectory | null {
  return directory ?? null;
}
