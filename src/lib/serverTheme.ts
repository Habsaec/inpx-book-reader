import type { ServerConfig } from '../types';
import { coverFallbackStyleFromUi, type CoverFallbackStyle } from './coverFallbackStyle';
import { APP_SETTING_KEYS, getAppSettingJson, setAppSettingJson } from './appSettings';
import { fetchServerBranding } from './inpxClient';
import { flattenColorMix } from './flattenColorMix';

/** Semantic palette aligned with server buildThemePalette → --app-* vars */
export interface AppThemePalette {
  bg: string;
  surface: string;
  surfaceHover: string;
  text: string;
  muted: string;
  accent: string;
  link: string;
  linkHover: string;
  accentHover: string;
  border: string;
  fieldBg: string;
  cardBg: string;
  cardBgHover: string;
  panelSoft: string;
  topbarBg: string;
  topbarBorder: string;
  coverBorder: string;
}

export interface ServerUiTheme {
  siteName: string;
  /** Placeholder cover from the server admin; absent in caches written before 1.8.1. */
  coverFallback?: CoverFallbackStyle | null;
  logoUrl: string | null;
  themeVersion: string;
  fontFamily: string;
  fontFamilyStack: string;
  fontSize: string;
  density: string;
  radiusPreset: string;
  radiusScale: number;
  radius: { sm: string; md: string; lg: string; xl: string; button: string; card: string } | null;
  shadowPreset: string;
  shadows: {
    dark: { sm: string; md: string; lg: string };
    light: { sm: string; md: string; lg: string };
  } | null;
  backgroundUrl: string | null;
  hasBackground: boolean;
  bgBlur: number;
  bgOverlayStrength: number;
  bgSize: string;
  bgPosition: string;
  overlayColorDark: string;
  overlayColorLight: string;
  surfaceOpacity: number;
  surfaceBlur: number;
  paletteDark: AppThemePalette | null;
  paletteLight: AppThemePalette | null;
  /** @deprecated raw glass fields */
  glassColorDark: string;
  glassColorLight: string;
  glassTextDark: string;
  glassTextLight: string;
}

const CACHE_KEY = APP_SETTING_KEYS.serverThemeCache;

const FONT_FAMILY_STACKS: Record<string, string> = {
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  serif: "'Lora', Georgia, 'Times New Roman', serif",
  georgia: "Georgia, 'Times New Roman', serif",
  merriweather: "'Merriweather', Georgia, 'Times New Roman', serif",
  rounded: "'Nunito', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace",
};

const RADIUS_FALLBACK: Record<string, { sm: string; md: string; lg: string; xl: string; button: string; card: string }> = {
  sharp: { sm: '2px', md: '4px', lg: '6px', xl: '8px', button: '4px', card: '2px' },
  rounded: { sm: '6px', md: '8px', lg: '12px', xl: '16px', button: '10px', card: '6px' },
  pill: { sm: '12px', md: '16px', lg: '22px', xl: '28px', button: '999px', card: '12px' },
};

function resolveFontStack(preset: string, customFontUrl?: string): string {
  if (preset === 'custom' && customFontUrl) {
    return "'INPX Custom', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }
  return FONT_FAMILY_STACKS[preset] || FONT_FAMILY_STACKS.inter;
}

function clampUiInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function paletteFromApi(raw: Record<string, unknown>, mode: 'dark' | 'light'): AppThemePalette | null {
  const key = mode === 'dark' ? 'appPaletteDark' : 'appPaletteLight';
  const p = raw[key];
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const req = (k: string, fallback = '') => String(o[k] ?? fallback);
  if (!req('surface') && !req('text')) return null;
  return {
    bg: req('bg', req('surface')),
    surface: req('surface'),
    surfaceHover: req('surfaceHover', req('surface')),
    text: req('text'),
    muted: req('muted', req('text')),
    accent: req('accent', req('link')),
    link: req('link'),
    linkHover: req('linkHover', req('link')),
    accentHover: req('accentHover', req('link')),
    border: req('border'),
    fieldBg: req('fieldBg'),
    cardBg: req('cardBg'),
    cardBgHover: req('cardBgHover', req('cardBg')),
    panelSoft: req('panelSoft'),
    topbarBg: req('topbarBg', req('surface')),
    topbarBorder: req('topbarBorder', req('border')),
    coverBorder: req('coverBorder', req('border')),
  };
}

function legacyPalette(
  surface: string,
  text: string,
  isDark: boolean,
): AppThemePalette {
  const link = isDark ? '#d4ac5c' : '#8b5a12';
  return {
    bg: surface,
    surface,
    surfaceHover: surface,
    text: text || (isDark ? '#e8e0d4' : '#2e2418'),
    muted: text || (isDark ? '#9a8e7e' : '#7a6a58'),
    accent: link,
    link,
    linkHover: isDark ? '#efc06f' : '#a86a0a',
    accentHover: '#a1671b',
    border: isDark ? 'rgba(145, 109, 43, 0.14)' : 'rgba(120, 90, 40, 0.14)',
    fieldBg: isDark ? 'rgba(180, 145, 80, 0.04)' : 'rgba(255, 255, 255, 0.72)',
    cardBg: isDark ? 'rgba(180, 145, 80, 0.025)' : 'rgba(255, 255, 255, 0.58)',
    cardBgHover: isDark ? 'rgba(180, 145, 80, 0.055)' : 'rgba(255, 255, 255, 0.78)',
    panelSoft: isDark ? 'rgba(180, 145, 80, 0.09)' : 'rgba(255, 255, 255, 0.52)',
    topbarBg: isDark ? 'rgba(24, 20, 16, 0.92)' : 'rgba(255, 253, 248, 0.92)',
    topbarBorder: isDark ? 'rgba(180, 145, 80, 0.12)' : 'rgba(120, 90, 40, 0.12)',
    coverBorder: isDark ? 'rgba(180, 145, 80, 0.1)' : 'rgba(120, 90, 40, 0.1)',
  };
}

function parseRadiusTokens(raw: Record<string, unknown>): ServerUiTheme['radius'] {
  const obj = raw.radius;
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    const sm = String(o.sm ?? '');
    const md = String(o.md ?? '');
    const lg = String(o.lg ?? '');
    if (sm && md && lg) {
      return {
        sm,
        md,
        lg,
        xl: String(o.xl ?? lg),
        button: String(o.button ?? md),
        card: String(o.card ?? sm),
      };
    }
  }
  const preset = String(raw.radiusPreset ?? '');
  if (preset === 'custom') {
    const base = Math.min(28, Math.max(0, Math.round(Number(raw.radiusScale) || 0)));
    const r = (mult: number) => `${Math.round(base * mult)}px`;
    return { sm: r(0.75), md: r(1), lg: r(1.5), xl: r(2), button: r(1.25), card: r(0.75) };
  }
  return RADIUS_FALLBACK[preset] ?? null;
}

function parseShadowPair(raw: unknown): { sm: string; md: string; lg: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const sm = String(o.sm ?? '');
  const md = String(o.md ?? '');
  const lg = String(o.lg ?? '');
  if (!sm && !md && !lg) return null;
  return { sm, md, lg };
}

function parseShadowTokens(raw: Record<string, unknown>): ServerUiTheme['shadows'] {
  const obj = raw.shadows;
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const dark = parseShadowPair(o.dark);
  const light = parseShadowPair(o.light);
  if (!dark && !light) return null;
  return {
    dark: dark ?? { sm: '', md: '', lg: '' },
    light: light ?? dark ?? { sm: '', md: '', lg: '' },
  };
}

function clampOverlay(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(80, Math.max(0, Math.round(n)));
}

export function parseServerUiTheme(raw: Record<string, unknown>, siteName: string, logoPath: string | null): ServerUiTheme {
  const fontFamily = String(raw.fontFamily ?? 'inter');
  const themeVersion = String(raw.themeVersion ?? '') || [
    raw.glassColorDark,
    raw.glassColorLight,
    raw.fontFamily,
    raw.fontSize,
    raw.density,
    raw.radiusPreset,
    raw.radiusScale,
    raw.shadowPreset,
    raw.backgroundUrl,
  ].join('|');

  let paletteDark = paletteFromApi(raw, 'dark');
  let paletteLight = paletteFromApi(raw, 'light');
  const glassDark = String(raw.glassColorDark ?? '');
  const glassLight = String(raw.glassColorLight ?? '');
  const textDark = String(raw.glassTextDark ?? '');
  const textLight = String(raw.glassTextLight ?? '');

  if (!paletteDark && glassDark) paletteDark = legacyPalette(glassDark, textDark, true);
  if (!paletteLight && glassLight) paletteLight = legacyPalette(glassLight, textLight, false);

  const backgroundUrl = String(raw.backgroundUrl ?? '').trim() || null;
  const overlayStrength = raw.bgOverlayStrength != null
    ? clampOverlay(raw.bgOverlayStrength)
    : clampOverlay(80 - Number(raw.bgOverlay ?? 80), 0);

  return {
    siteName,
    logoUrl: logoPath,
    themeVersion,
    fontFamily,
    fontFamilyStack: resolveFontStack(fontFamily, String(raw.customFontUrl ?? '')),
    fontSize: String(raw.fontSize ?? ''),
    density: String(raw.density ?? ''),
    radiusPreset: String(raw.radiusPreset ?? ''),
    radiusScale: Number(raw.radiusScale) || 0,
    radius: parseRadiusTokens(raw),
    shadowPreset: String(raw.shadowPreset ?? ''),
    shadows: parseShadowTokens(raw),
    backgroundUrl,
    hasBackground: raw.hasBackground === true || Boolean(backgroundUrl),
    bgBlur: Math.min(24, Math.max(0, Math.round(Number(raw.bgBlur) || 0))),
    bgOverlayStrength: overlayStrength,
    bgSize: String(raw.bgSize ?? 'cover') || 'cover',
    bgPosition: String(raw.bgPosition ?? 'center') || 'center',
    overlayColorDark: String(raw.overlayColorDark ?? ''),
    overlayColorLight: String(raw.overlayColorLight ?? ''),
    surfaceOpacity: clampUiInt(raw.surfaceOpacity, 0, 100, 88),
    surfaceBlur: clampUiInt(raw.surfaceBlur, 0, 24, 0),
    paletteDark,
    paletteLight,
    glassColorDark: glassDark,
    glassColorLight: glassLight,
    glassTextDark: textDark,
    glassTextLight: textLight,
  };
}

export type AppAppearance = 'light' | 'dark' | 'auto';
export type AppColorSource = 'app' | 'library' | 'system';

export function parseAppAppearance(raw: string | null | undefined): AppAppearance {
  if (raw === 'light' || raw === 'sepia') return 'light';
  if (raw === 'dark') return 'dark';
  return 'auto';
}

/** Legacy `server` was auto-persisted as the default, so it maps to the app palette. */
export function parseAppColorSource(rawColor: string | null | undefined): AppColorSource {
  if (rawColor === 'library' || rawColor === 'system') return rawColor;
  return 'app';
}

export function readCachedServerUiTheme(): ServerUiTheme | null {
  return getAppSettingJson<ServerUiTheme | null>(CACHE_KEY, null);
}

export async function fetchServerUiTheme(config: ServerConfig): Promise<ServerUiTheme | null> {
  if (config.connectionStatus !== 'connected' || !config.url) {
    return readCachedServerUiTheme();
  }
  try {
    const branding = await fetchServerBranding(config);
    const theme = parseServerUiTheme(branding.rawUi ?? {}, branding.siteName, branding.logoPath);
    theme.coverFallback = coverFallbackStyleFromUi(branding.rawUi ?? {}, config.url);
    setAppSettingJson(CACHE_KEY, theme);
    return theme;
  } catch {
    return readCachedServerUiTheme();
  }
}

export function resolveIsDark(appearance: AppAppearance): boolean {
  if (appearance === 'dark') return true;
  if (appearance === 'light') return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const ACCENT_CSS_KEYS = [
  '--app-accent',
  '--app-accent-hover',
  '--app-accent-soft',
  '--app-link',
  '--app-link-hover',
  '--app-button-bg',
  '--app-button-bg-hover',
  '--app-button-fg',
] as const;

/** Surfaces, type, radii and shadows are the app's own; a palette only lends its accent. */
export function applyAccentVars(palette: AppThemePalette, isDark: boolean): void {
  // Library primary buttons are filled with --link, not --accent.
  const accent = (palette.link || palette.accent || '').trim();
  if (!accent) return;
  const hover = (palette.linkHover || palette.accentHover || accent).trim();
  const soft = flattenColorMix(`color-mix(in srgb, ${accent} 16%, ${isDark ? '#111113' : '#ffffff'})`);
  const root = document.documentElement;
  root.style.setProperty('--app-accent', accent);
  root.style.setProperty('--app-accent-hover', hover);
  root.style.setProperty('--app-accent-soft', soft);
  root.style.setProperty('--app-link', accent);
  root.style.setProperty('--app-link-hover', hover);
  root.style.setProperty('--app-button-bg', accent);
  root.style.setProperty('--app-button-bg-hover', hover);
  root.style.setProperty('--app-button-fg', contrastingInk(accent, isDark));
}

export function clearAccentVars(): void {
  const root = document.documentElement;
  for (const key of ACCENT_CSS_KEYS) {
    root.style.removeProperty(key);
  }
}

function relativeLuminance(hex: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  const lin = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = lin((n >> 16) & 255);
  const g = lin((n >> 8) & 255);
  const b = lin(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Dark ink on a light fill, light ink on a dark fill. */
export function contrastingInk(fill: string, isDark: boolean): string {
  const lum = relativeLuminance(fill);
  if (lum == null) return isDark ? '#1a1612' : '#fffdf8';
  return lum >= 0.2 ? '#1a1612' : '#fffdf8';
}

export function applyAppThemeMode(isDark: boolean): void {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
}
