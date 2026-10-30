import { Capacitor } from '@capacitor/core';
import { ReaderNative } from './readerNative';

/**
 * System «Font size» for the app chrome. The native side sets WebView textZoom to 100
 * (Chromium inflated only the glyphs, so titles overlapped and tab labels were clipped);
 * here the scale grows the root font-size, so every rem-based size, line-height and
 * padding grows together. Capped: at 2× nothing fits on a 6" e-reader.
 */
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.35;
const NATIVE_TIMEOUT_MS = 400;

let currentScale = 1;

export function clampUiFontScale(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
}

/** Current UI scale (1 = 100%); grid column breakpoints divide the width by it. */
export function getUiFontScale(): number {
  return currentScale;
}

export function applyUiFontScale(value: number): void {
  currentScale = clampUiFontScale(value);
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (currentScale === 1) root.style.removeProperty('font-size');
  else root.style.fontSize = `${Math.round(currentScale * 1000) / 10}%`;
}

/** Resolves once the scale is applied (or after a short timeout), so the first render already uses it. */
export async function installUiFontScale(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const res = await Promise.race([
      ReaderNative.getFontScale(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), NATIVE_TIMEOUT_MS)),
    ]);
    if (res) applyUiFontScale(res.fontScale);
  } catch {
    // older native shell without getFontScale — stay at 100%
  }
}
