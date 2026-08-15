import { describe, it, expect } from 'vitest';
import { parseServerUiTheme, resolveIsDark, androidRadiusFromServer, parseAppAppearance, parseAppColorSource } from '../serverTheme';

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

describe('androidRadiusFromServer', () => {
  it('maps pill to capsule buttons (999px) and rounder cards', () => {
    const mapped = androidRadiusFromServer(
      { sm: '12px', md: '16px', lg: '22px', xl: '28px', button: '999px', card: '12px' },
      'pill',
    );
    expect(mapped.button).toBe('999px');
    expect(mapped.lg).toBe('22px');
  });

  it('maps sharp to a compact Android scale', () => {
    const mapped = androidRadiusFromServer(
      { sm: '2px', md: '4px', lg: '6px', xl: '8px', button: '4px', card: '2px' },
      'sharp',
    );
    expect(mapped.lg).toBe('0.5rem');
    expect(mapped.button).toBe('0.25rem');
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
  it('prefers saved color source over legacy theme', () => {
    expect(parseAppColorSource('system', 'server')).toBe('system');
    expect(parseAppColorSource('server', 'light')).toBe('server');
  });

  it('defaults empty install to server colors and maps local themes to system', () => {
    expect(parseAppColorSource('', '')).toBe('server');
    expect(parseAppColorSource(null, 'server')).toBe('server');
    expect(parseAppColorSource(null, 'light')).toBe('system');
    expect(parseAppColorSource(null, 'dark')).toBe('system');
  });
});
