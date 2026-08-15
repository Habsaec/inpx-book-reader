import { isNativeApp } from './platform';
import { formatBytes } from './downloadQueue';
import { BookStorage } from './bookStoragePlugin';

const STORAGE_MARGIN_BYTES = 50 * 1024 * 1024;

export async function getAvailableStorageBytes(): Promise<number | null> {
  if (!isNativeApp()) return null;
  try {
    const result = await BookStorage.getAvailableBytes();
    const bytes = Number(result.bytes);
    // NaN/мусор из нативного слоя → «неизвестно», а не «0 байт» (ложное «нет места»).
    return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
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
