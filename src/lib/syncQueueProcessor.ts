import { deleteReadingHistoryApi, ensureBookReadState, isAuthError, isUnreachableServerError } from './inpxClient';
import type { ServerConfig } from '../types';
import {
  getPendingSyncOps,
  incrementSyncOpAttempts,
  removeSyncOp,
} from './localDb';

/** Stop hammering ops that keep failing (shown in Sync Center as failed). */
export const MAX_SYNC_OP_ATTEMPTS = 8;

/** Drop queued toggle_read for a book after a successful online toggle. */
export async function dropQueuedToggleReadOps(bookId: string): Promise<void> {
  const ops = await getPendingSyncOps();
  for (const op of ops) {
    if (op.opType === 'toggle_read' && op.bookId === bookId) {
      await removeSyncOp(op.id);
    }
  }
}

/** Drop queued remove_history so Undo/reopen does not re-delete later. */
export async function dropQueuedRemoveHistoryOps(bookId: string): Promise<void> {
  const ops = await getPendingSyncOps();
  for (const op of ops) {
    if (op.opType === 'remove_history' && op.bookId === bookId) {
      await removeSyncOp(op.id);
    }
  }
}

export async function processSyncQueue(config: ServerConfig): Promise<number> {
  const ops = await getPendingSyncOps();

  // Keep only the latest toggle_read per book — older desired states are stale.
  const latestToggleId = new Map<string, number>();
  for (const op of ops) {
    if (op.opType === 'toggle_read' && op.bookId) {
      latestToggleId.set(op.bookId, op.id);
    }
  }

  let processed = 0;
  for (const op of ops) {
    if (op.attempts >= MAX_SYNC_OP_ATTEMPTS) continue;
    if (op.opType === 'toggle_read' && op.bookId) {
      if (latestToggleId.get(op.bookId) !== op.id) {
        await removeSyncOp(op.id);
        continue;
      }
    }
    try {
      if (op.opType === 'remove_history' && op.bookId) {
        await deleteReadingHistoryApi(config, op.bookId);
      } else if (op.opType === 'toggle_read' && op.bookId) {
        let payload: { markRead?: boolean };
        try {
          payload = JSON.parse(op.payload || '{}') as { markRead?: boolean };
        } catch {
          // Poison pill: битый payload никогда не выполнится — выбрасываем,
          // а не сжигаем попытки и не держим очередь «вечно pending».
          await removeSyncOp(op.id);
          continue;
        }
        await ensureBookReadState(config, op.bookId, Boolean(payload.markRead));
      } else {
        await incrementSyncOpAttempts(op.id);
        continue;
      }
      await removeSyncOp(op.id);
      processed++;
    } catch (e) {
      if (isAuthError(e)) throw e;
      if (isUnreachableServerError(e)) break;
      await incrementSyncOpAttempts(op.id);
    }
  }
  return processed;
}
