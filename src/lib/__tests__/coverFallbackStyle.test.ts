import { describe, expect, it } from 'vitest';
import { coverFallbackStyleFromUi } from '../coverFallbackStyle';

const SERVER = 'http://192.168.1.30:3000';

describe('coverFallbackStyleFromUi', () => {
  it('keeps the app defaults when the server has nothing custom', () => {
    expect(coverFallbackStyleFromUi({ hasCustomCoverFallback: false, coverTitleColor: '#ff0000' }, SERVER)).toBeNull();
  });

  it('takes the uploaded image as an absolute URL and its title colour for both themes', () => {
    const style = coverFallbackStyleFromUi({
      hasCustomCoverFallback: true,
      coverFallbackUrl: '/ui/cover-fallback.png?v=abc',
      coverTitleColor: '#112233',
      coverTitleColorSet: true,
      coverTitleShadow: 40,
      coverTitleSize: 120,
      coverTitleX: 3,
      coverTitleY: -2,
    }, SERVER);
    expect(style).toEqual({
      imageUrl: 'http://192.168.1.30:3000/ui/cover-fallback.png?v=abc',
      colorDark: '#112233',
      colorLight: '#112233',
      shadow: 40,
      scale: 1.2,
      x: 3,
      y: -2,
    });
  });

  it('uses theme ink on the bundled covers when only the title position is set', () => {
    const style = coverFallbackStyleFromUi({ hasCustomCoverFallback: true, coverTitleY: 4 }, SERVER);
    expect(style?.imageUrl).toBeNull();
    expect(style?.colorDark).toBe('#f6f1e6');
    expect(style?.colorLight).toBe('#2a2014');
    expect(style?.y).toBe(4);
  });

  it('clamps out-of-range values like the server', () => {
    const style = coverFallbackStyleFromUi({
      hasCustomCoverFallback: true,
      coverTitleSize: 500,
      coverTitleX: -99,
      coverTitleShadow: 'x',
      coverTitleColor: 'red',
    }, SERVER);
    expect(style?.scale).toBe(1.6);
    expect(style?.x).toBe(-24);
    expect(style?.shadow).toBe(0);
    expect(style?.colorDark).toBe('#f6f1e6');
  });
});
