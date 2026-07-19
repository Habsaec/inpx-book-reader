import type { ServerReadingPosition } from './inpxClient';
import type { OfflineReaderData } from './offlineReaderStore';
import { fractionToProgress, normalizeReadingFraction, progressToFraction } from './syncMerge';

export function serverFractionFromPos(serverPos: ServerReadingPosition): number {
  if (serverPos.fraction != null && Number.isFinite(Number(serverPos.fraction))) {
    return normalizeReadingFraction(Number(serverPos.fraction));
  }
  return progressToFraction(serverPos.progress || 0);
}

export function localFractionFromData(local: OfflineReaderData): number {
  if (local.fraction != null && Number.isFinite(Number(local.fraction))) {
    return normalizeReadingFraction(Number(local.fraction));
  }
  return progressToFraction(local.progress || 0);
}

export function applyServerPositionToLocal(
  local: OfflineReaderData,
  serverPos: ServerReadingPosition,
): OfflineReaderData {
  const fraction = serverFractionFromPos(serverPos);
  const progress = fractionToProgress(fraction);
  return {
    ...local,
    position: serverPos.position || null,
    progress,
    fraction,
    fb2Href: serverPos.fb2Href ? String(serverPos.fb2Href) : null,
    sectionIndex: serverPos.sectionIndex ?? null,
    textOffset: serverPos.textOffset ?? null,
    textQuote: serverPos.textQuote ?? null,
    textSectionLength: serverPos.textSectionLength ?? null,
    sectionPageFraction: serverPos.sectionPageFraction ?? null,
    paginatorPage: serverPos.paginatorPage ?? null,
    paginatorPages: serverPos.paginatorPages ?? null,
    layoutMode: serverPos.layoutMode ?? null,
    positionChangedAt: serverPos.updatedAt || new Date().toISOString(),
    positionVersion: 4,
    serverRevision: serverPos.revision,
    baseRevision: serverPos.revision,
    positionDirty: false,
    dismissedServerRevision: null,
    pendingCrossDevicePrompt: false,
    serverPositionUpdatedAt: serverPos.updatedAt || null,
    serverPositionProgress: progress,
    serverPositionFraction: fraction,
    serverFb2Href: serverPos.fb2Href ? String(serverPos.fb2Href) : null,
    serverSectionIndex: serverPos.sectionIndex ?? null,
    serverTextOffset: serverPos.textOffset ?? null,
    serverTextQuote: serverPos.textQuote ?? null,
    serverTextSectionLength: serverPos.textSectionLength ?? null,
    dismissedServerPositionUpdatedAt: null,
  };
}

export function readingPositionAnchorsFromLocal(local: OfflineReaderData) {
  return {
    sectionIndex: local.sectionIndex ?? undefined,
    textOffset: local.textOffset ?? undefined,
    textQuote: local.textQuote ?? undefined,
    textSectionLength: local.textSectionLength ?? undefined,
    sectionPageFraction: local.sectionPageFraction ?? undefined,
    paginatorPage: local.paginatorPage ?? undefined,
    paginatorPages: local.paginatorPages ?? undefined,
    layoutMode: local.layoutMode ?? undefined,
  };
}
