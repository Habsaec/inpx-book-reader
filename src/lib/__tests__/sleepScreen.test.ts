import { describe, expect, it } from 'vitest';
import { normalizeSleepScreenSettings, sleepScreenKey } from '../sleepScreen';

describe('sleepScreen', () => {
  it('is off by default and keeps only known values', () => {
    expect(normalizeSleepScreenSettings(null)).toEqual({
      enabled: false,
      layout: 'card',
      theme: 'light',
      clockSpace: true,
      showProgress: true,
    });
    expect(normalizeSleepScreenSettings({ enabled: true, layout: 'cover', theme: 'dark', clockSpace: false, showProgress: 'x' }))
      .toEqual({ enabled: true, layout: 'cover', theme: 'dark', clockSpace: false, showProgress: true });
    expect(normalizeSleepScreenSettings({ layout: 'weird', theme: 'blue' })).toMatchObject({ layout: 'card', theme: 'light' });
  });

  it('redraws only when the whole percent, the book, the cover or the settings change', () => {
    const settings = normalizeSleepScreenSettings({ enabled: true });
    const book = { id: 'b1', title: 'T', author: 'A', progress: 37.2 };
    const key = sleepScreenKey(book, settings, '/c.jpg');
    expect(sleepScreenKey({ ...book, progress: 37.9 }, settings, '/c.jpg')).toBe(key);
    expect(sleepScreenKey({ ...book, progress: 38.1 }, settings, '/c.jpg')).not.toBe(key);
    expect(sleepScreenKey(book, settings, '/full.jpg')).not.toBe(key);
    expect(sleepScreenKey(book, { ...settings, theme: 'dark' }, '/c.jpg')).not.toBe(key);
    // Progress hidden: page turns never redraw.
    const noProgress = { ...settings, showProgress: false };
    expect(sleepScreenKey({ ...book, progress: 90 }, noProgress, '/c.jpg')).toBe(sleepScreenKey(book, noProgress, '/c.jpg'));
  });
});
