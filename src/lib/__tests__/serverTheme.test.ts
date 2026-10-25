// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parseServerUiTheme, resolveIsDark, parseAppAppearance, parseAppColorSource, applyAccentVars, clearAccentVars, contrastingInk, contrastRatio, ensureReadableOn, applyServerPaletteVars } from '../serverTheme';

describe('parseServerUiTheme', () => {
  it('maps appPalette from server API', () => {
    const theme = parseServerUiTheme(
      {
        themeVersion: 'v1',
        fontFamily: 'serif',
        fontSize: '15',
        appPaletteDark: {
          bg: '#111',
          surface: '#222',
          text: '#eee',
          accent: '#c46a63',
          link: '#gold',
        },
        appPaletteLight: {
          bg: '#fff',
          surface: '#fafafa',
          text: '#111',
          link: '#brown',
        },
      },
      'Test Lib',
      '/logo.png',
    );
    expect(theme.siteName).toBe('Test Lib');
    expect(theme.paletteDark?.accent).toBe('#c46a63');
    expect(theme.paletteDark?.link).toBe('#gold');
    expect(theme.paletteLight?.text).toBe('#111');
    expect(theme.fontFamilyStack).toContain('Lora');
  });

  it('maps radius, shadows and background chrome from server API', () => {
    const theme = parseServerUiTheme(
      {
        radiusPreset: 'pill',
        radius: { sm: '12px', md: '16px', lg: '22px', xl: '28px', button: '999px', card: '12px' },
        shadowPreset: 'subtle',
        shadows: {
          dark: { sm: '0 1px 2px #000', md: '0 2px 6px #000', lg: '0 6px 16px #000' },
          light: { sm: '0 1px 2px #fff', md: '0 2px 8px #fff', lg: '0 8px 20px #fff' },
        },
        backgroundUrl: '/custom/ui/background?v=1',
        hasBackground: true,
        bgBlur: 8,
        bgOverlayStrength: 40,
        bgSize: 'contain',
        overlayColorDark: '#111111',
        surfaceOpacity: 70,
        surfaceBlur: 12,
      },
      'Lib',
      null,
    );
    expect(theme.radius?.lg).toBe('22px');
    expect(theme.shadows?.dark.sm).toBe('0 1px 2px #000');
    expect(theme.hasBackground).toBe(true);
    expect(theme.bgBlur).toBe(8);
    expect(theme.bgOverlayStrength).toBe(40);
    expect(theme.surfaceOpacity).toBe(70);
    expect(theme.surfaceBlur).toBe(12);
    expect(theme.backgroundUrl).toContain('/custom/ui/background');
  });

  it('keeps panel opacity 0 from the server instead of falling back to 88', () => {
    const theme = parseServerUiTheme({ surfaceOpacity: 0, surfaceBlur: 0 }, 'Lib', null);
    expect(theme.surfaceOpacity).toBe(0);
    expect(theme.surfaceBlur).toBe(0);
  });

  it('defaults panel glass to server 88 / 0 when omitted', () => {
    const theme = parseServerUiTheme({}, 'Lib', null);
    expect(theme.surfaceOpacity).toBe(88);
    expect(theme.surfaceBlur).toBe(0);
  });

  it('falls back to legacy glass colors', () => {
    const theme = parseServerUiTheme(
      {
        glassColorDark: '#1e1a16',
        glassTextDark: '#e8e0d4',
        glassColorLight: '#f5f1e8',
        glassTextLight: '#2e2418',
        fontFamily: 'inter',
      },
      'Lib',
      null,
    );
    expect(theme.paletteDark?.surface).toBe('#1e1a16');
    expect(theme.paletteLight?.surface).toBe('#f5f1e8');
  });
});

describe('contrastingInk', () => {
  it('picks ink from the fill luminance, not from the theme mode', () => {
    expect(contrastingInk('#f5f1e8', true)).toBe('#1a1612');
    expect(contrastingInk('#1e1a16', false)).toBe('#fffdf8');
    expect(contrastingInk('#cfae8c', true)).toBe('#1a1612');
  });
});

describe('resolveIsDark', () => {
  it('resolves explicit modes without window', () => {
    expect(resolveIsDark('dark')).toBe(true);
    expect(resolveIsDark('light')).toBe(false);
  });
});

describe('parseAppAppearance', () => {
  it('maps legacy theme chips to day/night/auto', () => {
    expect(parseAppAppearance('light')).toBe('light');
    expect(parseAppAppearance('sepia')).toBe('light');
    expect(parseAppAppearance('dark')).toBe('dark');
    expect(parseAppAppearance('server')).toBe('auto');
    expect(parseAppAppearance('system')).toBe('auto');
    expect(parseAppAppearance('auto')).toBe('auto');
    expect(parseAppAppearance('')).toBe('auto');
  });
});

describe('parseAppColorSource', () => {
  it('keeps explicit library and system choices', () => {
    expect(parseAppColorSource('library')).toBe('library');
    expect(parseAppColorSource('system')).toBe('system');
  });

  it('defaults to the app palette, including the legacy auto-saved server value', () => {
    expect(parseAppColorSource('')).toBe('app');
    expect(parseAppColorSource(null)).toBe('app');
    expect(parseAppColorSource('server')).toBe('app');
  });
});

describe('applyAccentVars', () => {
  it('takes only the accent from a library palette, leaving surfaces to the app', () => {
    const theme = parseServerUiTheme(
      { appPaletteLight: { bg: '#f5f1e8', surface: '#fafafa', text: '#111111', link: '#2060c0' } },
      'Lib',
      null,
    );
    const style = document.documentElement.style;
    applyAccentVars(theme.paletteLight!, false);
    expect(style.getPropertyValue('--app-accent')).toBe('#2060c0');
    expect(style.getPropertyValue('--app-button-fg')).toBe('#fffdf8');
    expect(style.getPropertyValue('--app-accent-soft')).toMatch(/^rgb\(/);
    expect(style.getPropertyValue('--app-bg')).toBe('');
    expect(style.getPropertyValue('--app-surface')).toBe('');

    clearAccentVars();
    expect(style.getPropertyValue('--app-accent')).toBe('');
  });
});


describe('library accent readability', () => {
  it('keeps a readable accent and fixes a pale one on the app surface', () => {
    expect(ensureReadableOn('#000000', '#ffffff')).toBe('#000000');
    const fixed = ensureReadableOn('#d9a706', '#ffffff');
    expect(contrastRatio(fixed, '#ffffff')!).toBeGreaterThanOrEqual(4.5);
    const dark = ensureReadableOn('#3b3b80', '#111113');
    expect(contrastRatio(dark, '#111113')!).toBeGreaterThanOrEqual(4.5);
  });

  it('applyAccentVars uses the readable variant for links and buttons', () => {
    applyAccentVars({
      bg: '#fff9f0', surface: '#fff9f0', surfaceHover: '#fff9f0', text: '#1f1810', muted: '#6b5a48',
      accent: '#f5c542', link: '#f5c542', linkHover: '#f0b400', accentHover: '#f0b400', border: '', fieldBg: '',
      cardBg: '', cardBgHover: '', panelSoft: '', topbarBg: '', topbarBorder: '', coverBorder: '',
    }, false);
    const link = document.documentElement.style.getPropertyValue('--app-link');
    expect(contrastRatio(link, '#ffffff')!).toBeGreaterThanOrEqual(4.5);
    clearAccentVars();
  });
});

describe('«Цвет: Сервер» applies the whole library palette', () => {
  // Built-in web dark theme as /api/settings/ui sends it.
  const webDark = {
    bg: '#14110e', surface: '#1a1612', surfaceHover: '#241f19', text: '#f2ebe0', muted: '#a89884',
    accent: '#c4a35a', link: '#d4b06a', linkHover: '#e8c984', accentHover: '#d4b56e',
    border: 'rgba(196, 163, 90, 0.12)', fieldBg: 'rgba(196, 163, 90, 0.05)',
    cardBg: 'rgba(196, 163, 90, 0.03)', cardBgHover: 'rgba(196, 163, 90, 0.07)',
    panelSoft: 'rgba(196, 163, 90, 0.07)', topbarBg: 'rgba(18, 16, 13, 0.82)',
    topbarBorder: 'rgba(196, 163, 90, 0.10)', coverBorder: 'rgba(196, 163, 90, 0.12)',
  };
  const css = (key: string) => document.documentElement.style.getPropertyValue(key);

  it('sets page, surfaces, text, borders, links and accent from the server', () => {
    const bg = applyServerPaletteVars(webDark, true);
    expect(bg).toBe('#14110e');
    expect(css('--app-bg')).toBe('#14110e');
    expect(css('--app-surface')).toBe('#1a1612');
    expect(css('--app-text')).toBe('#f2ebe0');
    expect(css('--app-muted')).toBe('#a89884');
    expect(css('--app-link')).toBe('#d4b06a');
    // Translucent web tokens become solid colors over the page / surface.
    expect(css('--app-border')).toMatch(/^#[0-9a-f]{6}$/);
    expect(css('--app-border')).not.toBe('#1a1612');
    expect(css('--app-topbar-bg')).toMatch(/^#[0-9a-f]{6}$/);
    clearAccentVars();
    expect(css('--app-bg')).toBe('');
    expect(css('--app-link')).toBe('');
  });

  it('light server palette with color-mix borders resolves too', () => {
    applyServerPaletteVars({
      ...webDark, bg: '#f3ebe0', surface: '#fff9f0', surfaceHover: '#f5ebdc', text: '#1f1810', muted: '#6b5a48',
      link: '#7a5218', accent: '#8a6230', border: 'color-mix(in srgb, #1f1810 14%, transparent)',
      topbarBg: 'rgba(255, 249, 240, 0.78)',
    }, false);
    expect(css('--app-bg')).toBe('#f3ebe0');
    expect(css('--app-border')).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrastRatio(css('--app-link'), css('--app-surface'))!).toBeGreaterThanOrEqual(4.5);
    clearAccentVars();
  });

  it('ignores an unusable palette', () => {
    expect(applyServerPaletteVars({ ...webDark, surface: 'nonsense', bg: 'nonsense' }, true)).toBeNull();
    expect(css('--app-bg')).toBe('');
  });
});
