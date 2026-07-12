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
  saveReadingPosition,
} from './inpxClient';
import { ServerConfig } from '../types';
import { OfflineReaderData, applyNewerLocalPositionIfNeeded, primeReaderLocalStorage, readOfflineReaderData, writeOfflineReaderData } from './offlineReaderStore';
import {
  applyServerActivitySyncMeta,
  buildSyncActivityOptions,
  readReaderActivitySync,
} from './readerActivitySync';
import {
  fractionToProgress,
  isServerCollectionNewer,
  normalizeReadingFraction,
  progressToFraction,
  shouldPushLocalPosition,
  shouldUseServerPosition,
  SYNC_EPOCH,
} from './syncMerge';
import { detectPositionConflict, recordPositionConflict } from './syncConflicts';

function localBookmarksRev(data: OfflineReaderData): string {
  return data.bookmarksChangedAt || data.updatedAt || SYNC_EPOCH;
}

function localAnnotationsRev(data: OfflineReaderData): string {
  return data.annotationsChangedAt || data.updatedAt || SYNC_EPOCH;
}

function localPositionRev(data: OfflineReaderData): string {
  return data.positionChangedAt || data.updatedAt || SYNC_EPOCH;
}

function serverFractionFromPos(serverPos: Awaited<ReturnType<typeof fetchReadingPosition>>): number {
  if (serverPos.fraction != null && Number.isFinite(Number(serverPos.fraction))) {
    return normalizeReadingFraction(Number(serverPos.fraction));
  }
  return progressToFraction(serverPos.progress || 0);
}

function localFractionFromData(local: OfflineReaderData): number {
  if (local.fraction != null && Number.isFinite(Number(local.fraction))) {
    return normalizeReadingFraction(Number(local.fraction));
  }
  return progressToFraction(local.progress || 0);
}

function buildPositionMergeInput(
  local: OfflineReaderData,
  serverPos: Awaited<ReturnType<typeof fetchReadingPosition>>,
): Parameters<typeof shouldUseServerPosition>[0] {
  const serverFrac = serverFractionFromPos(serverPos);
  return {
    localFraction: localFractionFromData(local),
    localPositionRev: localPositionRev(local),
    localHasPaginator: false,
    serverFraction: serverFrac,
    serverProgress: serverPos.progress || 0,
    serverPosition: serverPos.position || '',
    serverPosUpdatedAt: serverPos.updatedAt || null,
    localServerPositionUpdatedAt: local.serverPositionUpdatedAt ?? null,
    localServerPositionProgress: local.serverPositionProgress ?? 0,
  };
}

function applyServerPositionToLocal(
  local: OfflineReaderData,
  serverPos: Awaited<ReturnType<typeof fetchReadingPosition>>,
): OfflineReaderData {
  const fraction = serverFractionFromPos(serverPos);
  const progress = fractionToProgress(fraction);
  return {
    ...local,
    position: serverPos.position || null,
    progress,
    fraction,
    fb2Href: serverPos.fb2Href ? String(serverPos.fb2Href) : null,
    sectionIndex: null,
    sectionPageFraction: null,
    paginatorPage: null,
    paginatorPages: null,
    layoutMode: null,
    positionChangedAt: serverPos.updatedAt || new Date().toISOString(),
    serverPositionUpdatedAt: serverPos.updatedAt || null,
    serverPositionProgress: serverPos.progress || 0,
  };
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

/** Подтянуть позицию с сервера перед открытием, если она впереди локальной. */
export async function pullServerPositionIfAhead(config: ServerConfig, bookId: string): Promise<boolean> {
  let serverPos: Awaited<ReturnType<typeof fetchReadingPosition>>;
  let syncMeta: Awaited<ReturnType<typeof fetchReaderBookSyncMeta>> | null = null;
  try {
    [serverPos, syncMeta] = await Promise.all([
      fetchReadingPosition(config, bookId),
      fetchReaderBookSyncMeta(config, bookId).catch(() => null),
    ]);
  } catch {
    return false;
  }
  serverPos = enrichServerPosition(serverPos, syncMeta);
  const local = readOfflineReaderData(bookId);
  const mergeInput = buildPositionMergeInput(local, serverPos);
  if (!shouldUseServerPosition(mergeInput)) return false;
  applyServerPositionPull(bookId, local, serverPos);
  return true;
}

/** При закрытии читалки: подтянуть с сервера, если впереди; иначе пушить только если локально впереди. */
export async function finalizeReadingPositionSync(
  config: ServerConfig,
  bookId: string,
  options?: { canPushRead?: boolean },
): Promise<'pulled' | 'pushed' | 'noop'> {
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
  const mergeInput = buildPositionMergeInput(local, serverPos);

  if (shouldUseServerPosition(mergeInput)) {
    applyServerPositionPull(bookId, local, serverPos);
    return 'pulled';
  }

  const localFrac = localFractionFromData(local);
  const hasMeaningfulPosition =
    localFrac > 0.02
    || Boolean(local.fb2Href?.trim())
    || Boolean(local.position?.trim());
  if (!hasMeaningfulPosition) return 'noop';

  if (!shouldPushLocalPosition(mergeInput, local.progress, options?.canPushRead !== false)) {
    return 'noop';
  }

  try {
    await saveReadingPosition(
      config,
      bookId,
      local.position || '',
      local.progress,
      local.fraction ?? undefined,
      local.fb2Href ?? undefined,
      {
        sectionIndex: local.sectionIndex ?? undefined,
        sectionPageFraction: local.sectionPageFraction ?? undefined,
        paginatorPage: local.paginatorPage ?? undefined,
        paginatorPages: local.paginatorPages ?? undefined,
        layoutMode: local.layoutMode ?? undefined,
      },
    );
    return 'pushed';
  } catch {
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

  let serverPos: Awaited<ReturnType<typeof fetchReadingPosition>> = { position: '', progress: 0 };
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
    });
    return;
  }

  const serverFrac = serverPos.fraction != null && Number.isFinite(Number(serverPos.fraction))
    ? normalizeReadingFraction(Number(serverPos.fraction))
    : progressToFraction(serverProgress);
  const localFrac = fraction;

  const localHasPaginator = local.paginatorPage != null && Number.isFinite(Number(local.paginatorPage));
  const mergeInput = {
    skipPosition: options?.skipPosition,
    localFraction: localFrac,
    localPositionRev: localPositionRev(local),
    localHasPaginator,
    serverFraction: serverFrac,
    serverProgress,
    serverPosition: serverPos.position || '',
    serverPosUpdatedAt,
    localServerPositionUpdatedAt: local.serverPositionUpdatedAt ?? null,
    localServerPositionProgress: local.serverPositionProgress ?? 0,
  };
  if (detectPositionConflict(mergeInput)) {
    await recordPositionConflict(bookId, mergeInput);
  }
  const useServerPosition = shouldUseServerPosition(mergeInput);

  let sectionIndex = local.sectionIndex ?? null;
  let sectionPageFraction = local.sectionPageFraction ?? null;
  let paginatorPage = local.paginatorPage ?? null;
  let paginatorPages = local.paginatorPages ?? null;
  let layoutModeStored = local.layoutMode ?? null;

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
  } else if (
    !options?.neverPushPosition
    && shouldPushLocalPosition(mergeInput, progress, activity?.shouldPushReadState !== false)
  ) {
    try {
      await saveReadingPosition(config, bookId, position || '', progress, fraction, fb2Href, {
        sectionIndex,
        sectionPageFraction,
        paginatorPage,
        paginatorPages,
        layoutMode: layoutModeStored,
      });
    } catch {
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
        ? serverPosUpdatedAt || local.positionChangedAt
        : local.positionChangedAt,
      serverBookmarksRev: syncMeta.bookmarksRev,
      serverAnnotationsRev: syncMeta.annotationsRev,
      serverPositionUpdatedAt: serverPosUpdatedAt,
      serverBookmarkCount: syncMeta.bookmarkCount,
      serverAnnotationCount: syncMeta.annotationCount,
      serverPositionProgress: serverProgress,
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
