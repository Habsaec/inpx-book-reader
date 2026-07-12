import { describe, it, expect } from 'vitest';
import { estimateRemainingBookMinutes } from '../readerEta';

describe('estimateRemainingBookMinutes', () => {
  const started = Date.UTC(2026, 6, 11, 12, 0, 0);

  it('returns null before enough reading time or at edges', () => {
    expect(estimateRemainingBookMinutes(0, started, started + 60_000)).toBeNull();
    expect(estimateRemainingBookMinutes(0.5, started, started + 10_000)).toBeNull();
    expect(estimateRemainingBookMinutes(0.999, started, started + 120_000)).toBeNull();
  });

  it('estimates remaining time from progress', () => {
    // 10 min elapsed at 50% → ~10 min left
    const remaining = estimateRemainingBookMinutes(0.5, started, started + 600_000);
    expect(remaining).toBe(10);
  });
});
