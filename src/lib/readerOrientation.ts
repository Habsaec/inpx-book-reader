import { Capacitor } from '@capacitor/core';
import { ReaderNative } from './readerNative';

export type ReaderOrientationLock = 'auto' | 'portrait' | 'landscape';

export async function applyReaderOrientationLock(mode: ReaderOrientationLock): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ReaderNative.setOrientationLock({ mode });
  } catch {
    /* plugin unavailable in dev browser */
  }
}
