import { describe, it, expect } from 'vitest';
import { detectPositionConflict } from '../syncConflicts';
import type { PositionMergeInput } from '../syncMerge';

function baseInput(overrides: Partial<PositionMergeInput> = {}): PositionMergeInput {
  return {
    skipPosition: false,
    localFraction: 0.4,
    localPositionRev: '2026-07-11T12:00:00.000Z',
    localHasPaginator: false,
    serverFraction: 0.6,
    serverProgress: 60,
    serverPosition: 'x',
    serverPosUpdatedAt: '2026-07-11T12:01:00.000Z',
    localServerPositionUpdatedAt: null,
    localServerPositionProgress: 0,
    ...overrides,
  };
}

describe('syncConflicts', () => {
  it('detects position conflict when both sides diverged recently', () => {
    expect(detectPositionConflict(baseInput())).toBe(true);
  });

  it('ignores conflict when fractions are close', () => {
    expect(detectPositionConflict(baseInput({ serverFraction: 0.41, serverProgress: 41 }))).toBe(false);
  });
});
