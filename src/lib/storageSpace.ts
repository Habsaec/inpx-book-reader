import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './platform';
import { formatBytes } from './downloadQueue';

interface BookStorageSpacePlugin {
  getAvailableBytes(): Promise<{ bytes: number }>;
}

const BookStorage = registerPlugin<BookStorageSpacePlugin>('BookStorage');

const STORAGE_MARGIN_BYTES = 50 * 1024 * 1024;

export async function getAvailableStorageBytes(): Promise<number | null> {
  if (!isNativeApp()) return null;
  try {
    const result = await BookStorage.getAvailableBytes();
    return Number(result.bytes) || 0;
  } catch {
    return null;
  }
}

export async function assertEnoughStorage(requiredBytes: number): Promise<void> {
  const available = await getAvailableStorageBytes();
  if (available == null) return;

  const needed = Math.max(requiredBytes, 256 * 1024) + STORAGE_MARGIN_BYTES;
  if (available < needed) {
    throw new Error(
      `Недостаточно места на устройстве. Нужно ~${formatBytes(needed)}, доступно ${formatBytes(available)}`,
    );
  }
}
