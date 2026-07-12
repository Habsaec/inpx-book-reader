import { deleteReadingHistoryApi, toggleBookRead } from './inpxClient';
import type { ServerConfig } from '../types';
import {
  getPendingSyncOps,
  incrementSyncOpAttempts,
  removeSyncOp,
} from './localDb';

export async function processSyncQueue(config: ServerConfig): Promise<number> {
  const ops = await getPendingSyncOps();
  let processed = 0;
  for (const op of ops) {
    try {
      if (op.opType === 'remove_history' && op.bookId) {
        await deleteReadingHistoryApi(config, op.bookId);
      } else if (op.opType === 'toggle_read' && op.bookId) {
        const payload = JSON.parse(op.payload || '{}') as { markRead?: boolean };
        const isRead = await toggleBookRead(config, op.bookId);
        if (Boolean(payload.markRead) !== isRead) {
          await toggleBookRead(config, op.bookId);
        }
      } else {
        await incrementSyncOpAttempts(op.id);
        continue;
      }
      await removeSyncOp(op.id);
      processed++;
    } catch {
      await incrementSyncOpAttempts(op.id);
    }
  }
  return processed;
}
