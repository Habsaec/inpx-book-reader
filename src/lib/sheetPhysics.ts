/** Apple's exponential-decay projection (Designing Fluid Interfaces). */
export function project(velocityPxPerSec: number, decelerationRate = 0.998): number {
  return (velocityPxPerSec / 1000) * decelerationRate / (1 - decelerationRate);
}

/** Progressive resistance past an edge. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  const limit = Math.max(1, dimension);
  return (overshoot * limit * constant) / (limit + constant * Math.abs(overshoot));
}

const VELOCITY_DEADZONE = 50;

/**
 * Open is 0, closed is `closedY`.
 * A clear velocity sign commits; a resting finger uses the projected point.
 */
export function sheetTarget(current: number, velocity: number, closedY: number): number {
  if (velocity > VELOCITY_DEADZONE) return closedY;
  if (velocity < -VELOCITY_DEADZONE) return 0;
  const projected = current + project(velocity);
  const toOpen = Math.abs(projected);
  const toClosed = Math.abs(projected - closedY);
  return toClosed < toOpen ? closedY : 0;
}

export function releaseVelocity(samples: ReadonlyArray<{ y: number; t: number }>): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const prev = samples[Math.max(0, samples.length - 4)];
  const dt = last.t - prev.t;
  if (dt <= 0) return 0;
  return ((last.y - prev.y) / dt) * 1000;
}
