import type { ServerConfig } from '../types';
import {
  syncPositionOnBookOpen,
  type CrossDevicePositionChoice,
} from './offlineSync';

export type BookOpenOnlineSyncResult = {
  positionChoice: CrossDevicePositionChoice | null;
  /** True when sync threw after optional position prompt — open must continue locally. */
  syncFailed: boolean;
};

/** Online-only prelude before mounting the reader; must never block opening the book file. */
export async function runBookOpenOnlineSync(
  canReadOnline: boolean,
  serverConfig: ServerConfig,
  bookId: string,
  initialPosition: string | null | undefined,
  deps: {
    syncPosition?: typeof syncPositionOnBookOpen;
    syncReaderData: (bookId: string) => Promise<void>;
    yieldForUi?: () => Promise<void>;
  },
): Promise<BookOpenOnlineSyncResult> {
  if (!canReadOnline) {
    return { positionChoice: null, syncFailed: false };
  }

  const syncPosition = deps.syncPosition ?? syncPositionOnBookOpen;
  let positionChoice: CrossDevicePositionChoice | null = null;

  try {
    if (!initialPosition?.trim()) {
      if (deps.yieldForUi) await deps.yieldForUi();
      positionChoice = await syncPosition(serverConfig, bookId);
    }
    await deps.syncReaderData(bookId);
    return { positionChoice, syncFailed: false };
  } catch {
    return { positionChoice, syncFailed: true };
  }
}
