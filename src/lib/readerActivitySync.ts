import { APP_SETTING_KEYS, getAppSettingJson, setAppSettingJson } from './appSettings';

export interface ReaderActivitySyncState {
  /** Last local reading-history mutation (reader closed, etc.). */
  readingHistoryLocalRev: string | null;
  /** Last local read-books mutation. */
  readBooksLocalRev: string | null;
  /** Server revs observed on last pull. */
  lastServerReadingHistoryRev: string | null;
  lastServerReadBooksRev: string | null;
  lastServerReadingHistoryCount: number;
  lastServerReadBookCount: number;
}

const EMPTY: ReaderActivitySyncState = {
  readingHistoryLocalRev: null,
  readBooksLocalRev: null,
  lastServerReadingHistoryRev: null,
  lastServerReadBooksRev: null,
  lastServerReadingHistoryCount: -1,
  lastServerReadBookCount: -1,
};

export function readReaderActivitySync(): ReaderActivitySyncState {
  const parsed = getAppSettingJson<Partial<ReaderActivitySyncState>>(APP_SETTING_KEYS.readerActivitySync, {});
  return { ...EMPTY, ...parsed };
}

export function writeReaderActivitySync(state: ReaderActivitySyncState): void {
  setAppSettingJson(APP_SETTING_KEYS.readerActivitySync, state);
}

export function touchReadingHistoryLocalRev(): string {
  const now = new Date().toISOString();
  const state = readReaderActivitySync();
  writeReaderActivitySync({ ...state, readingHistoryLocalRev: now });
  return now;
}

export function touchReadBooksLocalRev(): string {
  const now = new Date().toISOString();
  const state = readReaderActivitySync();
  writeReaderActivitySync({ ...state, readBooksLocalRev: now });
  return now;
}

export function applyServerActivitySyncMeta(meta: {
  readingHistoryRev: string;
  readBooksRev: string;
  readingHistoryCount: number;
  readBookCount: number;
}): void {
  const state = readReaderActivitySync();
  writeReaderActivitySync({
    ...state,
    lastServerReadingHistoryRev: meta.readingHistoryRev,
    lastServerReadBooksRev: meta.readBooksRev,
    lastServerReadingHistoryCount: meta.readingHistoryCount,
    lastServerReadBookCount: meta.readBookCount,
  });
}

export function parseSyncTs(iso: string | null | undefined): number {
  if (!iso) return 0;
  let t = Date.parse(iso);
  if (!Number.isFinite(t)) {
    const sqlite = String(iso).trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(sqlite)) {
      t = Date.parse(`${sqlite.replace(' ', 'T')}Z`);
    }
  }
  return Number.isFinite(t) ? t : 0;
}

/** True when server-side reading history was cleared/changed after our last local edit. */
export function isServerReadingHistoryNewer(
  state: ReaderActivitySyncState,
  serverRev: string,
  serverCount: number,
): boolean {
  const serverTs = parseSyncTs(serverRev);
  const localTs = parseSyncTs(state.readingHistoryLocalRev);
  if (serverTs > localTs) return true;
  if (
    serverCount === 0 &&
    state.lastServerReadingHistoryCount > 0 &&
    serverTs >= parseSyncTs(state.lastServerReadingHistoryRev)
  ) {
    return true;
  }
  return false;
}

/** True when server read-books list was cleared/changed after our last local edit. */
export function isServerReadBooksNewer(
  state: ReaderActivitySyncState,
  serverRev: string,
  serverCount: number,
): boolean {
  const serverTs = parseSyncTs(serverRev);
  const localTs = parseSyncTs(state.readBooksLocalRev);
  if (serverTs > localTs) return true;
  if (
    serverCount === 0 &&
    state.lastServerReadBookCount > 0 &&
    serverTs >= parseSyncTs(state.lastServerReadBooksRev)
  ) {
    return true;
  }
  return false;
}

export function shouldPushReadingHistory(
  state: ReaderActivitySyncState,
  serverRev: string,
  serverCount: number,
  bookLocalUpdatedAt: string | null | undefined,
): boolean {
  if (isServerReadingHistoryNewer(state, serverRev, serverCount)) {
    return parseSyncTs(bookLocalUpdatedAt) > parseSyncTs(serverRev);
  }
  return true;
}

export function shouldPushReadState(
  state: ReaderActivitySyncState,
  serverRev: string,
  serverCount: number,
  bookLocalUpdatedAt: string | null | undefined,
): boolean {
  if (isServerReadBooksNewer(state, serverRev, serverCount)) {
    return parseSyncTs(bookLocalUpdatedAt) > parseSyncTs(serverRev);
  }
  return true;
}

export function buildSyncActivityOptions(
  state: ReaderActivitySyncState,
  meta: {
    readingHistoryRev: string;
    readBooksRev: string;
    readingHistoryCount: number;
    readBookCount: number;
  } | null,
  bookLocalUpdatedAt?: string | null,
): { shouldPushReadingHistory: boolean; shouldPushReadState: boolean } {
  if (!meta) {
    return { shouldPushReadingHistory: true, shouldPushReadState: true };
  }
  return {
    shouldPushReadingHistory: shouldPushReadingHistory(
      state,
      meta.readingHistoryRev,
      meta.readingHistoryCount,
      bookLocalUpdatedAt,
    ),
    shouldPushReadState: shouldPushReadState(
      state,
      meta.readBooksRev,
      meta.readBookCount,
      bookLocalUpdatedAt,
    ),
  };
}
