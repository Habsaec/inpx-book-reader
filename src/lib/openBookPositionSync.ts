import {
  fetchReadingPosition,
  isAuthError,
  ReadingPositionConflictError,
  type ServerReadingPosition,
} from './inpxClient';
import {
  applyNewerLocalPositionIfNeeded,
  primeReaderLocalStorage,
  readOfflineReaderData,
  writeOfflineReaderData,
} from './offlineReaderStore';
import { writeServerSnapshotForDeferredPrompt } from './offlineSync';
import {
  localFractionFromData,
} from './positionApply';
import {
  pushReadingPositionWithRecovery,
  writePushSuccessFields,
} from './readingPositionPush';
import { sessionStatusFromActivityAt } from '../../public/inpx-reader/position-sync.js';
import {
  shouldPromptLiveCrossDevice,
  shouldRetryPositionConflict,
  adoptConflictBaseRevision,
} from '../../public/inpx-reader/reader-shared/position-revision.js';
import type { ServerConfig } from '../types';

export const OPEN_BOOK_POSITION_POLL_MS = 15_000;

export function createPositionSessionId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function ensureOpenBookPositionSession(bookId: string, sessionId: string): void {
  const local = readOfflineReaderData(bookId);
  if (local.positionSessionId === sessionId) return;
  writeOfflineReaderData(bookId, { ...local, positionSessionId: sessionId });
}

export type OpenBookPositionSyncResult = 'pushed' | 'prompt' | 'idle' | 'noop' | 'conflict';

function storeLivePrompt(
  bookId: string,
  serverPos: ServerReadingPosition,
): void {
  const local = readOfflineReaderData(bookId);
  writeOfflineReaderData(
    bookId,
    applyNewerLocalPositionIfNeeded(
      bookId,
      writeServerSnapshotForDeferredPrompt(local, serverPos),
      local,
    ),
  );
  primeReaderLocalStorage(bookId);
}

export async function syncOpenBookPosition(
  config: ServerConfig,
  bookId: string,
  sessionId: string,
): Promise<OpenBookPositionSyncResult> {
  ensureOpenBookPositionSession(bookId, sessionId);
  let serverPos: ServerReadingPosition;
  try {
    serverPos = await fetchReadingPosition(config, bookId);
  } catch (error) {
    if (isAuthError(error)) throw error;
    return 'noop';
  }

  const local = readOfflineReaderData(bookId);
  if (shouldPromptLiveCrossDevice(sessionId, local, serverPos)) {
    storeLivePrompt(bookId, serverPos);
    return 'prompt';
  }

  if (sessionStatusFromActivityAt(local.lastUserActivityAt) === 'idle') {
    return 'idle';
  }
  if (!local.positionDirty) return 'noop';

  const baseRevision = local.baseRevision ?? 0;
  const localFrac = localFractionFromData(local);
  try {
    const pushResult = await pushReadingPositionWithRecovery(config, bookId, {
      ...local,
      positionSessionId: sessionId,
    }, baseRevision);
    writeOfflineReaderData(
      bookId,
      applyNewerLocalPositionIfNeeded(bookId, {
        ...readOfflineReaderData(bookId),
        ...writePushSuccessFields(local, pushResult, localFrac),
        positionSessionId: sessionId,
      }, local),
    );
    return 'pushed';
  } catch (error) {
    if (error instanceof ReadingPositionConflictError) {
      const latest = readOfflineReaderData(bookId);
      if (shouldPromptLiveCrossDevice(sessionId, latest, error.current)) {
        storeLivePrompt(bookId, error.current);
        return 'prompt';
      }
      const adopted = adoptConflictBaseRevision(latest, error.current);
      writeOfflineReaderData(bookId, {
        ...latest,
        ...adopted,
        positionSessionId: sessionId,
      });
      if (shouldRetryPositionConflict(sessionId, error.current)) {
        try {
          const retryLocal = {
            ...readOfflineReaderData(bookId),
            positionSessionId: sessionId,
          };
          const retryResult = await pushReadingPositionWithRecovery(
            config,
            bookId,
            retryLocal,
            adopted.baseRevision,
          );
          writeOfflineReaderData(
            bookId,
            applyNewerLocalPositionIfNeeded(bookId, {
              ...readOfflineReaderData(bookId),
              ...writePushSuccessFields(retryLocal, retryResult, localFrac),
              positionSessionId: sessionId,
            }, retryLocal),
          );
          return 'pushed';
        } catch (retryError) {
          if (retryError instanceof ReadingPositionConflictError) {
            if (shouldPromptLiveCrossDevice(sessionId, readOfflineReaderData(bookId), retryError.current)) {
              storeLivePrompt(bookId, retryError.current);
              return 'prompt';
            }
            return 'conflict';
          }
          if (isAuthError(retryError)) throw retryError;
          return 'noop';
        }
      }
      return 'conflict';
    }
    if (isAuthError(error)) throw error;
    return 'noop';
  }
}
