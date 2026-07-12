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

function resolveFontStack(preset: string, customFontUrl?: string): string {
  if (preset === 'custom' && customFontUrl) {
    return "'INPX Custom', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }
  return FONT_FAMILY_STACKS[preset] || FONT_FAMILY_STACKS.inter;
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

export function parseServerUiTheme(raw: Record<string, unknown>, siteName: string, logoPath: string | null): ServerUiTheme {
  const fontFamily = String(raw.fontFamily ?? 'inter');
  const themeVersion = String(raw.themeVersion ?? '') || [
    raw.glassColorDark,
    raw.glassColorLight,
    raw.fontFamily,
    raw.fontSize,
    raw.density,
    raw.radiusPreset,
  ].join('|');

  let paletteDark = paletteFromApi(raw, 'dark');
  let paletteLight = paletteFromApi(raw, 'light');
  const glassDark = String(raw.glassColorDark ?? '');
  const glassLight = String(raw.glassColorLight ?? '');
  const textDark = String(raw.glassTextDark ?? '');
  const textLight = String(raw.glassTextLight ?? '');

  if (!paletteDark && glassDark) paletteDark = legacyPalette(glassDark, textDark, true);
  if (!paletteLight && glassLight) paletteLight = legacyPalette(glassLight, textLight, false);

  return {
    siteName,
    logoUrl: logoPath,
    themeVersion,
    fontFamily,
    fontFamilyStack: resolveFontStack(fontFamily, String(raw.customFontUrl ?? '')),
    fontSize: String(raw.fontSize ?? ''),
    density: String(raw.density ?? ''),
    radiusPreset: String(raw.radiusPreset ?? ''),
    paletteDark,
    paletteLight,
    glassColorDark: glassDark,
    glassColorLight: glassLight,
    glassTextDark: textDark,
    glassTextLight: textLight,
  };
}

export type AppThemeMode = 'server' | 'system' | 'light' | 'dark' | 'sepia' | 'auto';

export async function fetchServerUiTheme(config: ServerConfig): Promise<ServerUiTheme | null> {
  if (config.connectionStatus !== 'connected' || !config.url) return null;
  try {
    const branding = await fetchServerBranding(config);
    const theme = parseServerUiTheme(branding.rawUi ?? {}, branding.siteName, branding.logoPath);
    setAppSettingJson(CACHE_KEY, theme);
    return theme;
  } catch {
    const cached = getAppSettingJson<ServerUiTheme | null>(CACHE_KEY, null);
    return cached;
  }
}

export function resolveIsDark(mode: AppThemeMode, serverTheme: ServerUiTheme | null): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light' || mode === 'sepia') return false;
  if (mode === 'system' || mode === 'server') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  if (mode === 'auto') {
    const hours = new Date().getHours();
    return hours >= 20 || hours < 7;
  }
  void serverTheme;
  return false;
}

function applyPalette(palette: AppThemePalette, fontStack: string, fontSize?: string, density?: string): void {
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
  if (fontSize) {
    const px = Number(fontSize);
    if (Number.isFinite(px) && px >= 12 && px <= 20) {
      root.style.fontSize = `${px}px`;
    }
  } else if (density) {
    applyDensityScale(density);
  }
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
  applyPalette(palette, theme.fontFamilyStack, theme.fontSize, theme.density);
}

function applyDensityScale(density: string, fontSize?: string): void {
  if (fontSize) return;
  const map: Record<string, string> = {
    compact: '14px',
    normal: '16px',
    comfortable: '18px',
  };
  const size = map[density];
  if (size) document.documentElement.style.fontSize = size;
}

export function applySepiaTheme(): void {
  const root = document.documentElement;
  root.dataset.theme = 'sepia';
  root.style.setProperty('--app-bg', '#f4ecd8');
  root.style.setProperty('--app-surface', '#faf6eb');
  root.style.setProperty('--app-text', '#5c4b37');
  root.style.setProperty('--app-muted', '#8a7968');
  root.style.setProperty('--app-link', '#8b5a12');
}

export function applyAppThemeMode(mode: AppThemeMode, isDark: boolean): void {
  const root = document.documentElement;
  if (mode === 'sepia') {
    applySepiaTheme();
    return;
  }
  if (mode !== 'server') {
    clearServerThemeVars();
  }
  root.dataset.theme = isDark ? 'dark' : 'light';
}
