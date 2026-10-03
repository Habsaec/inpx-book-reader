import {
  addBookToServerShelf,
  ApiError,
  createServerShelf,
  deleteReadingHistoryApi,
  deleteServerShelf,
  ensureBookReadState,
  fetchFavorites,
  fetchShelves,
  isAuthError,
  isUnreachableServerError,
  removeBookFromServerShelf,
  toggleFavoriteAuthorApi,
  toggleFavoriteSeriesApi,
} from './inpxClient';
import type { ServerConfig } from '../types';
import {
  getPendingSyncOps,
  incrementSyncOpAttempts,
  rekeySyncOpBookId,
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

/** Drop queued favorite toggles after a successful online toggle. */
export async function dropQueuedFavoriteOps(
  opType: 'favorite_author' | 'favorite_series',
  name: string,
): Promise<void> {
  const ops = await getPendingSyncOps();
  for (const op of ops) {
    if (op.opType === opType && op.bookId === name) {
      await removeSyncOp(op.id);
    }
  }
}

/** Drop every queued shelf op for a local id that never reached the server. */
export async function dropQueuedShelfOps(shelfId: string): Promise<void> {
  const ops = await getPendingSyncOps();
  for (const op of ops) {
    if (
      (op.opType === 'shelf_create' || op.opType === 'shelf_delete' || op.opType === 'shelf_add' || op.opType === 'shelf_remove')
      && op.bookId === shelfId
    ) {
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

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw || '{}') as unknown;
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return null;
  }
}

async function ensureFavorite(
  config: ServerConfig,
  kind: 'author' | 'series',
  name: string,
  favorite: boolean,
): Promise<void> {
  const favs = await fetchFavorites(config);
  const list = kind === 'author' ? favs.authors : favs.series;
  const has = list.some((item) => item.name === name);
  if (has === favorite) return;
  if (kind === 'author') await toggleFavoriteAuthorApi(config, name);
  else await toggleFavoriteSeriesApi(config, name);
}

/** Local offline shelf id → server id. Persisted so a restart can finish adds/deletes. */
const SHELF_ID_MAP_KEY = 'inpx-shelf-server-ids';
const sessionShelfIds = new Map<string, number>();
let shelfRemapHandler: ((localId: string, serverId: string) => void) | null = null;

export function readPersistedShelfIdMap(): Map<string, number> {
  const map = new Map<string, number>();
  try {
    const raw = localStorage.getItem(SHELF_ID_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    if (!parsed || typeof parsed !== 'object') return map;
    for (const [localId, serverId] of Object.entries(parsed as Record<string, unknown>)) {
      const id = Number(serverId);
      if (localId && Number.isFinite(id)) map.set(localId, id);
    }
  } catch {
    /* ignore */
  }
  return map;
}

function writeShelfIdMap(): void {
  const payload: Record<string, number> = {};
  for (const [localId, serverId] of sessionShelfIds) payload[localId] = serverId;
  try {
    localStorage.setItem(SHELF_ID_MAP_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function hydrateShelfIds(): void {
  sessionShelfIds.clear();
  for (const [localId, serverId] of readPersistedShelfIdMap()) {
    sessionShelfIds.set(localId, serverId);
  }
}

export function setShelfRemapHandler(
  handler: ((localId: string, serverId: string) => void) | null,
): void {
  shelfRemapHandler = handler;
}

async function rememberShelf(localId: string, serverId: number): Promise<void> {
  sessionShelfIds.set(localId, serverId);
  writeShelfIdMap();
  shelfRemapHandler?.(localId, String(serverId));
  const serverKey = String(serverId);
  const ops = await getPendingSyncOps();
  for (const op of ops) {
    if (op.bookId === localId && op.opType.startsWith('shelf_') && op.opType !== 'shelf_create') {
      await rekeySyncOpBookId(op.id, serverKey);
    }
  }
}

function forgetShelf(serverId: number): void {
  for (const [localId, id] of [...sessionShelfIds]) {
    if (id === serverId || localId === String(serverId)) sessionShelfIds.delete(localId);
  }
  writeShelfIdMap();
}

async function createOrBindShelf(
  config: ServerConfig,
  localId: string,
  name: string,
): Promise<void> {
  try {
    const id = await createServerShelf(config, name);
    await rememberShelf(localId, id);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 400) throw e;
    const shelves = await fetchShelves(config);
    const match = shelves.find((shelf) => shelf.name === name);
    if (!match) throw e;
    await rememberShelf(localId, match.id);
  }
}

function resolveShelfServerId(shelfKey: string): number | null {
  const mapped = sessionShelfIds.get(shelfKey);
  if (mapped != null) return mapped;
  if (/^\d+$/.test(shelfKey)) return Number(shelfKey);
  return null;
}

let queueChain: Promise<unknown> = Promise.resolve();

export function processSyncQueue(config: ServerConfig): Promise<number> {
  const run = queueChain.then(() => runSyncQueue(config));
  queueChain = run.then(() => undefined, () => undefined);
  return run;
}

async function runSyncQueue(config: ServerConfig): Promise<number> {
  hydrateShelfIds();
  const ops = await getPendingSyncOps();

  // Keep only the latest desired state per book / favorite name.
  const latestToggleId = new Map<string, number>();
  const latestFavoriteId = new Map<string, number>();
  for (const op of ops) {
    if (op.opType === 'toggle_read' && op.bookId) {
      latestToggleId.set(op.bookId, op.id);
    }
    if ((op.opType === 'favorite_author' || op.opType === 'favorite_series') && op.bookId) {
      latestFavoriteId.set(`${op.opType}:${op.bookId}`, op.id);
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
    if ((op.opType === 'favorite_author' || op.opType === 'favorite_series') && op.bookId) {
      if (latestFavoriteId.get(`${op.opType}:${op.bookId}`) !== op.id) {
        await removeSyncOp(op.id);
        continue;
      }
    }
    try {
      if (op.opType === 'remove_history' && op.bookId) {
        await deleteReadingHistoryApi(config, op.bookId);
      } else if (op.opType === 'toggle_read' && op.bookId) {
        const payload = parsePayload(op.payload || '{}');
        if (!payload) {
          await removeSyncOp(op.id);
          continue;
        }
        await ensureBookReadState(config, op.bookId, Boolean(payload.markRead));
      } else if ((op.opType === 'favorite_author' || op.opType === 'favorite_series') && op.bookId) {
        const payload = parsePayload(op.payload || '{}');
        if (!payload) {
          await removeSyncOp(op.id);
          continue;
        }
        await ensureFavorite(
          config,
          op.opType === 'favorite_author' ? 'author' : 'series',
          op.bookId,
          Boolean(payload.favorite),
        );
      } else if (op.opType === 'shelf_create' && op.bookId) {
        const payload = parsePayload(op.payload || '{}');
        if (!payload) {
          await removeSyncOp(op.id);
          continue;
        }
        const name = String(payload.name || '').trim();
        if (!name) {
          await removeSyncOp(op.id);
          continue;
        }
        await createOrBindShelf(config, op.bookId, name);
      } else if (op.opType === 'shelf_delete' && op.bookId) {
        const id = resolveShelfServerId(op.bookId);
        if (id == null) {
          await removeSyncOp(op.id);
          continue;
        }
        await deleteServerShelf(config, id);
        forgetShelf(id);
      } else if ((op.opType === 'shelf_add' || op.opType === 'shelf_remove') && op.bookId) {
        const payload = parsePayload(op.payload || '{}');
        if (!payload) {
          await removeSyncOp(op.id);
          continue;
        }
        const bookId = String(payload.bookId || '');
        if (!bookId) {
          await removeSyncOp(op.id);
          continue;
        }
        let id = resolveShelfServerId(op.bookId);
        const createStillPending = ops.some((item) => (
          item.opType === 'shelf_create'
          && item.bookId === op.bookId
          && item.attempts < MAX_SYNC_OP_ATTEMPTS
        ));
        if (id == null && createStillPending) continue;
        if (id == null) {
          const shelfName = String(payload.name || '').trim();
          if (shelfName) {
            const shelves = await fetchShelves(config);
            const match = shelves.find((shelf) => shelf.name === shelfName);
            if (match) {
              await rememberShelf(op.bookId, match.id);
              id = match.id;
            }
          }
        }
        if (id == null) {
          await incrementSyncOpAttempts(op.id);
          continue;
        }
        if (op.opType === 'shelf_add') await addBookToServerShelf(config, id, bookId);
        else await removeBookFromServerShelf(config, id, bookId);
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
