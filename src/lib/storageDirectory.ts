import { registerPlugin } from '@capacitor/core';
import { APP_SETTING_KEYS, getAppSettingJson, setAppSettingJson } from './appSettings';
import { isAndroid } from './platform';

export interface StorageDirectory {
  label: string;
  uri?: string;
}

export const DEFAULT_STORAGE_LABEL = 'Download/INPXLibraryReader';
export const DEFAULT_STORAGE_URI = 'downloads://INPXLibraryReader';

interface FolderPickerPlugin {
  pickFolder(): Promise<{ uri: string; label: string }>;
}

interface BookStoragePlugin {
  getDefaultStorageDirectory(): Promise<{ uri: string; label: string }>;
}

const FolderPicker = registerPlugin<FolderPickerPlugin>('FolderPicker');
const BookStorage = registerPlugin<BookStoragePlugin>('BookStorage');

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

/** Resolve storage directory: saved SAF folder or platform default. */
export async function ensureStorageDirectory(
  current: StorageDirectory | null | undefined,
): Promise<StorageDirectory | null> {
  if (isValidStorageDirectory(current)) return current;

  const stored = readStoredStorageDirectory();
  if (isValidStorageDirectory(stored)) return stored;

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
