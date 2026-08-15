import type { ServerConfig } from '../types';
import { isAuthError } from './inpxClient';
import {
  syncPositionOnBookOpen,
  type CrossDevicePositionChoice,
} from './offlineSync';

export type BookOpenOnlineSyncResult = {
  positionChoice: CrossDevicePositionChoice | null;
  /** True when sync threw after optional position prompt — open must continue locally. */
  syncFailed: boolean;
};

/** Online prelude for reader open. Callers must not await this before mounting the reader. */
export async function runBookOpenOnlineSync(
  canReadOnline: boolean,
  serverConfig: ServerConfig,
  bookId: string,
  initialPosition: string | null | undefined,
  deps: {
    syncPosition?: typeof syncPositionOnBookOpen;
    syncReaderData: (bookId: string) => Promise<void>;
    /** Same as web `/lite/read/:id` — shelves «Читаю» / continue use reading_history. */
    recordReadingHistory?: (bookId: string) => Promise<void>;
    yieldForUi?: () => Promise<void>;
    /** Return false to abort mid-sync (close / reopen generation). */
    shouldContinue?: () => boolean;
  },
): Promise<BookOpenOnlineSyncResult> {
  if (!canReadOnline) {
    return { positionChoice: null, syncFailed: false };
  }

  const syncPosition = deps.syncPosition ?? syncPositionOnBookOpen;
  let positionChoice: CrossDevicePositionChoice | null = null;
  const alive = () => !deps.shouldContinue || deps.shouldContinue();

  try {
    if (deps.recordReadingHistory) {
      try {
        await deps.recordReadingHistory(bookId);
      } catch (e) {
        if (isAuthError(e)) throw e;
      }
      if (!alive()) return { positionChoice: null, syncFailed: false };
    }
    if (!initialPosition?.trim()) {
      if (deps.yieldForUi) await deps.yieldForUi();
      if (!alive()) return { positionChoice: null, syncFailed: false };
      positionChoice = await syncPosition(serverConfig, bookId);
    }
    if (!alive()) return { positionChoice, syncFailed: false };
    await deps.syncReaderData(bookId);
    if (!alive()) return { positionChoice, syncFailed: false };
    return { positionChoice, syncFailed: false };
  } catch (e) {
    if (isAuthError(e)) throw e;
    return { positionChoice, syncFailed: true };
  }
}
