/**
 * Books downloaded from another server — or before the server re-added their source under a
 * new source id — keep their old id on the device («9:857614»), while the active server knows
 * them as «6:857614». Every per-book call then answered 404 and position / history never
 * reached the server. The server lists such ids in `reader-sync-index.unknownIds`; here they
 * are mapped with `POST /api/books/resolve` and remembered per server URL, and `bookRef.ts`
 * sends the server id for every book path.
 */
import type { Book, ServerConfig } from '../types';
import { setServerBookAliases } from './bookRef';
import { normalizeBaseUrl, recordReadingHistoryAt, resolveServerBookIds } from './inpxClient';
import { getAllBooks, getAllProgress } from './localDb';
import { readOfflineReaderData, writeOfflineReaderData, type OfflineReaderData } from './offlineReaderStore';

const STORAGE_KEY = 'inpx_server_book_aliases_v1';
/** An id the server could not match is asked again after this long (books may be added later). */
const MISS_RETRY_MS = 12 * 60 * 60 * 1000;

interface ServerAliasEntry {
  aliases: Record<string, string>;
  misses: Record<string, number>;
}

let activeServer = '';
/** In-memory copy; localStorage is only the persistence (may be missing or full). */
let memory: Record<string, ServerAliasEntry> | null = null;

function readAll(): Record<string, ServerAliasEntry> {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    memory = parsed && typeof parsed === 'object' ? parsed as Record<string, ServerAliasEntry> : {};
  } catch {
    memory = {};
  }
  return memory;
}

function readEntry(server: string): ServerAliasEntry {
  const entry = readAll()[server];
  return {
    aliases: { ...(entry?.aliases || {}) },
    misses: { ...(entry?.misses || {}) },
  };
}

function writeEntry(server: string, entry: ServerAliasEntry): void {
  const all = readAll();
  all[server] = entry;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** Load the aliases of this server URL into `bookRef.ts` (cheap when the URL did not change). */
export function activateServerBookAliases(serverUrl: string): void {
  const server = normalizeBaseUrl(serverUrl);
  if (server === activeServer) return;
  activeServer = server;
  setServerBookAliases(server ? readEntry(server).aliases : {});
}

/** Tests only. */
export function __resetServerBookAliasesForTests(): void {
  activeServer = '';
  memory = null;
  setServerBookAliases({});
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Revisions and snapshots seen on the other server mean nothing here: push as a fresh book. */
export function resetServerSyncStateForRebind(local: OfflineReaderData): OfflineReaderData {
  return {
    ...local,
    serverRevision: 0,
    baseRevision: 0,
    positionDirty: Boolean(local.positionDirty || local.progress > 0 || local.fraction),
    dismissedServerRevision: null,
    dismissedServerSessionId: null,
    serverSessionId: null,
    serverPositionUpdatedAt: null,
    dismissedServerPositionUpdatedAt: null,
    serverPositionProgress: undefined,
    serverPositionFraction: undefined,
    serverPosition: null,
    pendingCrossDevicePrompt: false,
    serverFb2Href: null,
    serverSectionIndex: null,
    serverTextOffset: null,
    serverTextQuote: null,
    serverTextSectionLength: null,
    serverSectionPageFraction: null,
    serverPaginatorPage: null,
    serverPaginatorPages: null,
    serverLayoutMode: null,
    serverBookmarksRev: null,
    serverAnnotationsRev: null,
    serverBookmarkCount: undefined,
    serverAnnotationCount: undefined,
  };
}

function bookAuthors(book: Book | undefined): string[] | string {
  const list = (book as { authors?: unknown } | undefined)?.authors;
  if (Array.isArray(list) && list.length) return list.map(String);
  return String(book?.author || '');
}

/**
 * Map ids the server reported as unknown. Returns how many books got a new server id
 * (the caller re-reads the sync index for them).
 */
export async function resolveUnknownServerBooks(
  config: ServerConfig,
  unknownIds: string[],
  now = Date.now(),
): Promise<number> {
  const server = normalizeBaseUrl(config.url);
  if (!server || unknownIds.length === 0) return 0;
  activateServerBookAliases(server);
  const entry = readEntry(server);
  const pending = [...new Set(unknownIds.map(String))].filter((id) => (
    id
    && !entry.aliases[id]
    && !(entry.misses[id] && now - entry.misses[id] < MISS_RETRY_MS)
  ));
  if (pending.length === 0) return 0;

  const [books, progress] = await Promise.all([getAllBooks(), getAllProgress()]);
  const bookById = new Map(books.map((b) => [String(b.id), b]));
  const lastReadById = new Map(progress.map((p) => [String(p.bookId), Number(p.lastRead) || 0]));
  const refs = pending.map((id) => {
    const book = bookById.get(id);
    return { id, title: book?.title || '', authors: bookAuthors(book), ext: book?.ext || '' };
  });
  const items = await resolveServerBookIds(config, refs);

  const rebound: string[] = [];
  for (const item of items) {
    const localId = String(item.id || '');
    const serverId = item.bookId ? String(item.bookId) : '';
    if (!localId || !pending.includes(localId)) continue;
    if (!serverId || serverId === localId) {
      entry.misses[localId] = now;
      continue;
    }
    entry.aliases[localId] = serverId;
    delete entry.misses[localId];
    rebound.push(localId);
  }
  writeEntry(server, entry);
  if (rebound.length === 0) return 0;

  activeServer = '';
  activateServerBookAliases(server);
  for (const localId of rebound) {
    const local = readOfflineReaderData(localId);
    writeOfflineReaderData(localId, resetServerSyncStateForRebind(local));
    // «Продолжить чтение» on the web comes from reading history, not from the position.
    const lastRead = lastReadById.get(localId) || 0;
    if (lastRead > 0 || local.progress > 0) {
      const at = new Date(lastRead > 0 ? lastRead : now).toISOString();
      await recordReadingHistoryAt(config, localId, at).catch(() => {});
    }
  }
  return rebound.length;
}
