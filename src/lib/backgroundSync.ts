/**
 * Silent in-app background sync — single pipeline, many triggers.
 * Not OS WorkManager; runs while the Capacitor process is alive.
 */
import type { ServerConfig } from '../types';
import {
  fetchReaderSyncIndex,
  isAuthError,
  type ReaderActivitySyncMeta,
  type ReaderSyncIndexBook,
} from './inpxClient';
import { flushOfflineReaderStore, readOfflineReaderData } from './offlineReaderStore';
import { syncOfflineReaderForBook } from './offlineSync';
import { processSyncQueue } from './syncQueueProcessor';
import {
  applyServerActivitySyncMeta,
  buildSyncActivityOptions,
  isServerReadBooksNewer,
  isServerReadingHistoryNewer,
  parseSyncTs,
  readReaderActivitySync,
} from './readerActivitySync';
import { bookHasPendingSync } from './syncStats';
import { getPendingSyncOps } from './localDb';
import { MAX_SYNC_OP_ATTEMPTS } from './syncQueueProcessor';

export type BackgroundSyncReason =
  | 'online'
  | 'resume'
  | 'connected'
  | 'periodic'
  | 'after-close'
  | 'manual';

export interface BackgroundSyncRequest {
  reason: BackgroundSyncReason;
  bookIds: string[];
  excludeBookId?: string | null;
  serverConfig: ServerConfig;
  refresh?: () => Promise<void>;
  onReaderStoreSynced?: () => void;
}

export interface BackgroundSyncResult {
  ok: boolean;
  skipped?: boolean;
  reason: BackgroundSyncReason;
  syncedBooks: number;
  queueProcessed: number;
  refreshed: boolean;
  error?: string;
  authExpired?: boolean;
}

export interface BackgroundSyncStatus {
  running: boolean;
  lastStartedAt: number;
  lastSuccessAt: number;
  lastError: string | null;
  backoffUntil: number;
}

const DEFAULT_MIN_GAP_MS = 4000;
const BACKOFF_MS = [5_000, 30_000, 120_000] as const;
const PERIODIC_STALE_MS = 5 * 60_000;

let minGapMs = DEFAULT_MIN_GAP_MS;
let running = false;
let pendingRerun: BackgroundSyncRequest | null = null;
let lastStartedAt = 0;
let lastSuccessAt = 0;
let lastError: string | null = null;
let backoffUntil = 0;
let consecutiveFailures = 0;
/** Test hook: override now() */
let nowFn = () => Date.now();

export function getBackgroundSyncStatus(): BackgroundSyncStatus {
  return {
    running,
    lastStartedAt,
    lastSuccessAt,
    lastError,
    backoffUntil,
  };
}

/** @internal vitest */
export function resetBackgroundSyncForTests(opts?: { now?: () => number; minGapMs?: number }): void {
  running = false;
  pendingRerun = null;
  lastStartedAt = 0;
  lastSuccessAt = 0;
  lastError = null;
  backoffUntil = 0;
  consecutiveFailures = 0;
  nowFn = opts?.now ?? (() => Date.now());
  minGapMs = opts?.minGapMs ?? DEFAULT_MIN_GAP_MS;
}

function mergeRequests(a: BackgroundSyncRequest, b: BackgroundSyncRequest): BackgroundSyncRequest {
  const ids = [...new Set([...a.bookIds, ...b.bookIds])];
  const priority: BackgroundSyncReason[] = [
    'manual',
    'after-close',
    'connected',
    'online',
    'resume',
    'periodic',
  ];
  const reason =
    priority.find((r) => a.reason === r || b.reason === r) ?? b.reason;
  return {
    reason,
    bookIds: ids,
    // Prefer explicit exclude from the newer request — including null (after-close clears exclude).
    excludeBookId: Object.prototype.hasOwnProperty.call(b, 'excludeBookId')
      ? b.excludeBookId
      : a.excludeBookId,
    serverConfig: b.serverConfig,
    refresh: b.refresh ?? a.refresh,
    onReaderStoreSynced: b.onReaderStoreSynced ?? a.onReaderStoreSynced,
  };
}

/** Exported for unit tests — which books need a full per-book sync. */
export function selectBooksNeedingSync(
  bookIds: string[],
  indexBooks: ReaderSyncIndexBook[] | null,
): string[] {
  const byId = new Map((indexBooks || []).map((b) => [b.bookId, b]));
  const out: string[] = [];
  for (const bookId of bookIds) {
    if (bookHasPendingSync(bookId)) {
      out.push(bookId);
      continue;
    }
    const server = byId.get(bookId);
    if (!server) {
      // No index entry (older server / failed index) — sync conservatively.
      if (!indexBooks) out.push(bookId);
      continue;
    }
    const local = readOfflineReaderData(bookId);
    const serverPosRev = Math.max(0, Number(server.positionRevision) || 0);
    const localKnown = Math.max(local.baseRevision ?? 0, local.serverRevision ?? 0);
    if (serverPosRev > localKnown) {
      out.push(bookId);
      continue;
    }
    if (parseSyncTs(server.bookmarksRev) > parseSyncTs(local.serverBookmarksRev)) {
      out.push(bookId);
      continue;
    }
    if (parseSyncTs(server.annotationsRev) > parseSyncTs(local.serverAnnotationsRev)) {
      out.push(bookId);
      continue;
    }
    if (
      local.serverBookmarkCount != null
      && local.serverBookmarkCount >= 0
      && server.bookmarkCount !== local.serverBookmarkCount
      && server.bookmarkCount !== local.bookmarks.length
    ) {
      out.push(bookId);
      continue;
    }
    if (
      local.serverAnnotationCount != null
      && local.serverAnnotationCount >= 0
      && server.annotationCount !== local.serverAnnotationCount
      && server.annotationCount !== local.annotations.length
    ) {
      out.push(bookId);
    }
  }
  return out;
}

function activityNeedsRefresh(
  activity: ReaderActivitySyncMeta | null | undefined,
  state: ReturnType<typeof readReaderActivitySync> = readReaderActivitySync(),
): boolean {
  if (!activity) return true;
  if (
    activity.readBooksRev !== state.lastServerReadBooksRev
    || activity.readingHistoryRev !== state.lastServerReadingHistoryRev
  ) {
    return true;
  }
  if (isServerReadBooksNewer(state, activity.readBooksRev, activity.readBookCount)) {
    return true;
  }
  if (isServerReadingHistoryNewer(state, activity.readingHistoryRev, activity.readingHistoryCount)) {
    return true;
  }
  return false;
}

async function executeCycle(req: BackgroundSyncRequest): Promise<BackgroundSyncResult> {
  const {
    reason,
    serverConfig,
    refresh,
    onReaderStoreSynced,
  } = req;
  const exclude = req.excludeBookId ? String(req.excludeBookId) : '';
  const bookIds = [...new Set(req.bookIds.map(String).filter(Boolean))].filter(
    (id) => id !== exclude,
  );

  await flushOfflineReaderStore();

  const index = await fetchReaderSyncIndex(serverConfig, bookIds);
  // Null index with books = server error (500/timeout), not «old server without index».
  // Syncing every book would hammer the server during outages.
  if (bookIds.length > 0 && index === null) {
    throw new Error('Сервер не ответил на запрос синхронизации');
  }
  const activity = index?.activity ?? null;
  // Snapshot before apply — count-went-to-0 / shouldPush decisions need the prior local meta.
  const activityState = readReaderActivitySync();
  const activityRefreshNeeded = activityNeedsRefresh(activity, activityState);
  if (activity) applyServerActivitySyncMeta(activity);

  const dirtyIds = selectBooksNeedingSync(bookIds, index?.books ?? null);

  const queueProcessed = await processSyncQueue(serverConfig);

  if (dirtyIds.length > 0) {
    for (const bookId of dirtyIds) {
      const local = readOfflineReaderData(bookId);
      const opts = buildSyncActivityOptions(
        activityState,
        activity,
        local.positionChangedAt || local.updatedAt,
      );
      try {
        await syncOfflineReaderForBook(serverConfig, bookId, opts);
      } catch (e) {
        if (isAuthError(e)) throw e;
        /* next book */
      }
    }
  }

  // Profile refresh for online/connected is owned by useInpxServer — avoid a second full refresh.
  const forceRefresh =
    reason === 'manual'
    || reason === 'after-close'
    || reason === 'resume';

  const refreshedNeeded =
    forceRefresh
    || activityRefreshNeeded
    || dirtyIds.length > 0
    || queueProcessed > 0;

  let refreshed = false;
  if (refreshedNeeded && refresh) {
    await refresh();
    refreshed = true;
  }

  onReaderStoreSynced?.();

  return {
    ok: true,
    reason,
    syncedBooks: dirtyIds.length,
    queueProcessed,
    refreshed,
  };
}

async function runLoop(initial: BackgroundSyncRequest): Promise<BackgroundSyncResult> {
  let current = initial;
  let lastResult: BackgroundSyncResult = {
    ok: true,
    skipped: true,
    reason: initial.reason,
    syncedBooks: 0,
    queueProcessed: 0,
    refreshed: false,
  };

  running = true;
  try {
    for (;;) {
      lastStartedAt = nowFn();
      try {
        lastResult = await executeCycle(current);
        lastError = null;
        lastSuccessAt = nowFn();
        consecutiveFailures = 0;
        backoffUntil = 0;
      } catch (e) {
        consecutiveFailures += 1;
        const msg = e instanceof Error ? e.message : 'Ошибка синхронизации';
        lastError = msg;
        const delay = BACKOFF_MS[Math.min(consecutiveFailures - 1, BACKOFF_MS.length - 1)];
        backoffUntil = nowFn() + delay;
        lastResult = {
          ok: false,
          reason: current.reason,
          syncedBooks: 0,
          queueProcessed: 0,
          refreshed: false,
          error: msg,
          authExpired: isAuthError(e),
        };
      }

      if (!pendingRerun) break;
      // Бэкофф действует и на переочерёдённые прогоны: иначе флапающие триггеры
      // (online/connected/resume) во время аутеджа обходят backoff мгновенно.
      const backoffWait = backoffUntil - nowFn();
      if (backoffWait > 0) {
        await new Promise((r) => setTimeout(r, backoffWait));
      }
      current = pendingRerun;
      pendingRerun = null;
    }
  } finally {
    running = false;
  }
  return lastResult;
}

/**
 * Request a silent sync cycle. Concurrent callers coalesce; rapid calls debounce.
 */
export async function requestBackgroundSync(
  req: BackgroundSyncRequest,
): Promise<BackgroundSyncResult> {
  const now = nowFn();

  if (running) {
    pendingRerun = pendingRerun ? mergeRequests(pendingRerun, req) : req;
    return {
      ok: true,
      skipped: true,
      reason: req.reason,
      syncedBooks: 0,
      queueProcessed: 0,
      refreshed: false,
    };
  }

  if (now < backoffUntil && req.reason !== 'manual') {
    return {
      ok: false,
      skipped: true,
      reason: req.reason,
      syncedBooks: 0,
      queueProcessed: 0,
      refreshed: false,
      error: lastError || 'backoff',
    };
  }

  if (
    req.reason !== 'manual'
    && req.reason !== 'after-close'
    && lastStartedAt > 0
    && now - lastStartedAt < minGapMs
  ) {
    pendingRerun = pendingRerun ? mergeRequests(pendingRerun, req) : req;
    const wait = minGapMs - (now - lastStartedAt);
    await new Promise((r) => setTimeout(r, Math.max(0, wait)));
    if (running) {
      // Keep this waiter in the coalesce bag — another cycle may have started during the gap.
      pendingRerun = pendingRerun ? mergeRequests(pendingRerun, req) : req;
      return {
        ok: true,
        skipped: true,
        reason: req.reason,
        syncedBooks: 0,
        queueProcessed: 0,
        refreshed: false,
      };
    }
    if (pendingRerun === null) {
      // Наш запрос уже подобран и выполнен другим прогоном, пока мы ждали min-gap.
      return {
        ok: true,
        skipped: true,
        reason: req.reason,
        syncedBooks: 0,
        queueProcessed: 0,
        refreshed: false,
      };
    }
    const coalesced = pendingRerun;
    pendingRerun = null;
    return runLoop(coalesced);
  }

  return runLoop(req);
}

/** Whether the periodic timer should fire a sync. */
export async function shouldRunPeriodicSync(bookIds: string[]): Promise<boolean> {
  const now = nowFn();
  if (running) return false;
  if (now < backoffUntil) return false;
  if (lastSuccessAt > 0 && now - lastSuccessAt < PERIODIC_STALE_MS) {
    // Считаем только выполнимые операции: исчерпавшие попытки (poison/400)
    // не должны гонять полный цикл синхронизации каждые 60 секунд вечно.
    const ops = await getPendingSyncOps();
    const actionable = ops.some((op) => op.attempts < MAX_SYNC_OP_ATTEMPTS);
    if (!actionable && !bookIds.some((id) => bookHasPendingSync(id))) {
      return false;
    }
  }
  return true;
}
