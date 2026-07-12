import { describe, it, expect } from 'vitest';
import { fnv1a32Hex } from '../fileDigest';
import {
  isServerCollectionNewer,
  shouldUseServerPosition,
  shouldPushLocalPosition,
  normalizeReadingFraction,
  fractionToProgress,
} from '../syncMerge';

describe('fileDigest', () => {
  it('computes stable fnv1a digest', () => {
    const buf = new TextEncoder().encode('hello').buffer;
    expect(fnv1a32Hex(buf)).toBe(fnv1a32Hex(buf));
    expect(fnv1a32Hex(buf)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('syncMerge', () => {
  it('detects newer server bookmark revision', () => {
    expect(
      isServerCollectionNewer('2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 2, 2),
    ).toBe(true);
    expect(
      isServerCollectionNewer('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 2, 2),
    ).toBe(false);
  });

  it('pulls a non-empty server collection on first sync without revision metadata', () => {
    expect(
      isServerCollectionNewer('1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z', 2, -1),
    ).toBe(true);
    expect(
      isServerCollectionNewer('1970-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 2, -1),
    ).toBe(false);
  });

  it('prefers further reading progress on server', () => {
    const input = {
      skipPosition: false,
      localFraction: 0.2,
      localPositionRev: '2026-01-01T00:00:00.000Z',
      localHasPaginator: false,
      serverFraction: 0.45,
      serverProgress: 45,
      serverPosition: 'epubcfi(/6/4!)',
      serverPosUpdatedAt: '2026-01-02T00:00:00.000Z',
      localServerPositionUpdatedAt: '2026-01-01T00:00:00.000Z',
      localServerPositionProgress: 20,
    };
    expect(shouldUseServerPosition(input)).toBe(true);
    expect(shouldPushLocalPosition(input, 20, true)).toBe(false);
  });

  it('pushes local position when ahead of server', () => {
    const input = {
      skipPosition: false,
      localFraction: 0.6,
      localPositionRev: '2026-01-03T00:00:00.000Z',
      localHasPaginator: true,
      serverFraction: 0.2,
      serverProgress: 20,
      serverPosition: '',
      serverPosUpdatedAt: '2026-01-01T00:00:00.000Z',
      localServerPositionUpdatedAt: '2026-01-01T00:00:00.000Z',
      localServerPositionProgress: 20,
    };
    expect(shouldUseServerPosition(input)).toBe(false);
    expect(shouldPushLocalPosition(input, 60, true)).toBe(true);
  });

  it('uses newer server position at same fraction including paginator', () => {
    const input = {
      skipPosition: false,
      localFraction: 0.42,
      localPositionRev: '2026-01-01T00:00:00.000Z',
      localHasPaginator: true,
      serverFraction: 0.42,
      serverProgress: 42,
      serverPosition: 'app:ch2:p15',
      serverPosUpdatedAt: '2026-01-03T00:00:00.000Z',
      localServerPositionUpdatedAt: '2026-01-02T00:00:00.000Z',
      localServerPositionProgress: 42,
    };
    expect(shouldUseServerPosition(input)).toBe(true);
    expect(shouldPushLocalPosition(input, 42, true)).toBe(false);
  });

  it('pushes local paginator update when fraction matches but local is newer', () => {
    const input = {
      skipPosition: false,
      localFraction: 0.42,
      localPositionRev: '2026-01-04T00:00:00.000Z',
      localHasPaginator: true,
      serverFraction: 0.42,
      serverProgress: 42,
      serverPosition: 'app:ch2:p14',
      serverPosUpdatedAt: '2026-01-03T00:00:00.000Z',
      localServerPositionUpdatedAt: '2026-01-03T00:00:00.000Z',
      localServerPositionProgress: 42,
    };
    expect(shouldUseServerPosition(input)).toBe(false);
    expect(shouldPushLocalPosition(input, 42, true)).toBe(true);
  });

  it('prefers newer server edit from another device even when local fraction is higher', () => {
    const input = {
      skipPosition: false,
      localFraction: 0.9,
      localPositionRev: '2026-07-11T10:00:00.000Z',
      localHasPaginator: false,
      serverFraction: 0.85,
      serverProgress: 85,
      serverPosition: '',
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-11T08:00:00.000Z',
      localServerPositionProgress: 62,
    };
    expect(shouldUseServerPosition(input)).toBe(true);
    expect(shouldPushLocalPosition(input, 90, true)).toBe(false);
  });

  it('normalizes fraction precision', () => {
    expect(normalizeReadingFraction(0.123456789)).toBe(0.123457);
    expect(fractionToProgress(0.5)).toBe(50);
  });
});
