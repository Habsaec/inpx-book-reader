/** Estimate minutes left in book from elapsed reading time and current fraction (0–1). */
export function estimateRemainingBookMinutes(
  fraction: number,
  sessionStartedAtMs: number,
  nowMs = Date.now(),
): number | null {
  const f = Math.min(0.999, Math.max(0, fraction));
  if (f < 0.02 || f >= 0.995 || !sessionStartedAtMs) return null;
  const elapsedMs = nowMs - sessionStartedAtMs;
  if (elapsedMs < 30_000) return null;
  const totalMs = elapsedMs / f;
  const remainingMs = totalMs * (1 - f);
  return Math.max(1, Math.round(remainingMs / 60_000));
}
