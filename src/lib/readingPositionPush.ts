import {
  fetchReadingPosition,
  ReadingPositionConflictError,
  ReadingPositionProtocolError,
  saveReadingPosition,
  type ServerReadingPosition,
} from './inpxClient';
import type { OfflineReaderData } from './offlineReaderStore';
import type { ServerConfig } from '../types';
import {
  localFractionFromData,
  readingPositionAnchorsFromLocal,
  serverFractionFromPos,
} from './positionApply';
import { fractionToProgress } from './syncMerge';
import {
  hasMeaningfulPosition,
  positionsDiffer,
} from '../../public/inpx-reader/reader-shared/position-revision.js';

export function localHasMeaningfulPosition(local: OfflineReaderData): boolean {
  return hasMeaningfulPosition(local);
}

export type PushReadingPositionResult = Awaited<ReturnType<typeof saveReadingPosition>>;

export async function pushReadingPositionWithRecovery(
  config: ServerConfig,
  bookId: string,
  local: OfflineReaderData,
  baseRevision: number,
): Promise<PushReadingPositionResult> {
  const localFrac = localFractionFromData(local);
  const pushProgress = fractionToProgress(localFrac);

  const doPush = (revision: number) => saveReadingPosition(
    config,
    bookId,
    local.position || '',
    pushProgress,
    local.fraction ?? undefined,
    local.fb2Href ?? undefined,
    readingPositionAnchorsFromLocal(local),
    revision,
    local.positionSessionId || undefined,
  );

  try {
    return await doPush(baseRevision);
  } catch (error) {
    if (!(error instanceof ReadingPositionProtocolError)) throw error;
    const current = await fetchReadingPosition(config, bookId);
    if (positionsDiffer(local, current)) {
      throw new ReadingPositionConflictError(current);
    }
    const refreshedRevision = current.revision ?? 0;
    return await doPush(refreshedRevision);
  }
}

export function writePushSuccessFields(
  local: OfflineReaderData,
  pushResult: PushReadingPositionResult,
  localFrac: number,
): Partial<OfflineReaderData> {
  const pushProgress = fractionToProgress(localFrac);
  const pushedAt = pushResult.updatedAt || new Date().toISOString();
  return {
    serverPositionUpdatedAt: pushedAt,
    serverPositionProgress: pushProgress,
    serverPositionFraction: localFrac,
    positionVersion: 4,
    serverRevision: pushResult.revision,
    baseRevision: pushResult.revision,
    positionDirty: false,
    pendingCrossDevicePrompt: false,
    dismissedServerRevision: null,
    dismissedServerPositionUpdatedAt: null,
    dismissedServerSessionId: null,
  };
}

export function serverPositionIsMeaningful(serverPos: ServerReadingPosition): boolean {
  return hasMeaningfulPosition({
    position: serverPos.position || '',
    progress: serverPos.progress || 0,
    fraction: serverFractionFromPos(serverPos),
    fb2Href: serverPos.fb2Href ?? null,
    sectionIndex: serverPos.sectionIndex ?? null,
    textOffset: serverPos.textOffset ?? null,
    textQuote: serverPos.textQuote ?? null,
    textSectionLength: serverPos.textSectionLength ?? null,
    sectionPageFraction: serverPos.sectionPageFraction ?? null,
    paginatorPage: serverPos.paginatorPage ?? null,
    paginatorPages: serverPos.paginatorPages ?? null,
    layoutMode: serverPos.layoutMode ?? null,
  });
}
