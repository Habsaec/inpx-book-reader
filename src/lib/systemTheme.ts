/**
 * Цветовая тема «Система»: динамическая палитра Material You (Android 12+)
 * через нативный плагин SystemTheme. Ниже API 31 и в браузере — null,
 * приложение остаётся на встроенной палитре из index.css.
 */
import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './platform';
import type { AppThemePalette } from './serverTheme';

interface SystemThemeNative {
  getDynamicPalette(): Promise<{ supported: boolean; colors?: Record<string, string> }>;
}

const SystemTheme = registerPlugin<SystemThemeNative>('SystemTheme');

export interface SystemPalettes {
  dark: AppThemePalette;
  light: AppThemePalette;
}

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (!Number.isFinite(n)) return hex;
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Суффикс ресурса ↔ тон Material: neutral1_900 ≈ тон 10 (тёмный),
 * neutral1_10 ≈ тон 99 (почти белый). Маппинг близок к Material 3 dark/light scheme.
 */
export function buildSystemPalettes(c: Record<string, string>): SystemPalettes {
  const dark: AppThemePalette = {
    bg: c.neutral1_900,
    surface: c.neutral1_900,
    surfaceHover: c.neutral1_800,
    text: c.neutral1_100,
    muted: c.neutral2_200,
    link: c.accent1_200,
    linkHover: c.accent1_100,
    accentHover: c.accent1_300,
    border: rgba(c.neutral2_400, 0.28),
    fieldBg: rgba(c.accent1_200, 0.06),
    cardBg: rgba(c.accent1_200, 0.04),
    cardBgHover: rgba(c.accent1_200, 0.08),
    panelSoft: rgba(c.accent1_200, 0.1),
    topbarBg: rgba(c.neutral1_900, 0.92),
    topbarBorder: rgba(c.accent1_200, 0.14),
    coverBorder: rgba(c.accent1_200, 0.1),
  };
  const light: AppThemePalette = {
    bg: c.neutral1_50,
    surface: c.neutral1_10,
    surfaceHover: c.neutral1_100,
    text: c.neutral1_900,
    muted: c.neutral2_700,
    link: c.accent1_600,
    linkHover: c.accent1_700,
    accentHover: c.accent1_700,
    border: rgba(c.neutral2_500, 0.2),
    fieldBg: rgba(c.neutral1_10, 0.92),
    cardBg: rgba(c.neutral1_10, 0.5),
    cardBgHover: rgba(c.neutral1_10, 0.75),
    panelSoft: rgba(c.neutral1_10, 0.62),
    topbarBg: rgba(c.neutral1_50, 0.88),
    topbarBorder: rgba(c.neutral2_500, 0.12),
    coverBorder: rgba(c.neutral2_500, 0.12),
  };
  return { dark, light };
}

export async function fetchSystemPalettes(): Promise<SystemPalettes | null> {
  if (!isNativeApp()) return null;
  try {
    const res = await SystemTheme.getDynamicPalette();
    if (!res.supported || !res.colors) return null;
    return buildSystemPalettes(res.colors);
  } catch {
    return null;
  }
}
