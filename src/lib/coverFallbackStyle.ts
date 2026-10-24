/**
 * Placeholder cover styling from INPX Library Server (`GET /api/settings/ui`): an uploaded
 * fallback image, title colour / shadow / size / offset. Mirrors the server's
 * `coverFallbackToCssVars` (src/services/ui-customization.js) so the app and the site agree.
 * Without server settings the bundled leather / parchment and index.css defaults stay.
 */
import React from 'react';

const DEFAULT_TITLE_COLOR = '#f6f1e6';
/** Server `COVER_TITLE_COLOR_ON_LIGHT`: theme ink on the bundled parchment. */
const TITLE_COLOR_ON_LIGHT = '#2a2014';

export interface CoverFallbackStyle {
  /** Absolute URL of the admin-uploaded placeholder (same image for both themes), or null. */
  imageUrl: string | null;
  colorDark: string;
  colorLight: string;
  /** 0–100, server default 0 (no shadow). */
  shadow: number;
  /** Title size multiplier (server 60–160 %). */
  scale: number;
  /** Title offset in server units (−24…24): x × 1cqi, y × 1.5cqi. */
  x: number;
  y: number;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function hexColor(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : fallback;
}

function absoluteUrl(path: string, serverUrl: string): string | null {
  if (!path) return null;
  try {
    return new URL(path, serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`).toString();
  } catch {
    return null;
  }
}

/** Null when the server has nothing custom — the app keeps its own defaults. */
export function coverFallbackStyleFromUi(raw: Record<string, unknown>, serverUrl: string): CoverFallbackStyle | null {
  if (raw.hasCustomCoverFallback !== true) return null;
  const customPath = String(raw.coverFallbackUrl ?? '').trim();
  const color = hexColor(raw.coverTitleColor, DEFAULT_TITLE_COLOR);
  const colorSet = raw.coverTitleColorSet === true || (raw.coverTitleColorSet !== false && color !== DEFAULT_TITLE_COLOR);
  const useThemeInk = !customPath && !colorSet;
  return {
    imageUrl: absoluteUrl(customPath, serverUrl),
    colorDark: useThemeInk ? DEFAULT_TITLE_COLOR : color,
    colorLight: useThemeInk ? TITLE_COLOR_ON_LIGHT : color,
    shadow: clampInt(raw.coverTitleShadow, 0, 100, 0),
    scale: clampInt(raw.coverTitleSize, 60, 160, 100) / 100,
    x: clampInt(raw.coverTitleX, -24, 24, 0),
    y: clampInt(raw.coverTitleY, -24, 24, 0),
  };
}

const CSS_VARS = [
  '--inpx-cover-title-color',
  '--inpx-cover-title-color-light',
  '--inpx-cover-title-shadow',
  '--inpx-cover-title-scale',
  '--inpx-cover-title-x',
  '--inpx-cover-title-y',
] as const;

let currentImageUrl: string | null = null;
const listeners = new Set<() => void>();

/** Applies the style to `:root` (CSS vars read by index.css / BookCover) and the image store. */
export function applyCoverFallbackStyle(style: CoverFallbackStyle | null): void {
  const root = document.documentElement;
  if (!style) {
    for (const name of CSS_VARS) root.style.removeProperty(name);
  } else {
    root.style.setProperty('--inpx-cover-title-color', style.colorDark);
    root.style.setProperty('--inpx-cover-title-color-light', style.colorLight);
    root.style.setProperty('--inpx-cover-title-shadow', String(style.shadow));
    root.style.setProperty('--inpx-cover-title-scale', String(style.scale));
    root.style.setProperty('--inpx-cover-title-x', String(style.x));
    root.style.setProperty('--inpx-cover-title-y', String(style.y));
  }
  const nextUrl = style?.imageUrl ?? null;
  if (nextUrl !== currentImageUrl) {
    currentImageUrl = nextUrl;
    listeners.forEach((listener) => listener());
  }
}

/** The admin-uploaded placeholder image, if any (BookCover falls back to the bundled pair). */
export function useCustomCoverFallbackUrl(): string | null {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentImageUrl,
    () => null,
  );
}
