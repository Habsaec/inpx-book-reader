import { parseSyncTs } from './readerActivitySync';
import {
  normalizeReadingFraction,
  fractionToProgress,
  progressToFraction,
  parseFb2HrefParts,
  isFb2HrefFormat,
  compareFb2Hrefs,
  formatPositionDetail,
  formatPositionProgressLabel,
  resolvePositionDisplayMeta,
  hasMeaningfulServerPosition,
  hasMeaningfulLocalPosition,
  positionsMeaningfullyDiffer,
  serverPositionChangedSinceLastSync,
  serverEditUnseenOnThisClient,
  shouldShowCrossDevicePositionPrompt,
  shouldUseServerPosition,
  buildMergeInputFromLocalCtx,
  type PositionMergeInput,
} from '../../public/inpx-reader/position-sync.js';

export const SYNC_EPOCH = '1970-01-01T00:00:00.000Z';
export {
  normalizeReadingFraction,
  fractionToProgress,
  progressToFraction,
  parseFb2HrefParts,
  isFb2HrefFormat,
  compareFb2Hrefs,
  formatPositionDetail,
  formatPositionProgressLabel,
  resolvePositionDisplayMeta,
  hasMeaningfulServerPosition,
  hasMeaningfulLocalPosition,
  positionsMeaningfullyDiffer,
  serverPositionChangedSinceLastSync,
  serverEditUnseenOnThisClient,
  shouldShowCrossDevicePositionPrompt,
  shouldUseServerPosition,
  buildMergeInputFromLocalCtx,
  type PositionMergeInput,
};

export function isServerCollectionNewer(
  serverRev: string,
  localRev: string,
  serverCount: number,
  prevServerCount: number,
): boolean {
  if (parseSyncTs(serverRev) > parseSyncTs(localRev)) return true;
  if (serverCount > 0 && prevServerCount < 0 && parseSyncTs(localRev) === 0) return true;
  // Empty server wipe is only authoritative when the server rev is at least as new as local.
  return (
    serverCount === 0
    && prevServerCount > 0
    && parseSyncTs(serverRev) >= parseSyncTs(localRev)
  );
}

export const CROSS_DEVICE_POSITION_MESSAGE =
  'Ранее вы уже читали эту книгу на другом устройстве. Перейти на сохранённую позицию?';
export const CROSS_DEVICE_POSITION_ACCEPT = 'Перейти';
export const CROSS_DEVICE_POSITION_DECLINE = 'Остаться здесь';

export interface PositionDisplayMeta {
  fb2Href?: string | null;
  paginatorPage?: number | null;
  paginatorPages?: number | null;
  sectionIndex?: number | null;
}

export interface CrossDevicePositionPromptDetails {
  message: string;
  localLine: string;
  serverLine: string;
}

export function buildCrossDevicePromptDetails(
  mergeInput: PositionMergeInput,
  localMeta?: PositionDisplayMeta | null,
  serverMeta?: PositionDisplayMeta | null,
): CrossDevicePositionPromptDetails {
  return {
    message: CROSS_DEVICE_POSITION_MESSAGE,
    localLine: formatPositionProgressLabel(
      mergeInput.localFraction,
      fractionToProgress(mergeInput.localFraction),
      resolvePositionDisplayMeta(
        { fraction: mergeInput.localFraction, fb2Href: localMeta?.fb2Href, position: mergeInput.localPosition, ...localMeta },
        null,
      ),
    ),
    serverLine: formatPositionProgressLabel(
      mergeInput.serverFraction,
      fractionToProgress(mergeInput.serverFraction),
      resolvePositionDisplayMeta(
        {
          fraction: mergeInput.serverFraction,
          fb2Href: mergeInput.serverFb2Href ?? serverMeta?.fb2Href,
          position: mergeInput.serverPosition,
          ...serverMeta,
        },
        null,
      ),
    ),
  };
}

/** @deprecated Timestamp-LWW helper; revision-CAS sync uses decidePositionOnOpen instead. */
export function shouldPushLocalPosition(input: PositionMergeInput, progress: number, canPushRead: boolean): boolean {
  if (input.skipPosition) return false;
  if (shouldUseServerPosition(input)) return false;
  const localFrac = input.localFraction;
  const localRev = parseSyncTs(input.localPositionRev);
  const serverRev = parseSyncTs(input.serverPosUpdatedAt);
  const hasMeaningfulLocal = localFrac > 0.02 || parseSyncTs(input.localPositionRev) > 0;
  const localNewerThanServer = localRev > serverRev;
  return hasMeaningfulLocal && localNewerThanServer && (progress < 99 || canPushRead);
}
