import {
  addReaderAnnotationApi,
  addReaderBookmarkApi,
  deleteReaderAnnotationApi,
  deleteReaderBookmarkApi,
  fetchReaderAnnotations,
  fetchReaderBookmarks,
  fetchReaderBookSyncMeta,
  fetchReaderActivitySyncMeta,
  fetchReadingPosition,
  ReadingPositionConflictError,
} from './inpxClient';
import { ServerConfig } from '../types';
import { OfflineReaderData, applyNewerLocalPositionIfNeeded, primeReaderLocalStorage, readOfflineReaderData, writeOfflineReaderData } from './offlineReaderStore';
import {
  applyServerActivitySyncMeta,
  buildSyncActivityOptions,
  readReaderActivitySync,
} from './readerActivitySync';
import {
  applyServerPositionToLocal,
  localFractionFromData,
  serverFractionFromPos,
} from './positionApply';
import {
  localHasMeaningfulPosition,
  pushReadingPositionWithRecovery,
  serverPositionIsMeaningful,
  writePushSuccessFields,
} from './readingPositionPush';
import {
  fractionToProgress,
  isServerCollectionNewer,
  normalizeReadingFraction,
  progressToFraction,
  SYNC_EPOCH,
} from './syncMerge';
import {
  decidePositionOnOpen,
  positionsDiffer,
} from '../../public/inpx-reader/reader-shared/position-revision.js';

function localBookmarksRev(data: OfflineReaderData): string {
  return data.bookmarksChangedAt || data.updatedAt || SYNC_EPOCH;
}

function localAnnotationsRev(data: OfflineReaderData): string {
  return data.annotationsChangedAt || data.updatedAt || SYNC_EPOCH;
}

async function fetchEnrichedServerPosition(
  config: ServerConfig,
  bookId: string,
): Promise<Awaited<ReturnType<typeof fetchReadingPosition>> | null> {
  let serverPos: Awaited<ReturnType<typeof fetchReadingPosition>>;
  let syncMeta: Awaited<ReturnType<typeof fetchReaderBookSyncMeta>> | null = null;
  try {
    [serverPos, syncMeta] = await Promise.all([
      fetchReadingPosition(config, bookId),
      fetchReaderBookSyncMeta(config, bookId).catch(() => null),
    ]);
  } catch {
    return null;
  }
  return enrichServerPosition(serverPos, syncMeta);
}

function isReadingPositionConflictError(
  error: unknown,
): error is ReadingPositionConflictError {
  if (error instanceof ReadingPositionConflictError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const current = (error as ReadingPositionConflictError).current;
  return current != null && typeof current === 'object';
}

export type CrossDevicePositionChoice = 'applied' | 'declined' | 'silent' | 'noop' | 'pending';

function writeServerSnapshotForDeferredPrompt(
  local: OfflineReaderData,
  serverPos: Awaited<ReturnType<typeof fetchReadingPosition>>,
): OfflineReaderData {
  const serverFrac = serverFractionFromPos(serverPos);
  const serverProgress = fractionToProgress(serverFrac);
  return {
    ...local,
    serverPosition: serverPos.position || null,
    serverPositionUpdatedAt: serverPos.updatedAt || null,
    serverPositionProgress: serverProgress,
    serverPositionFraction: serverFrac,
    serverFb2Href: serverPos.fb2Href ? String(serverPos.fb2Href) : null,
    serverSectionIndex:
      serverPos.sectionIndex != null && Number.isFinite(Number(serverPos.sectionIndex))
        ? Number(serverPos.sectionIndex)
        : null,
    serverTextOffset:
      serverPos.textOffset != null && Number.isFinite(Number(serverPos.textOffset))
        ? Number(serverPos.textOffset)
        : null,
    serverTextQuote: typeof serverPos.textQuote === 'string' ? serverPos.textQuote : null,
    serverTextSectionLength:
      serverPos.textSectionLength != null && Number.isFinite(Number(serverPos.textSectionLength))
        ? Number(serverPos.textSectionLength)
        : null,
    serverSectionPageFraction:
      serverPos.sectionPageFraction != null && Number.isFinite(Number(serverPos.sectionPageFraction))
        ? Number(serverPos.sectionPageFraction)
        : null,
    serverPaginatorPage:
      serverPos.paginatorPage != null && Number.isFinite(Number(serverPos.paginatorPage))
        ? Number(serverPos.paginatorPage)
        : null,
    serverPaginatorPages:
      serverPos.paginatorPages != null && Number.isFinite(Number(serverPos.paginatorPages))
        ? Number(serverPos.paginatorPages)
        : null,
    serverLayoutMode: serverPos.layoutMode ? String(serverPos.layoutMode) : null,
    positionVersion: 4,
    serverRevision: serverPos.revision,
    pendingCrossDevicePrompt: true,
    crossDeviceResolvedAt: null,
  };
}

function updateServerPositionMetadata(
  local: OfflineReaderData,
  serverPos: Awaited<ReturnType<typeof fetchReadingPosition>>,
): OfflineReaderData {
  const serverRevision = serverPos.revision ?? 0;
  return {
    ...local,
    positionVersion: 4,
    serverRevision,
    serverPosition: serverPos.position || local.serverPosition || null,
    serverPositionUpdatedAt: serverPos.updatedAt || local.serverPositionUpdatedAt || null,
    serverPositionProgress: fractionToProgress(serverFractionFromPos(serverPos)),
    serverPositionFraction: serverFractionFromPos(serverPos),
    serverFb2Href: serverPos.fb2Href ? String(serverPos.fb2Href) : (local.serverFb2Href ?? null),
    serverSectionIndex: serverPos.sectionIndex ?? null,
    serverTextOffset: serverPos.textOffset ?? null,
    serverTextQuote: serverPos.textQuote ?? null,
    serverTextSectionLength: serverPos.textSectionLength ?? null,
  };
}

function shouldApplyServerSilently(
  local: OfflineReaderData,
  serverPos: Awaited<ReturnType<typeof fetchReadingPosition>>,
): boolean {
  const baseRevision = local.baseRevision ?? 0;
  const serverRevision = serverPos.revision ?? 0;
  if (!serverPositionIsMeaningful(serverPos) && localHasMeaningfulPosition(local) && serverRevision === baseRevision) {
    return false;
  }
  return true;
}

/** Синхронизация позиции при открытии: deferred prompt в читалке после restore локальной позиции. */
export async function syncPositionOnBookOpen(
  config: ServerConfig,
  bookId: string,
): Promise<CrossDevicePositionChoice> {
  try {
    const serverPos = await fetchEnrichedServerPosition(config, bookId);
    if (!serverPos) return 'noop';

    const local = readOfflineReaderData(bookId);
    const decision = decidePositionOnOpen(local, serverPos);

    if (decision === 'prompt') {
      writeOfflineReaderData(bookId, writeServerSnapshotForDeferredPrompt(local, serverPos));
      primeReaderLocalStorage(bookId);
      return 'pending';
    }

    if (decision === 'server') {
      if (!shouldApplyServerSilently(local, serverPos)) {
        writeOfflineReaderData(bookId, updateServerPositionMetadata(local, serverPos));
        return 'noop';
      }
      applyServerPositionPull(bookId, local, serverPos);
      writeOfflineReaderData(bookId, {
        ...readOfflineReaderData(bookId),
        crossDeviceResolvedAt: serverPos.updatedAt || new Date().toISOString(),
      });
      return 'silent';
    }

    writeOfflineReaderData(bookId, updateServerPositionMetadata(local, serverPos));
    return 'noop';
  } catch {
    return 'noop';
  }
}

function enrichServerPosition(
  serverPos: Awaited<ReturnType<typeof fetchReadingPosition>>,
  syncMeta: Awaited<ReturnType<typeof fetchReaderBookSyncMeta>> | null,
): Awaited<ReturnType<typeof fetchReadingPosition>> {
  const updatedAt = serverPos.updatedAt || syncMeta?.positionUpdatedAt || null;
  if (!updatedAt || updatedAt === serverPos.updatedAt) return serverPos;
  return { ...serverPos, updatedAt };
}

function applyServerPositionPull(
  bookId: string,
  local: OfflineReaderData,
  serverPos: Awaited<ReturnType<typeof fetchReadingPosition>>,
): void {
  writeOfflineReaderData(bookId, applyServerPositionToLocal(local, serverPos));
  primeReaderLocalStorage(bookId);
}

/** @deprecated Use syncPositionOnBookOpen on user open; kept for background pull without prompt. */
export async function pullServerPositionIfAhead(config: ServerConfig, bookId: string): Promise<boolean> {
  const serverPos = await fetchEnrichedServerPosition(config, bookId);
  if (!serverPos) return false;
  const local = readOfflineReaderData(bookId);
  if (local.positionDirty || serverPos.revision <= (local.baseRevision ?? 0)) return false;
  applyServerPositionPull(bookId, local, serverPos);
  return true;
}

/** On close: pull clean state or CAS-push dirty state against the observed server revision. */
export async function finalizeReadingPositionSync(
  config: ServerConfig,
  bookId: string,
  options?: { canPushRead?: boolean },
): Promise<'pulled' | 'pushed' | 'conflict' | 'noop'> {
  let serverPos: Awaited<ReturnType<typeof fetchReadingPosition>>;
  let syncMeta: Awaited<ReturnType<typeof fetchReaderBookSyncMeta>> | null = null;
  try {
    [serverPos, syncMeta] = await Promise.all([
      fetchReadingPosition(config, bookId),
      fetchReaderBookSyncMeta(config, bookId).catch(() => null),
    ]);
  } catch {
    return 'noop';
  }
  serverPos = enrichServerPosition(serverPos, syncMeta);
  const local = readOfflineReaderData(bookId);
  const baseRevision = local.baseRevision ?? 0;
  const serverRevision = serverPos.revision ?? 0;
  const meaningfulLocal = localHasMeaningfulPosition(local);

  if (local.pendingCrossDevicePrompt && !(local.positionDirty && meaningfulLocal)) {
    return 'noop';
  }

  if (!local.positionDirty && serverRevision > baseRevision) {
    applyServerPositionPull(bookId, local, serverPos);
    return 'pulled';
  }
  if (!local.positionDirty) return 'noop';

  if (serverRevision !== baseRevision && !positionsDiffer(local, serverPos)) {
    applyServerPositionPull(bookId, local, serverPos);
    return 'pulled';
  }
  if (serverRevision !== baseRevision) {
    writeOfflineReaderData(bookId, writeServerSnapshotForDeferredPrompt(local, serverPos));
    primeReaderLocalStorage(bookId);
    return 'conflict';
  }

  if (!meaningfulLocal) return 'noop';

  if (local.progress >= 99 && options?.canPushRead === false) return 'noop';

  const localFrac = localFractionFromData(local);
  try {
    const pushResult = await pushReadingPositionWithRecovery(config, bookId, local, baseRevision);
    writeOfflineReaderData(bookId, {
      ...readOfflineReaderData(bookId),
      ...writePushSuccessFields(local, pushResult, localFrac),
    });
    return 'pushed';
  } catch (error) {
    if (isReadingPositionConflictError(error)) {
      const fresh = readOfflineReaderData(bookId);
      writeOfflineReaderData(bookId, writeServerSnapshotForDeferredPrompt(fresh, error.current));
      primeReaderLocalStorage(bookId);
      return 'conflict';
    }
    return 'noop';
  }
}

async function deleteAllServerBookmarks(
  config: ServerConfig,
  bookId: string,
  serverBookmarks: Awaited<ReturnType<typeof fetchReaderBookmarks>>,
): Promise<void> {
  for (const bm of serverBookmarks) {
    try {
      await deleteReaderBookmarkApi(config, bookId, bm.id);
    } catch {
      /* keep trying */
    }
  }
}

async function deleteAllServerAnnotations(
  config: ServerConfig,
  bookId: string,
  serverAnnotations: Awaited<ReturnType<typeof fetchReaderAnnotations>>,
): Promise<void> {
  for (const ann of serverAnnotations) {
    try {
      await deleteReaderAnnotationApi(config, bookId, ann.id);
    } catch {
      /* keep trying */
    }
  }
}

async function pushLocalBookmarks(
  config: ServerConfig,
  bookId: string,
  bookmarks: OfflineReaderData['bookmarks'],
  deletedPositions: Set<string>,
  serverBookmarks: Awaited<ReturnType<typeof fetchReaderBookmarks>>,
): Promise<OfflineReaderData['bookmarks']> {
  const next = [...bookmarks];
  const serverPositions = new Set(serverBookmarks.map((b) => b.position));

  for (const bm of serverBookmarks) {
    if (deletedPositions.has(bm.position)) {
      try {
        await deleteReaderBookmarkApi(config, bookId, bm.id);
        serverPositions.delete(bm.position);
      } catch {
        /* retry next sync */
      }
    }
  }

  if (
    next.length === 0 &&
    serverBookmarks.length > 0 &&
    deletedPositions.size > 0 &&
    serverBookmarks.every((bookmark) => deletedPositions.has(bookmark.position))
  ) {
    await deleteAllServerBookmarks(config, bookId, serverBookmarks);
    return next;
  }

  for (const bm of next) {
    if (!bm.position || serverPositions.has(bm.position) || deletedPositions.has(bm.position)) continue;
    try {
      const serverId = await addReaderBookmarkApi(config, bookId, bm.position, bm.title || '');
      bm.id = serverId;
      serverPositions.add(bm.position);
    } catch {
      /* skip */
    }
  }

  return next;
}

async function pushLocalAnnotations(
  config: ServerConfig,
  bookId: string,
  annotations: OfflineReaderData['annotations'],
  deletedCfis: Set<string>,
  serverAnnotations: Awaited<ReturnType<typeof fetchReaderAnnotations>>,
): Promise<OfflineReaderData['annotations']> {
  const next = [...annotations];
  const serverCfis = new Set(serverAnnotations.map((a) => a.cfi));

  for (const ann of serverAnnotations) {
    if (deletedCfis.has(ann.cfi)) {
      try {
        await deleteReaderAnnotationApi(config, bookId, ann.id);
        serverCfis.delete(ann.cfi);
      } catch {
        /* retry next sync */
      }
    }
  }

  if (
    next.length === 0 &&
    serverAnnotations.length > 0 &&
    deletedCfis.size > 0 &&
    serverAnnotations.every((annotation) => deletedCfis.has(annotation.cfi))
  ) {
    await deleteAllServerAnnotations(config, bookId, serverAnnotations);
    return next;
  }

  for (const ann of next) {
    if (!ann.cfi || serverCfis.has(ann.cfi) || deletedCfis.has(ann.cfi)) continue;
    try {
      const serverId = await addReaderAnnotationApi(
        config,
        bookId,
        ann.cfi,
        ann.text || '',
        ann.note || '',
        ann.color || 'yellow',
      );
      ann.id = serverId;
      serverCfis.add(ann.cfi);
    } catch {
      /* skip */
    }
  }

  return next;
}

export async function syncOfflineReaderForBook(
  config: ServerConfig,
  bookId: string,
  activity?: {
    shouldPushReadingHistory: boolean;
    shouldPushReadState: boolean;
  },
  options?: {
    /** When opening a book, keep local position — sync bookmarks/annotations only. */
    skipPosition?: boolean;
    /** Merge server→local on open without pushing stale local position to server. */
    neverPushPosition?: boolean;
  },
): Promise<void> {
  const local = readOfflineReaderData(bookId);
  const deletedBmPositions = new Set(local.deletedBookmarkPositions || []);
  const deletedAnnCfis = new Set(local.deletedAnnotationCfis || []);

  let serverPos: Awaited<ReturnType<typeof fetchReadingPosition>> = {
    position: '',
    progress: 0,
    positionVersion: 4,
    revision: 0,
  };
  let serverBookmarks: Awaited<ReturnType<typeof fetchReaderBookmarks>> = [];
  let serverAnnotations: Awaited<ReturnType<typeof fetchReaderAnnotations>> = [];
  let syncMeta = await fetchReaderBookSyncMeta(config, bookId);

  try {
    serverPos = await fetchReadingPosition(config, bookId);
  } catch {
    if (options?.skipPosition) return;
  }

  try {
    [serverBookmarks, serverAnnotations] = await Promise.all([
      fetchReaderBookmarks(config, bookId),
      fetchReaderAnnotations(config, bookId),
    ]);
  } catch {
    if (options?.skipPosition) return;
  }

  if (!syncMeta) {
    syncMeta = {
      bookmarksRev: SYNC_EPOCH,
      annotationsRev: SYNC_EPOCH,
      positionUpdatedAt: serverPos.updatedAt || null,
      positionProgress: serverPos.progress || 0,
      bookmarkCount: serverBookmarks.length,
      annotationCount: serverAnnotations.length,
    };
  }

  const prevBmCount = local.serverBookmarkCount ?? -1;
  const prevAnnCount = local.serverAnnotationCount ?? -1;

  const serverBookmarksNewer = isServerCollectionNewer(
    syncMeta.bookmarksRev,
    localBookmarksRev(local),
    syncMeta.bookmarkCount,
    prevBmCount,
  );
  const serverAnnotationsNewer = isServerCollectionNewer(
    syncMeta.annotationsRev,
    localAnnotationsRev(local),
    syncMeta.annotationCount,
    prevAnnCount,
  );

  let bookmarks = [...local.bookmarks];
  let annotations = [...local.annotations];
  let deletedBookmarkPositions = [...deletedBmPositions];
  let deletedAnnotationCfis = [...deletedAnnCfis];
  let position = local.position;
  let progress = local.progress || 0;
  let fb2Href = local.fb2Href ?? null;
  let fraction = local.fraction != null && Number.isFinite(Number(local.fraction))
    ? normalizeReadingFraction(Number(local.fraction))
    : progressToFraction(progress);
  progress = fractionToProgress(fraction);

  if (serverBookmarksNewer) {
    bookmarks = serverBookmarks.map((bm) => ({
      id: bm.id,
      position: bm.position,
      title: bm.title,
      createdAt: bm.createdAt,
    }));
    deletedBookmarkPositions = [];
  } else {
    bookmarks = await pushLocalBookmarks(
      config,
      bookId,
      bookmarks,
      deletedBmPositions,
      serverBookmarks,
    );
    deletedBookmarkPositions = deletedBookmarkPositions.filter((pos) =>
      serverBookmarks.some((b) => b.position === pos),
    );
  }

  if (serverAnnotationsNewer) {
    annotations = serverAnnotations.map((ann) => ({
      id: ann.id,
      cfi: ann.cfi,
      text: ann.text,
      note: ann.note,
      color: ann.color,
      createdAt: ann.createdAt,
    }));
    deletedAnnotationCfis = [];
  } else {
    annotations = await pushLocalAnnotations(
      config,
      bookId,
      annotations,
      deletedAnnCfis,
      serverAnnotations,
    );
    deletedAnnotationCfis = deletedAnnotationCfis.filter((cfi) =>
      serverAnnotations.some((a) => a.cfi === cfi),
    );
  }

  const serverProgress = serverPos.progress || 0;
  const serverPosUpdatedAt = serverPos.updatedAt || syncMeta.positionUpdatedAt || null;
  const serverFrac = serverPos.fraction != null && Number.isFinite(Number(serverPos.fraction))
    ? normalizeReadingFraction(Number(serverPos.fraction))
    : progressToFraction(serverProgress);

  if (options?.skipPosition) {
    const fresh = readOfflineReaderData(bookId);
    writeOfflineReaderData(bookId, {
      ...fresh,
      bookmarks,
      annotations,
      deletedBookmarkPositions,
      deletedAnnotationCfis,
      bookmarksChangedAt: serverBookmarksNewer ? syncMeta.bookmarksRev : fresh.bookmarksChangedAt,
      annotationsChangedAt: serverAnnotationsNewer ? syncMeta.annotationsRev : fresh.annotationsChangedAt,
      serverBookmarksRev: syncMeta.bookmarksRev,
      serverAnnotationsRev: syncMeta.annotationsRev,
      serverPositionUpdatedAt: serverPosUpdatedAt,
      serverBookmarkCount: syncMeta.bookmarkCount,
      serverAnnotationCount: syncMeta.annotationCount,
      serverPositionProgress: serverProgress,
      serverPositionFraction: serverFrac,
      positionVersion: 4,
    });
    return;
  }

  const baseRevision = local.baseRevision ?? 0;
  const serverRevision = serverPos.revision ?? 0;
  const revisionConflict =
    Boolean(local.positionDirty)
    && serverRevision !== baseRevision
    && positionsDiffer(local, serverPos);
  const useServerPosition =
    (
      !local.positionDirty
      && local.dismissedServerRevision !== serverRevision
      && serverRevision > baseRevision
    )
    || (
      Boolean(local.positionDirty)
      && serverRevision !== baseRevision
      && !positionsDiffer(local, serverPos)
    );

  let sectionIndex = local.sectionIndex ?? null;
  let textOffset = local.textOffset ?? null;
  let textQuote = local.textQuote ?? null;
  let textSectionLength = local.textSectionLength ?? null;
  let sectionPageFraction = local.sectionPageFraction ?? null;
  let paginatorPage = local.paginatorPage ?? null;
  let paginatorPages = local.paginatorPages ?? null;
  let layoutModeStored = local.layoutMode ?? null;

  let serverPosUpdatedAtStored = serverPosUpdatedAt;
  let serverProgressStored = serverProgress;
  let serverFractionStored = serverFrac;
  let serverRevisionStored = serverRevision;
  let serverSectionIndexStored = serverPos.sectionIndex ?? null;
  let serverTextOffsetStored = serverPos.textOffset ?? null;
  let serverTextQuoteStored = serverPos.textQuote ?? null;
  let serverTextSectionLengthStored = serverPos.textSectionLength ?? null;
  let baseRevisionStored = baseRevision;
  let positionDirtyStored = Boolean(local.positionDirty);
  let dismissedServerRevisionStored = local.dismissedServerRevision ?? null;
  let conflictSnapshot: OfflineReaderData | null = revisionConflict
    ? writeServerSnapshotForDeferredPrompt(local, serverPos)
    : null;

  if (useServerPosition) {
    position = serverPos.position || null;
    if (serverPos.fraction != null && Number.isFinite(Number(serverPos.fraction))) {
      fraction = normalizeReadingFraction(Number(serverPos.fraction));
      progress = fractionToProgress(fraction);
    } else {
      progress = serverPos.progress || 0;
      fraction = progressToFraction(progress);
    }
    fb2Href = serverPos.fb2Href ? String(serverPos.fb2Href) : null;
    sectionIndex =
      serverPos.sectionIndex != null && Number.isFinite(Number(serverPos.sectionIndex))
        ? Number(serverPos.sectionIndex)
        : null;
    textOffset =
      serverPos.textOffset != null && Number.isFinite(Number(serverPos.textOffset))
        ? Number(serverPos.textOffset)
        : null;
    textQuote = typeof serverPos.textQuote === 'string' ? serverPos.textQuote : null;
    textSectionLength =
      serverPos.textSectionLength != null && Number.isFinite(Number(serverPos.textSectionLength))
        ? Number(serverPos.textSectionLength)
        : null;
    sectionPageFraction =
      serverPos.sectionPageFraction != null && Number.isFinite(Number(serverPos.sectionPageFraction))
        ? Number(serverPos.sectionPageFraction)
        : null;
    paginatorPage =
      serverPos.paginatorPage != null && Number.isFinite(Number(serverPos.paginatorPage))
        ? Number(serverPos.paginatorPage)
        : null;
    paginatorPages =
      serverPos.paginatorPages != null && Number.isFinite(Number(serverPos.paginatorPages))
        ? Number(serverPos.paginatorPages)
        : null;
    layoutModeStored = serverPos.layoutMode ? String(serverPos.layoutMode) : null;
    serverFractionStored = fraction;
    serverRevisionStored = serverRevision;
    serverSectionIndexStored = sectionIndex;
    serverTextOffsetStored = textOffset;
    serverTextQuoteStored = textQuote;
    serverTextSectionLengthStored = textSectionLength;
    baseRevisionStored = serverRevision;
    positionDirtyStored = false;
    dismissedServerRevisionStored = null;
  } else if (
    !options?.neverPushPosition
    && local.positionDirty
    && !revisionConflict
    && (progress < 99 || activity?.shouldPushReadState !== false)
  ) {
    try {
      const pushResult = await pushReadingPositionWithRecovery(config, bookId, local, baseRevision);
      const pushedFrac = localFractionFromData(local);
      serverPosUpdatedAtStored = pushResult.updatedAt || new Date().toISOString();
      serverProgressStored = fractionToProgress(pushedFrac);
      serverFractionStored = pushedFrac;
      serverRevisionStored = pushResult.revision;
      serverSectionIndexStored = sectionIndex;
      serverTextOffsetStored = textOffset;
      serverTextQuoteStored = textQuote;
      serverTextSectionLengthStored = textSectionLength;
      baseRevisionStored = pushResult.revision;
      positionDirtyStored = false;
      dismissedServerRevisionStored = null;
    } catch (error) {
      if (isReadingPositionConflictError(error)) {
        conflictSnapshot = writeServerSnapshotForDeferredPrompt(local, error.current);
        serverRevisionStored = error.current.revision ?? serverRevisionStored;
      }
      /* keep local */
    }
  }

  writeOfflineReaderData(
    bookId,
    applyNewerLocalPositionIfNeeded(bookId, {
      ...local,
      position,
      progress,
      fraction,
      fb2Href,
      sectionIndex,
      textOffset,
      textQuote,
      textSectionLength,
      sectionPageFraction,
      paginatorPage,
      paginatorPages,
      layoutMode: layoutModeStored,
      bookmarks,
      annotations,
      deletedBookmarkPositions,
      deletedAnnotationCfis,
      bookmarksChangedAt: serverBookmarksNewer ? syncMeta.bookmarksRev : local.bookmarksChangedAt,
      annotationsChangedAt: serverAnnotationsNewer ? syncMeta.annotationsRev : local.annotationsChangedAt,
      positionChangedAt: useServerPosition
        ? serverPosUpdatedAtStored || local.positionChangedAt
        : local.positionChangedAt,
      serverBookmarksRev: syncMeta.bookmarksRev,
      serverAnnotationsRev: syncMeta.annotationsRev,
      serverPositionUpdatedAt: serverPosUpdatedAtStored,
      serverBookmarkCount: syncMeta.bookmarkCount,
      serverAnnotationCount: syncMeta.annotationCount,
      serverPositionProgress: serverProgressStored,
      serverPositionFraction: serverFractionStored,
      serverSectionIndex: serverSectionIndexStored,
      serverTextOffset: serverTextOffsetStored,
      serverTextQuote: serverTextQuoteStored,
      serverTextSectionLength: serverTextSectionLengthStored,
      positionVersion: 4,
      serverRevision: serverRevisionStored,
      baseRevision: baseRevisionStored,
      positionDirty: positionDirtyStored,
      dismissedServerRevision: dismissedServerRevisionStored,
      ...(conflictSnapshot ? {
        pendingCrossDevicePrompt: true,
        serverPosition: conflictSnapshot.serverPosition,
        serverPositionUpdatedAt: conflictSnapshot.serverPositionUpdatedAt,
        serverPositionProgress: conflictSnapshot.serverPositionProgress,
        serverPositionFraction: conflictSnapshot.serverPositionFraction,
        serverFb2Href: conflictSnapshot.serverFb2Href,
        serverSectionIndex: conflictSnapshot.serverSectionIndex,
        serverTextOffset: conflictSnapshot.serverTextOffset,
        serverTextQuote: conflictSnapshot.serverTextQuote,
        serverTextSectionLength: conflictSnapshot.serverTextSectionLength,
        serverSectionPageFraction: conflictSnapshot.serverSectionPageFraction,
        serverPaginatorPage: conflictSnapshot.serverPaginatorPage,
        serverPaginatorPages: conflictSnapshot.serverPaginatorPages,
        serverLayoutMode: conflictSnapshot.serverLayoutMode,
      } : {}),
    }),
  );
}

export async function syncAllOfflineReaders(
  config: ServerConfig,
  bookIds: string[],
  activity?: {
    shouldPushReadingHistory: boolean;
    shouldPushReadState: boolean;
  },
): Promise<void> {
  for (const bookId of bookIds) {
    try {
      await syncOfflineReaderForBook(config, bookId, activity);
    } catch {
      /* next book */
    }
  }
}

export async function syncDownloadedBooksOnline(
  config: ServerConfig,
  bookIds: string[],
): Promise<void> {
  if (bookIds.length === 0) return;
  const activityState = readReaderActivitySync();
  const activityMeta = await fetchReaderActivitySyncMeta(config);
  if (activityMeta) applyServerActivitySyncMeta(activityMeta);
  const activityOpts = buildSyncActivityOptions(activityState, activityMeta);
  await syncAllOfflineReaders(config, bookIds, activityOpts);
}

export { applyServerPositionToLocal };
