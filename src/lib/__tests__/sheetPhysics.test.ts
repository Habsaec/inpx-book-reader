import { describe, expect, it } from 'vitest';
import { project, releaseVelocity, rubberband, sheetTarget } from '../sheetPhysics';

describe('sheetPhysics', () => {
  it('projects momentum with exponential decay', () => {
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(project(0)).toBe(0);
  });

  it('rubber-bands less than the raw overshoot', () => {
    const band = rubberband(100, 400);
    expect(band).toBeGreaterThan(0);
    expect(band).toBeLessThan(100);
  });

  it('uses velocity sign to dismiss or restore', () => {
    expect(sheetTarget(20, 400, 600)).toBe(600);
    expect(sheetTarget(500, -400, 600)).toBe(0);
  });

  it('snaps a resting finger to the nearest projected point', () => {
    expect(sheetTarget(400, 0, 600)).toBe(600);
    expect(sheetTarget(120, 0, 600)).toBe(0);
  });

  it('reads release velocity from the recent samples', () => {
    expect(releaseVelocity([
      { y: 0, t: 0 },
      { y: 40, t: 40 },
    ])).toBeCloseTo(1000, 0);
  });
});
