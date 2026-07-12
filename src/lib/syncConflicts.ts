import {
  addSyncConflict,
  listSyncConflicts,
  removeSyncConflict,
  type SyncConflictRecord,
} from './localDb';
import { readOfflineReaderData, writeOfflineReaderData } from './offlineReaderStore';
import type { PositionMergeInput } from './syncMerge';
import { parseSyncTs } from './readerActivitySync';
import { saveReadingPosition } from './inpxClient';
import type { ServerConfig } from '../types';

export type { SyncConflictRecord };

/** Both sides changed progress with comparable timestamps — needs user choice. */
export function detectPositionConflict(input: PositionMergeInput): boolean {
  if (input.skipPosition) return false;
  const localTs = parseSyncTs(input.localPositionRev);
  const serverTs = parseSyncTs(input.serverPosUpdatedAt);
  if (localTs <= 0 || serverTs <= 0) return false;
  const localFrac = input.localFraction;
  const serverFrac = input.serverFraction;
  if (Math.abs(localFrac - serverFrac) <= 0.02) return false;
  return localTs > 0 && serverTs > 0 && Math.abs(localTs - serverTs) < 120_000;
}

export async function recordPositionConflict(
  bookId: string,
  input: PositionMergeInput,
): Promise<void> {
  await addSyncConflict(bookId, 'position', {
    fraction: input.localFraction,
    positionRev: input.localPositionRev,
  }, {
    fraction: input.serverFraction,
    progress: input.serverProgress,
    position: input.serverPosition,
    updatedAt: input.serverPosUpdatedAt,
  });
}

export async function resolveSyncConflictUseServer(
  config: ServerConfig,
  conflict: SyncConflictRecord,
): Promise<void> {
  if (conflict.conflictType === 'position') {
    const server = JSON.parse(conflict.serverJson) as {
      fraction?: number;
      progress?: number;
      position?: string;
      updatedAt?: string | null;
    };
    const data = readOfflineReaderData(conflict.bookId);
    const fraction = Number(server.fraction) || 0;
    writeOfflineReaderData(conflict.bookId, {
      ...data,
      progress: Number(server.progress) || fraction * 100,
      position: server.position || data.position,
      serverPositionUpdatedAt: server.updatedAt || new Date().toISOString(),
      positionChangedAt: server.updatedAt || data.positionChangedAt,
    });
  }
  await removeSyncConflict(conflict.id);
}

export async function resolveSyncConflictKeepLocal(
  config: ServerConfig,
  conflict: SyncConflictRecord,
): Promise<void> {
  if (conflict.conflictType === 'position') {
    const local = JSON.parse(conflict.localJson) as { fraction?: number };
    const data = readOfflineReaderData(conflict.bookId);
    const fraction = Number(local.fraction) || data.progress / 100;
    await saveReadingPosition(config, conflict.bookId, data.position || '', Math.round(fraction * 100), fraction);
    writeOfflineReaderData(conflict.bookId, {
      ...data,
      serverPositionUpdatedAt: new Date().toISOString(),
    });
  }
  await removeSyncConflict(conflict.id);
}

export async function getSyncConflicts(): Promise<SyncConflictRecord[]> {
  return listSyncConflicts();
}
