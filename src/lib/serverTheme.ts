import type { ServerConfig } from '../types';
import { APP_SETTING_KEYS, getAppSettingJson, setAppSettingJson } from './appSettings';
import { fetchServerBranding } from './inpxClient';

/** Semantic palette aligned with server buildThemePalette → --app-* vars */
export interface AppThemePalette {
  bg: string;
  surface: string;
  surfaceHover: string;
  text: string;
  muted: string;
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

const APP_CSS_KEYS = [
  '--app-bg',
  '--app-surface',
  '--app-surface-hover',
  '--app-text',
  '--app-muted',
  '--app-link',
  '--app-link-hover',
  '--app-accent-hover',
  '--app-border',
  '--app-field-bg',
  '--app-card-bg',
  '--app-card-bg-hover',
  '--app-panel-soft',
  '--app-topbar-bg',
  '--app-topbar-border',
  '--app-cover-border',
  '--font-sans',
] as const;

const CHROME_CSS_KEYS = [
  '--app-radius-sm',
  '--app-radius-md',
  '--app-radius-lg',
  '--app-radius-button',
  '--app-shadow-sm',
  '--app-shadow-md',
  '--app-shadow-lg',
  '--app-bg-image',
  '--app-bg-blur',
  '--app-bg-overlay',
  '--app-bg-overlay-color',
  '--app-bg-size',
  '--app-bg-repeat',
  '--app-bg-position',
  '--app-bg-transform',
  '--app-surface-opacity',
  '--app-surface-blur',
] as const;

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
export type AppColorSource = 'server' | 'system';

export function parseAppAppearance(raw: string | null | undefined): AppAppearance {
  if (raw === 'light' || raw === 'sepia') return 'light';
  if (raw === 'dark') return 'dark';
  return 'auto';
}

export function parseAppColorSource(
  rawColor: string | null | undefined,
  legacyTheme?: string | null,
): AppColorSource {
  if (rawColor === 'server' || rawColor === 'system') return rawColor;
  if (!legacyTheme || legacyTheme === 'server') return 'server';
  return 'system';
}

export async function fetchServerUiTheme(config: ServerConfig): Promise<ServerUiTheme | null> {
  if (config.connectionStatus !== 'connected' || !config.url) {
    return getAppSettingJson<ServerUiTheme | null>(CACHE_KEY, null);
  }
  try {
    const branding = await fetchServerBranding(config);
    const theme = parseServerUiTheme(branding.rawUi ?? {}, branding.siteName, branding.logoPath);
    setAppSettingJson(CACHE_KEY, theme);
    return theme;
  } catch {
    return getAppSettingJson<ServerUiTheme | null>(CACHE_KEY, null);
  }
}

export function resolveIsDark(appearance: AppAppearance): boolean {
  if (appearance === 'dark') return true;
  if (appearance === 'light') return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyPalette(palette: AppThemePalette, fontStack: string): void {
  const root = document.documentElement;
  root.style.setProperty('--app-bg', palette.bg);
  root.style.setProperty('--app-surface', palette.surface);
  root.style.setProperty('--app-surface-hover', palette.surfaceHover);
  root.style.setProperty('--app-text', palette.text);
  root.style.setProperty('--app-muted', palette.muted);
  root.style.setProperty('--app-link', palette.link);
  root.style.setProperty('--app-link-hover', palette.linkHover);
  root.style.setProperty('--app-accent-hover', palette.accentHover);
  root.style.setProperty('--app-border', palette.border);
  root.style.setProperty('--app-field-bg', palette.fieldBg);
  root.style.setProperty('--app-card-bg', palette.cardBg);
  root.style.setProperty('--app-card-bg-hover', palette.cardBgHover);
  root.style.setProperty('--app-panel-soft', palette.panelSoft);
  root.style.setProperty('--app-topbar-bg', palette.topbarBg);
  root.style.setProperty('--app-topbar-border', palette.topbarBorder);
  root.style.setProperty('--app-cover-border', palette.coverBorder);
  root.style.setProperty('--font-sans', fontStack);
}

export function clearServerThemeVars(): void {
  const root = document.documentElement;
  for (const key of APP_CSS_KEYS) {
    root.style.removeProperty(key);
  }
  root.style.removeProperty('font-size');
}

export function applyServerThemeVars(theme: ServerUiTheme | null, isDark: boolean): void {
  if (!theme) return;
  const palette = isDark ? theme.paletteDark : theme.paletteLight;
  if (!palette) return;
  applyPalette(palette, theme.fontFamilyStack);
}

export function clearServerChromeVars(): void {
  const root = document.documentElement;
  for (const key of CHROME_CSS_KEYS) {
    root.style.removeProperty(key);
  }
  delete root.dataset.uiBg;
  delete root.dataset.uiGlass;
}

function backgroundLayout(size: string, position: string): { size: string; repeat: string; position: string } {
  const pos = ['center', 'top', 'bottom', 'left', 'right'].includes(position) ? position : 'center';
  if (size === 'tile') {
    return { size: 'auto', repeat: 'repeat', position: pos };
  }
  return { size: 'cover', repeat: 'no-repeat', position: pos };
}

function parseRadiusPx(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 8;
}

/**
 * Server tokens (card 6px / button 999px) don't map 1:1 onto Android controls.
 * Keep a single sm < md < lg scale so tabs, cards and nav stay the same family.
 */
export function androidRadiusFromServer(
  radius: NonNullable<ServerUiTheme['radius']>,
  preset: string,
): { sm: string; md: string; lg: string; button: string } {
  const button = radius.button.trim();
  if (preset === 'pill' || button === '999px' || button === '9999px') {
    return { sm: '12px', md: '16px', lg: '22px', button: '999px' };
  }
  if (preset === 'sharp' || parseRadiusPx(radius.md) <= 4) {
    return { sm: '0.25rem', md: '0.375rem', lg: '0.5rem', button: '0.25rem' };
  }
  return { sm: '0.5rem', md: '0.75rem', lg: '1rem', button: '0.75rem' };
}

/** Radius, shadows, background — library chrome, independent of local color theme. */
export function applyServerChromeVars(
  theme: ServerUiTheme | null,
  isDark: boolean,
  backgroundBlobUrl?: string | null,
  allowBackground = true,
): void {
  const root = document.documentElement;
  if (!theme) {
    clearServerChromeVars();
    return;
  }

  if (theme.radius) {
    const mapped = androidRadiusFromServer(theme.radius, theme.radiusPreset);
    root.style.setProperty('--app-radius-sm', mapped.sm);
    root.style.setProperty('--app-radius-md', mapped.md);
    root.style.setProperty('--app-radius-lg', mapped.lg);
    root.style.setProperty('--app-radius-button', mapped.button);
  }

  const shadows = isDark ? theme.shadows?.dark : theme.shadows?.light;
  if (shadows) {
    if (shadows.sm) root.style.setProperty('--app-shadow-sm', shadows.sm);
    if (shadows.md) root.style.setProperty('--app-shadow-md', shadows.md);
    if (shadows.lg) root.style.setProperty('--app-shadow-lg', shadows.lg);
  }

  const imageUrl = backgroundBlobUrl || '';
  const showBackground = allowBackground && theme.hasBackground && Boolean(imageUrl);
  if (showBackground) {
    const layout = backgroundLayout(theme.bgSize, theme.bgPosition);
    const overlayColor = isDark
      ? (theme.overlayColorDark || theme.paletteDark?.bg || '#1a1612')
      : (theme.overlayColorLight || theme.paletteLight?.bg || '#fffdf8');
    root.dataset.uiBg = '1';
    root.style.setProperty('--app-bg-image', `url("${imageUrl}")`);
    root.style.setProperty('--app-bg-blur', `${theme.bgBlur}px`);
    root.style.setProperty('--app-bg-overlay', String(theme.bgOverlayStrength));
    root.style.setProperty('--app-bg-overlay-color', overlayColor);
    root.style.setProperty('--app-bg-size', layout.size);
    root.style.setProperty('--app-bg-repeat', layout.repeat);
    root.style.setProperty('--app-bg-position', layout.position);
  } else {
    delete root.dataset.uiBg;
    root.style.removeProperty('--app-bg-image');
    root.style.removeProperty('--app-bg-blur');
    root.style.removeProperty('--app-bg-overlay');
    root.style.removeProperty('--app-bg-overlay-color');
    root.style.removeProperty('--app-bg-size');
    root.style.removeProperty('--app-bg-repeat');
    root.style.removeProperty('--app-bg-position');
    root.style.removeProperty('--app-bg-transform');
  }

  const useGlass = showBackground || theme.surfaceBlur > 0 || theme.surfaceOpacity !== 88;
  if (useGlass) {
    root.dataset.uiGlass = '1';
    const fill = `color-mix(in srgb, var(--app-surface) ${theme.surfaceOpacity}%, transparent)`;
    const fillHover = `color-mix(in srgb, var(--app-surface-hover) ${theme.surfaceOpacity}%, transparent)`;
    root.style.setProperty('--app-surface-opacity', String(theme.surfaceOpacity));
    root.style.setProperty('--app-surface-blur', `${theme.surfaceBlur}px`);
    root.style.setProperty('--app-topbar-bg', fill);
    root.style.setProperty('--app-card-bg', fill);
    root.style.setProperty('--app-card-bg-hover', fillHover);
    root.style.setProperty('--app-panel-soft', fill);
    root.style.setProperty('--app-field-bg', fill);
  } else {
    delete root.dataset.uiGlass;
    root.style.removeProperty('--app-surface-opacity');
    root.style.removeProperty('--app-surface-blur');
  }
}

export function applyAppThemeMode(isDark: boolean): void {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
}
