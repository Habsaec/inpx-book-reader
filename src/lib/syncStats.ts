import { getPendingSyncOps, getFailedSyncOps } from './localDb';
import { readOfflineReaderData } from './offlineReaderStore';

export interface SyncPendingBreakdown {
  queueTotal: number;
  queueByType: Record<string, number>;
  progressBooks: number;
  bookmarkBooks: number;
  annotationBooks: number;
  totalPending: number;
  failedOps: Array<{ id: number; opType: string; bookId: string | null; attempts: number }>;
}

const OP_LABELS: Record<string, string> = {
  remove_history: 'История',
  progress: 'Прогресс',
  bookmark: 'Закладки',
  annotation: 'Заметки',
  read: 'Прочитано',
};

export function syncOpLabel(opType: string): string {
  return OP_LABELS[opType] || opType;
}

function hasPendingPosition(bookId: string): boolean {
  const data = readOfflineReaderData(bookId);
  if (data.pendingCrossDevicePrompt) return true;
  if (data.positionDirty) return true;
  const base = data.baseRevision ?? 0;
  const server = data.serverRevision ?? 0;
  if (server > base && data.dismissedServerRevision !== server) return true;
  return false;
}

function hasPendingBookmarks(bookId: string): boolean {
  const data = readOfflineReaderData(bookId);
  if (!data.bookmarksChangedAt) return false;
  const deletes = data.deletedBookmarkPositions?.length ?? 0;
  if (!data.serverBookmarksRev) {
    return data.bookmarks.length > 0 || deletes > 0;
  }
  // После sync счётки совпали, а rev на клиенте мог остаться «грязным» (EPOCH vs ISO).
  if (
    deletes === 0
    && data.serverBookmarkCount != null
    && data.serverBookmarkCount >= 0
    && data.serverBookmarkCount === data.bookmarks.length
  ) {
    return false;
  }
  return data.bookmarksChangedAt > data.serverBookmarksRev;
}

function hasPendingAnnotations(bookId: string): boolean {
  const data = readOfflineReaderData(bookId);
  if (!data.annotationsChangedAt) return false;
  const deletes = data.deletedAnnotationCfis?.length ?? 0;
  if (!data.serverAnnotationsRev) {
    return data.annotations.length > 0 || deletes > 0;
  }
  if (
    deletes === 0
    && data.serverAnnotationCount != null
    && data.serverAnnotationCount >= 0
    && data.serverAnnotationCount === data.annotations.length
  ) {
    return false;
  }
  return data.annotationsChangedAt > data.serverAnnotationsRev;
}

export function summarizeReaderSyncPending(bookIds: string[]): Pick<
  SyncPendingBreakdown,
  'progressBooks' | 'bookmarkBooks' | 'annotationBooks'
> {
  let progressBooks = 0;
  let bookmarkBooks = 0;
  let annotationBooks = 0;
  for (const id of bookIds) {
    if (hasPendingPosition(id)) progressBooks++;
    if (hasPendingBookmarks(id)) bookmarkBooks++;
    if (hasPendingAnnotations(id)) annotationBooks++;
  }
  return { progressBooks, bookmarkBooks, annotationBooks };
}

export function bookHasPendingSync(bookId: string): boolean {
  return (
    hasPendingPosition(bookId) ||
    hasPendingBookmarks(bookId) ||
    hasPendingAnnotations(bookId)
  );
}

export async function getSyncPendingBreakdown(bookIds: string[]): Promise<SyncPendingBreakdown> {
  const ops = await getPendingSyncOps();
  const failed = await getFailedSyncOps(3);
  const queueByType: Record<string, number> = {};
  for (const op of ops) {
    queueByType[op.opType] = (queueByType[op.opType] || 0) + 1;
  }
  const reader = summarizeReaderSyncPending(bookIds);
  const queueTotal = ops.length;
  const booksWithQueue = new Set(
    ops.map((op) => op.bookId).filter((id): id is string => Boolean(id)),
  );
  let readerOnlyBooks = 0;
  for (const id of bookIds) {
    if (bookHasPendingSync(id) && !booksWithQueue.has(id)) readerOnlyBooks++;
  }
  return {
    queueTotal,
    queueByType,
    ...reader,
    // Avoid double-counting the same book in queue + offline reader dirty.
    totalPending: queueTotal + readerOnlyBooks,
    failedOps: failed.map((f) => ({
      id: f.id,
      opType: f.opType,
      bookId: f.bookId,
      attempts: f.attempts,
    })),
  };
}

/** Header badge: only cross-device conflicts + failed queue ops (not routine dirty). */
export function countCrossDeviceConflicts(bookIds: string[]): number {
  let n = 0;
  for (const id of bookIds) {
    if (readOfflineReaderData(id).pendingCrossDevicePrompt) n++;
  }
  return n;
}

export async function getSyncAttentionCount(bookIds: string[]): Promise<number> {
  const failed = await getFailedSyncOps(3);
  return failed.length + countCrossDeviceConflicts(bookIds);
}
