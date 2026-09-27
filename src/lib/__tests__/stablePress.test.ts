import { describe, expect, it } from 'vitest';
import { shouldRescuePress } from '../stablePress';

describe('shouldRescuePress', () => {
  it('leaves a tap that stayed on the control to the native click', () => {
    expect(shouldRescuePress({ cancelled: false, movedPx: 1, stillOnControl: true })).toBe(false);
  });

  it('repeats a cancelled short tap whose press never became a click', () => {
    expect(shouldRescuePress({ cancelled: true, movedPx: 2, stillOnControl: true })).toBe(true);
  });

  it('repeats a short tap that slipped off the scaled control', () => {
    expect(shouldRescuePress({ cancelled: false, movedPx: 4, stillOnControl: false })).toBe(true);
  });

  it('does not turn a drag into a click', () => {
    expect(shouldRescuePress({ cancelled: true, movedPx: 24, stillOnControl: false })).toBe(false);
  });
});
