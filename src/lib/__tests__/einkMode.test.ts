import { describe, it, expect } from 'vitest';
import {
  detectEinkDevice,
  parseEinkModePref,
  resolveEinkActive,
} from '../einkMode';

describe('parseEinkModePref', () => {
  it('accepts auto/on/off', () => {
    expect(parseEinkModePref('auto')).toBe('auto');
    expect(parseEinkModePref('on')).toBe('on');
    expect(parseEinkModePref('off')).toBe('off');
  });

  it('defaults unknown values to auto', () => {
    expect(parseEinkModePref('')).toBe('auto');
    expect(parseEinkModePref('maybe')).toBe('auto');
    expect(parseEinkModePref(undefined)).toBe('auto');
  });
});

describe('detectEinkDevice', () => {
  it('detects Onyx / BOOX', () => {
    expect(detectEinkDevice({ manufacturer: 'ONYX', brand: 'Onyx', model: 'Boox Palma' })).toBe(true);
    expect(detectEinkDevice({ manufacturer: 'Onyx', brand: 'boox', model: 'Page' })).toBe(true);
  });

  it('detects PocketBook / Bigme / Meebook', () => {
    expect(detectEinkDevice({ manufacturer: 'PocketBook', brand: 'PocketBook', model: 'InkPad' })).toBe(true);
    expect(detectEinkDevice({ manufacturer: 'Bigme', brand: 'Bigme', model: 'B751' })).toBe(true);
    expect(detectEinkDevice({ manufacturer: 'Meebook', brand: 'Meebook', model: 'P78' })).toBe(true);
  });

  it('detects Hisense A-series e-ink phones', () => {
    expect(detectEinkDevice({ manufacturer: 'Hisense', brand: 'Hisense', model: 'A9' })).toBe(true);
    expect(detectEinkDevice({ manufacturer: 'Hisense', brand: 'Hisense', model: 'A7 CC' })).toBe(true);
  });

  it('does not false-positive common phones', () => {
    expect(detectEinkDevice({ manufacturer: 'Samsung', brand: 'samsung', model: 'SM-S911B' })).toBe(false);
    expect(detectEinkDevice({ manufacturer: 'Google', brand: 'google', model: 'Pixel 8' })).toBe(false);
    expect(detectEinkDevice({ manufacturer: 'Xiaomi', brand: 'Redmi', model: 'Note 13' })).toBe(false);
    expect(detectEinkDevice({ manufacturer: 'Hisense', brand: 'Hisense', model: 'HLTE300E' })).toBe(false);
  });

  it('handles empty device', () => {
    expect(detectEinkDevice(null)).toBe(false);
    expect(detectEinkDevice({})).toBe(false);
  });
});

describe('resolveEinkActive', () => {
  const onyx = { manufacturer: 'ONYX', brand: 'Onyx', model: 'Boox' };
  const pixel = { manufacturer: 'Google', brand: 'google', model: 'Pixel 8' };

  it('on always active', () => {
    expect(resolveEinkActive('on', pixel)).toBe(true);
    expect(resolveEinkActive('on', null)).toBe(true);
  });

  it('off always inactive', () => {
    expect(resolveEinkActive('off', onyx)).toBe(false);
  });

  it('auto follows detection', () => {
    expect(resolveEinkActive('auto', onyx)).toBe(true);
    expect(resolveEinkActive('auto', pixel)).toBe(false);
  });
});
