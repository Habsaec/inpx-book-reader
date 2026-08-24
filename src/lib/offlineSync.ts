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
  isAuthError,
  isUnreachableServerError,
  ApiError,
  patchReaderAnnotationApi,
  ReadingPositionConflictError,
} from './inpxClient';
import { ServerConfig } from '../types';
import { OfflineReaderData, applyNewerLocalPositionIfNeeded, primeReaderLocalStorage, readOfflineReaderData, writeOfflineReaderData } from './offlineReaderStore';
import {
  applyServerActivitySyncMeta,
  buildSyncActivityOptions,
  parseSyncTs,
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
      fetchReaderBookSyncMeta(config, bookId).catch((e) => {
        if (isAuthError(e)) throw e;
        return null;
      }),
    ]);
  } catch (e) {
    if (isAuthError(e)) throw e;
    // Глотаем только ожидаемые сбои сети/API; программные ошибки (TypeError в
    // enrichServerPosition и т.п.) должны быть видны, а не маскироваться в 'noop'.
    if (isUnreachableServerError(e) || e instanceof ApiError) return null;
    throw e;
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

export function writeServerSnapshotForDeferredPrompt(
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
    serverSessionId: serverPos.sessionId ? String(serverPos.sessionId) : '',
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
      const draft = writeServerSnapshotForDeferredPrompt(local, serverPos);
      writeOfflineReaderData(bookId, applyNewerLocalPositionIfNeeded(bookId, draft, local));
      primeReaderLocalStorage(bookId);
      return 'pending';
    }

    if (decision === 'server') {
      if (!shouldApplyServerSilently(local, serverPos)) {
        writeOfflineReaderData(
          bookId,
          applyNewerLocalPositionIfNeeded(bookId, updateServerPositionMetadata(local, serverPos), local),
        );
        return 'noop';
      }
      applyServerPositionPull(bookId, local, serverPos);
      writeOfflineReaderData(bookId, {
        ...readOfflineReaderData(bookId),
        crossDeviceResolvedAt: serverPos.updatedAt || new Date().toISOString(),
      });
      return 'silent';
    }

    writeOfflineReaderData(
      bookId,
      applyNewerLocalPositionIfNeeded(bookId, updateServerPositionMetadata(local, serverPos), local),
    );
    return 'noop';
  } catch (e) {
    if (isAuthError(e)) throw e;
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
  const applied = applyServerPositionToLocal(local, serverPos);
  // Stamp from server clock so a clean local snapshot is not treated as "newer" than the pull.
  const stamped = {
    ...applied,
    positionChangedAt:
      serverPos.updatedAt
      || applied.positionChangedAt
      || local.positionChangedAt
      || new Date().toISOString(),
  };
  writeOfflineReaderData(bookId, applyNewerLocalPositionIfNeeded(bookId, stamped, local));
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
      fetchReaderBookSyncMeta(config, bookId).catch((e) => {
        if (isAuthError(e)) throw e;
        return null;
      }),
    ]);
  } catch (e) {
    if (isAuthError(e)) throw e;
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
    writeOfflineReaderData(
      bookId,
      applyNewerLocalPositionIfNeeded(bookId, writeServerSnapshotForDeferredPrompt(local, serverPos), local),
    );
    primeReaderLocalStorage(bookId);
    return 'conflict';
  }

  if (!meaningfulLocal) return 'noop';

  if (local.progress >= 99 && options?.canPushRead === false) return 'noop';

  const localFrac = localFractionFromData(local);
  try {
    const pushResult = await pushReadingPositionWithRecovery(config, bookId, local, baseRevision);
    writeOfflineReaderData(
      bookId,
      applyNewerLocalPositionIfNeeded(bookId, {
        ...local,
        ...writePushSuccessFields(local, pushResult, localFrac),
      }, local),
    );
    return 'pushed';
  } catch (error) {
    if (isReadingPositionConflictError(error)) {
      const fresh = readOfflineReaderData(bookId);
      writeOfflineReaderData(
        bookId,
        applyNewerLocalPositionIfNeeded(
          bookId,
          writeServerSnapshotForDeferredPrompt(fresh, error.current),
          fresh,
        ),
      );
      primeReaderLocalStorage(bookId);
      return 'conflict';
    }
    if (isAuthError(error)) throw error;
    return 'noop';
  }
}

async function deleteAllServerBookmarks(
  config: ServerConfig,
  bookId: string,
  serverBookmarks: Awaited<ReturnType<typeof fetchReaderBookmarks>>,
): Promise<boolean> {
  let hadFailures = false;
  for (const bm of serverBookmarks) {
    try {
      await deleteReaderBookmarkApi(config, bookId, bm.id);
    } catch (e) {
      if (isAuthError(e)) throw e;
      hadFailures = true;
    }
  }
  return hadFailures;
}

async function deleteAllServerAnnotations(
  config: ServerConfig,
  bookId: string,
  serverAnnotations: Awaited<ReturnType<typeof fetchReaderAnnotations>>,
): Promise<boolean> {
  let hadFailures = false;
  for (const ann of serverAnnotations) {
    try {
      await deleteReaderAnnotationApi(config, bookId, ann.id);
    } catch (e) {
      if (isAuthError(e)) throw e;
      hadFailures = true;
    }
  }
  return hadFailures;
}

async function pushLocalBookmarks(
  config: ServerConfig,
  bookId: string,
  bookmarks: OfflineReaderData['bookmarks'],
  deletedPositions: Set<string>,
  serverBookmarks: Awaited<ReturnType<typeof fetchReaderBookmarks>>,
): Promise<{
  bookmarks: OfflineReaderData['bookmarks'];
  deletedPositions: string[];
  hadFailures: boolean;
}> {
  const next = [...bookmarks];
  const serverPositions = new Set(serverBookmarks.map((b) => b.position));
  const remainingTombstones = new Set<string>();
  let hadFailures = false;

  for (const bm of serverBookmarks) {
    if (!deletedPositions.has(bm.position)) continue;
    try {
      await deleteReaderBookmarkApi(config, bookId, bm.id);
      serverPositions.delete(bm.position);
    } catch (e) {
      if (isAuthError(e)) throw e;
      remainingTombstones.add(bm.position);
      hadFailures = true;
    }
  }

  if (
    next.length === 0 &&
    serverBookmarks.length > 0 &&
    deletedPositions.size > 0 &&
    serverBookmarks.every((bookmark) => deletedPositions.has(bookmark.position))
  ) {
    const wipeFailed = await deleteAllServerBookmarks(config, bookId, serverBookmarks);
    return {
      bookmarks: next,
      deletedPositions: wipeFailed ? [...deletedPositions] : [],
      hadFailures: wipeFailed,
    };
  }

  for (const bm of next) {
    if (!bm.position || serverPositions.has(bm.position) || deletedPositions.has(bm.position)) continue;
    try {
      const serverId = await addReaderBookmarkApi(config, bookId, bm.position, bm.title || '');
      bm.id = serverId;
      serverPositions.add(bm.position);
    } catch (e) {
      if (isAuthError(e)) throw e;
      hadFailures = true;
    }
  }

  return {
    bookmarks: next,
    deletedPositions: [...remainingTombstones],
    hadFailures,
  };
}

async function pushLocalAnnotations(
  config: ServerConfig,
  bookId: string,
  annotations: OfflineReaderData['annotations'],
  deletedCfis: Set<string>,
  serverAnnotations: Awaited<ReturnType<typeof fetchReaderAnnotations>>,
): Promise<{
  annotations: OfflineReaderData['annotations'];
  deletedCfis: string[];
  hadFailures: boolean;
}> {
  const next = [...annotations];
  const serverCfis = new Set(serverAnnotations.map((a) => a.cfi));
  const remainingTombstones = new Set<string>();
  let hadFailures = false;

  for (const ann of serverAnnotations) {
    if (!deletedCfis.has(ann.cfi)) continue;
    try {
      await deleteReaderAnnotationApi(config, bookId, ann.id);
      serverCfis.delete(ann.cfi);
    } catch (e) {
      if (isAuthError(e)) throw e;
      remainingTombstones.add(ann.cfi);
      hadFailures = true;
    }
  }

  if (
    next.length === 0 &&
    serverAnnotations.length > 0 &&
    deletedCfis.size > 0 &&
    serverAnnotations.every((annotation) => deletedCfis.has(annotation.cfi))
  ) {
    const wipeFailed = await deleteAllServerAnnotations(config, bookId, serverAnnotations);
    return {
      annotations: next,
      deletedCfis: wipeFailed ? [...deletedCfis] : [],
      hadFailures: wipeFailed,
    };
  }

  for (const ann of next) {
    if (!ann.cfi || deletedCfis.has(ann.cfi)) continue;
    const serverAnn = serverAnnotations.find((a) => a.cfi === ann.cfi);
    if (serverAnn) {
      const note = ann.note || '';
      const color = ann.color || 'yellow';
      const serverNote = serverAnn.note || '';
      const serverColor = serverAnn.color || 'yellow';
      ann.id = serverAnn.id;
      if (note !== serverNote || color !== serverColor) {
        try {
          await patchReaderAnnotationApi(config, bookId, serverAnn.id, { note, color });
        } catch (e) {
          if (isAuthError(e)) throw e;
          hadFailures = true;
        }
      }
      continue;
    }
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
    } catch (e) {
      if (isAuthError(e)) throw e;
      hadFailures = true;
    }
  }

  return {
    annotations: next,
    deletedCfis: [...remainingTombstones],
    hadFailures,
  };
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

  let positionFetchOk = false;
  try {
    serverPos = await fetchReadingPosition(config, bookId);
    positionFetchOk = true;
  } catch (e) {
    if (isAuthError(e)) throw e;
    // Network/timeout: do not invent revision 0 (false conflict prompts).
    // With skipPosition, still sync bookmarks/annotations using default serverPos.
    if (!options?.skipPosition) return;
  }

  try {
    [serverBookmarks, serverAnnotations] = await Promise.all([
      fetchReaderBookmarks(config, bookId),
      fetchReaderAnnotations(config, bookId),
    ]);
  } catch (e) {
    if (isAuthError(e)) throw e;
    // Failed collection fetch must not fall through as empty arrays (would wipe local).
    return;
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
  let bookmarksPushFailed = false;
  let annotationsPushFailed = false;
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
    const pushed = await pushLocalBookmarks(
      config,
      bookId,
      bookmarks,
      deletedBmPositions,
      serverBookmarks,
    );
    bookmarks = pushed.bookmarks;
    deletedBookmarkPositions = pushed.deletedPositions;
    bookmarksPushFailed = pushed.hadFailures;
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
    const pushed = await pushLocalAnnotations(
      config,
      bookId,
      annotations,
      deletedAnnCfis,
      serverAnnotations,
    );
    annotations = pushed.annotations;
    deletedAnnotationCfis = pushed.deletedCfis;
    annotationsPushFailed = pushed.hadFailures;
  }

  // После push локальных закладок/заметок meta до push устаревает (часто EPOCH).
  // Иначе badges считают localChangedAt > serverRev вечно.
  let bookmarksRevStored = syncMeta.bookmarksRev;
  let annotationsRevStored = syncMeta.annotationsRev;
  let bookmarkCountStored = serverBookmarksNewer ? syncMeta.bookmarkCount : bookmarks.length;
  let annotationCountStored = serverAnnotationsNewer ? syncMeta.annotationCount : annotations.length;
  if ((!serverBookmarksNewer && !bookmarksPushFailed) || (!serverAnnotationsNewer && !annotationsPushFailed)) {
    const refreshed = await fetchReaderBookSyncMeta(config, bookId).catch((e) => {
      if (isAuthError(e)) throw e;
      return null;
    });
    if (refreshed) {
      if (!serverBookmarksNewer && !bookmarksPushFailed) {
        bookmarksRevStored = refreshed.bookmarksRev || bookmarksRevStored;
        bookmarkCountStored = refreshed.bookmarkCount;
      }
      if (!serverAnnotationsNewer && !annotationsPushFailed) {
        annotationsRevStored = refreshed.annotationsRev || annotationsRevStored;
        annotationCountStored = refreshed.annotationCount;
      }
    } else {
      if (!serverBookmarksNewer && !bookmarksPushFailed) {
        bookmarksRevStored = localBookmarksRev({ ...local, bookmarksChangedAt: local.bookmarksChangedAt });
      }
      if (!serverAnnotationsNewer && !annotationsPushFailed) {
        annotationsRevStored = localAnnotationsRev({ ...local, annotationsChangedAt: local.annotationsChangedAt });
      }
    }
  }
  // Failed pushes: keep local changedAt so the next sync retries.
  if (!serverBookmarksNewer && bookmarksPushFailed) {
    bookmarksRevStored = localBookmarksRev(local);
  }
  if (!serverAnnotationsNewer && annotationsPushFailed) {
    annotationsRevStored = localAnnotationsRev(local);
  }

  const serverProgress = serverPos.progress || 0;
  const serverPosUpdatedAt = serverPos.updatedAt || syncMeta.positionUpdatedAt || null;
  const serverFrac = serverPos.fraction != null && Number.isFinite(Number(serverPos.fraction))
    ? normalizeReadingFraction(Number(serverPos.fraction))
    : progressToFraction(serverProgress);

  if (options?.skipPosition) {
    const fresh = readOfflineReaderData(bookId);
    const baseBmAt = parseSyncTs(local.bookmarksChangedAt);
    const baseAnnAt = parseSyncTs(local.annotationsChangedAt);
    const keepFreshBm = parseSyncTs(fresh.bookmarksChangedAt) > baseBmAt;
    const keepFreshAnn = parseSyncTs(fresh.annotationsChangedAt) > baseAnnAt;
    writeOfflineReaderData(bookId, {
      ...fresh,
      bookmarks: keepFreshBm ? fresh.bookmarks : bookmarks,
      annotations: keepFreshAnn ? fresh.annotations : annotations,
      deletedBookmarkPositions: keepFreshBm
        ? (fresh.deletedBookmarkPositions || [])
        : deletedBookmarkPositions,
      deletedAnnotationCfis: keepFreshAnn
        ? (fresh.deletedAnnotationCfis || [])
        : deletedAnnotationCfis,
      bookmarksChangedAt: keepFreshBm ? fresh.bookmarksChangedAt : bookmarksRevStored,
      annotationsChangedAt: keepFreshAnn ? fresh.annotationsChangedAt : annotationsRevStored,
      // Always stamp real server rev — do not mark unsynced in-flight edits as synced.
      serverBookmarksRev: bookmarksRevStored,
      serverAnnotationsRev: annotationsRevStored,
      serverBookmarkCount: bookmarkCountStored,
      serverAnnotationCount: annotationCountStored,
      ...(positionFetchOk
        ? {
            serverPositionUpdatedAt: serverPosUpdatedAt,
            serverPositionProgress: serverProgress,
            serverPositionFraction: serverFrac,
          }
        : {}),
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
  // Same rule as finalizeReadingPositionSync: a deferred prompt must keep
  // local coordinates until the user answers — after-close sync must not pull.
  const deferPendingPrompt =
    Boolean(local.pendingCrossDevicePrompt)
    && !(local.positionDirty && localHasMeaningfulPosition(local));
  const useServerPosition =
    !deferPendingPrompt
    && (
      (
        !local.positionDirty
        && local.dismissedServerRevision !== serverRevision
        && serverRevision > baseRevision
      )
      || (
        Boolean(local.positionDirty)
        && serverRevision !== baseRevision
        && !positionsDiffer(local, serverPos)
      )
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
      } else if (isAuthError(error)) {
        throw error;
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
      bookmarksChangedAt: bookmarksRevStored,
      annotationsChangedAt: annotationsRevStored,
      positionChangedAt: useServerPosition
        ? serverPosUpdatedAtStored || local.positionChangedAt
        : local.positionChangedAt,
      serverBookmarksRev: bookmarksRevStored,
      serverAnnotationsRev: annotationsRevStored,
      serverPositionUpdatedAt: serverPosUpdatedAtStored,
      serverBookmarkCount: bookmarkCountStored,
      serverAnnotationCount: annotationCountStored,
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
    }, local),
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
    } catch (e) {
      if (isAuthError(e)) throw e;
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
