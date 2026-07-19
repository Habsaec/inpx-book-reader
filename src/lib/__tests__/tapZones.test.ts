import { describe, expect, it } from 'vitest';
import {
  defaultTapZonesLong,
  defaultTapZonesShort,
  normalizeTapZones,
  resolveTapZone9,
} from '../../../public/inpx-reader/tap-zones.js';

describe('resolveTapZone9', () => {
  it('maps corners and center', () => {
    expect(resolveTapZone9(0.05, 0.05)).toBe('tl');
    expect(resolveTapZone9(0.5, 0.5)).toBe('mm');
    expect(resolveTapZone9(0.95, 0.95)).toBe('br');
    expect(resolveTapZone9(0.5, 0.1)).toBe('tm');
    expect(resolveTapZone9(0.1, 0.5)).toBe('ml');
  });

  it('swaps axes for vertical writing', () => {
    expect(resolveTapZone9(0.05, 0.95, { verticalWriting: true })).toBe('tr');
    expect(resolveTapZone9(0.95, 0.05, { verticalWriting: true })).toBe('bl');
  });
});

describe('normalizeTapZones', () => {
  it('fills missing keys and drops invalid actions', () => {
    const n = normalizeTapZones({ mm: 'toc', tl: 'nope' }, defaultTapZonesShort());
    expect(n.mm).toBe('toc');
    expect(n.tl).toBe('prevPage');
    expect(n.tr).toBe('nextPage');
  });

  it('keeps long defaults when raw empty', () => {
    expect(normalizeTapZones(null, defaultTapZonesLong()).bm).toBe('goto');
  });
});
