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
  if (data.positionDirty) return true;
  const base = data.baseRevision ?? 0;
  const server = data.serverRevision ?? 0;
  if (base < server) return true;
  if (!data.positionChangedAt) return false;
  if (!data.serverPositionUpdatedAt) return true;
  return data.positionChangedAt > data.serverPositionUpdatedAt;
}

function hasPendingBookmarks(bookId: string): boolean {
  const data = readOfflineReaderData(bookId);
  if (!data.bookmarksChangedAt) return false;
  if (!data.serverBookmarksRev) return data.bookmarks.length > 0 || (data.deletedBookmarkPositions?.length ?? 0) > 0;
  return data.bookmarksChangedAt > data.serverBookmarksRev;
}

function hasPendingAnnotations(bookId: string): boolean {
  const data = readOfflineReaderData(bookId);
  if (!data.annotationsChangedAt) return false;
  if (!data.serverAnnotationsRev) return data.annotations.length > 0 || (data.deletedAnnotationCfis?.length ?? 0) > 0;
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
  const readerTotal = reader.progressBooks + reader.bookmarkBooks + reader.annotationBooks;
  return {
    queueTotal,
    queueByType,
    ...reader,
    totalPending: queueTotal + readerTotal,
    failedOps: failed.map((f) => ({
      id: f.id,
      opType: f.opType,
      bookId: f.bookId,
      attempts: f.attempts,
    })),
  };
}
