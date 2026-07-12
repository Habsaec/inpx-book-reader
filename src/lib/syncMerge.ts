import { parseSyncTs } from './readerActivitySync';

export const SYNC_EPOCH = '1970-01-01T00:00:00.000Z';
export const READING_POSITION_SCALE = 1e6;
export const PROGRESS_PERCENT_SCALE = 1e4;

export function normalizeReadingFraction(fraction: number): number {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  return Math.round(f * READING_POSITION_SCALE) / READING_POSITION_SCALE;
}

export function fractionToProgress(fraction: number): number {
  return Math.round(normalizeReadingFraction(fraction) * 100 * PROGRESS_PERCENT_SCALE) / PROGRESS_PERCENT_SCALE;
}

export function progressToFraction(progress: number): number {
  return normalizeReadingFraction(Number(progress) / 100);
}

export function isServerCollectionNewer(
  serverRev: string,
  localRev: string,
  serverCount: number,
  prevServerCount: number,
): boolean {
  if (parseSyncTs(serverRev) > parseSyncTs(localRev)) return true;
  if (serverCount > 0 && prevServerCount < 0 && parseSyncTs(localRev) === 0) return true;
  return serverCount === 0 && prevServerCount > 0;
}

export interface PositionMergeInput {
  skipPosition?: boolean;
  localFraction: number;
  localPositionRev: string;
  localHasPaginator: boolean;
  serverFraction: number;
  serverProgress: number;
  serverPosition: string;
  serverPosUpdatedAt: string | null;
  localServerPositionUpdatedAt: string | null;
  localServerPositionProgress: number;
}

export function shouldUseServerPosition(input: PositionMergeInput): boolean {
  if (input.skipPosition) return false;

  const serverClearedPosition =
    input.serverProgress <= 0 &&
    !input.serverPosition &&
    parseSyncTs(input.localServerPositionUpdatedAt) > 0 &&
    !input.serverPosUpdatedAt &&
    (input.localServerPositionProgress ?? 0) > 0;

  if (serverClearedPosition) return true;

  const serverFrac = input.serverFraction;
  const localFrac = input.localFraction;

  if (serverFrac > localFrac + 1e-5) return true;

  const serverRev = parseSyncTs(input.serverPosUpdatedAt);
  const localRev = parseSyncTs(input.localPositionRev);
  const lastKnownServerRev = parseSyncTs(input.localServerPositionUpdatedAt);

  if (
    serverFrac > 0 &&
    Math.abs(serverFrac - localFrac) <= 1e-5 &&
    serverRev > localRev
  ) {
    return true;
  }

  // Сервер обновлён на другом устройстве после последней синхронизации и новее локальной правки.
  if (serverFrac > 0 && serverRev > lastKnownServerRev && serverRev > localRev) {
    return true;
  }

  return false;
}

export function shouldPushLocalPosition(input: PositionMergeInput, progress: number, canPushRead: boolean): boolean {
  if (input.skipPosition) return false;
  if (shouldUseServerPosition(input)) return false;
  const localFrac = input.localFraction;
  const serverFrac = input.serverFraction;
  const localAhead = localFrac > serverFrac + 1e-5;
  const sameFracLocalNewer =
    localFrac > 0 &&
    Math.abs(localFrac - serverFrac) <= 1e-5 &&
    parseSyncTs(input.localPositionRev) > parseSyncTs(input.serverPosUpdatedAt);
  return (localAhead || sameFracLocalNewer) && (progress < 99 || canPushRead);
}
