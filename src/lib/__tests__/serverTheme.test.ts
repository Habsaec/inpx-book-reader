import { describe, it, expect } from 'vitest';
import { parseServerUiTheme, resolveIsDark } from '../serverTheme';

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

describe('resolveIsDark', () => {
  it('resolves explicit modes without window', () => {
    expect(resolveIsDark('dark', null)).toBe(true);
    expect(resolveIsDark('light', null)).toBe(false);
    expect(resolveIsDark('sepia', null)).toBe(false);
  });
});
