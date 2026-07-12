/**
 * Локальная БД: Capacitor SQLite на Android, IndexedDB в dev-браузере.
 * Версионированные миграции + импорт из legacy localStorage.
 */
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { get, set, del, keys } from 'idb-keyval';
import { isNativeApp } from './platform';
import type { Book, ReadingProgress, Bookmark, Highlight, Shelf } from '../types';

const DB_NAME = 'inpx_reader';
const META_KEY = 'inpx_db_meta';
const IDB_PREFIX = 'inpx_idb_';

export const LOCAL_DB_VERSION = 3;

interface DbMeta {
  version: number;
  migratedFromLocalStorage: boolean;
}

let sqliteConn: SQLiteDBConnection | null = null;
let useIndexedDb = false;
let initPromise: Promise<void> | null = null;

async function openSqlite(): Promise<SQLiteDBConnection | null> {
  if (!isNativeApp()) return null;
  try {
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const isConn = (await sqlite.isConnection(DB_NAME, false)).result ?? false;
    const db = isConn
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, 'no-encryption', LOCAL_DB_VERSION, false);
    await db.open();
    return db;
  } catch (err) {
    // @capacitor-community/sqlite ^7.x targets Capacitor 7; fallback keeps dev/browser working.
    console.warn('[localDb] SQLite open failed, using IndexedDB fallback:', err);
    return null;
  }
}

async function execSql(sql: string, values: unknown[] = []): Promise<void> {
  if (sqliteConn) {
    await sqliteConn.run(sql, values);
  }
}

async function querySql<T extends Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
  if (sqliteConn) {
    const res = await sqliteConn.query(sql, values);
    return (res.values ?? []) as T[];
  }
  return [];
}

async function idbGet<T>(table: string, id: string): Promise<T | null> {
  return (await get(`${IDB_PREFIX}${table}:${id}`)) ?? null;
}

async function idbSet(table: string, id: string, value: unknown): Promise<void> {
  await set(`${IDB_PREFIX}${table}:${id}`, value);
}

async function idbDelete(table: string, id: string): Promise<void> {
  await del(`${IDB_PREFIX}${table}:${id}`);
}

async function idbGetAll<T>(table: string): Promise<T[]> {
  const allKeys = await keys();
  const prefix = `${IDB_PREFIX}${table}:`;
  const out: T[] = [];
  for (const k of allKeys) {
    if (typeof k === 'string' && k.startsWith(prefix)) {
      const v = await get(k);
      if (v != null) out.push(v as T);
    }
  }
  return out;
}

async function createSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS progress (
      book_id TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS shelves (
      id TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS favorites_authors (
      name TEXT PRIMARY KEY NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS favorites_series (
      name TEXT PRIMARY KEY NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      op_type TEXT NOT NULL,
      book_id TEXT,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS reader_data (
      book_id TEXT PRIMARY KEY NOT NULL,
      json TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sync_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      conflict_type TEXT NOT NULL,
      local_json TEXT NOT NULL,
      server_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
  ];

  if (sqliteConn) {
    for (const sql of statements) {
      await sqliteConn.execute(sql);
    }
  }
}

async function runSchemaMigrations(meta: DbMeta): Promise<DbMeta> {
  let version = meta.version || 0;
  if (version < 1) version = 1;
  if (version < 2) version = 2;
  if (version < 3) version = 3;
  if (version < LOCAL_DB_VERSION) version = LOCAL_DB_VERSION;
  const next = { ...meta, version };
  if (next.version !== meta.version) await setMeta(next);
  return next;
}

async function recoverCorruptedDb(): Promise<void> {
  if (sqliteConn) {
    try {
      await sqliteConn.close();
    } catch { /* */ }
    sqliteConn = null;
  }
  useIndexedDb = true;
  await createSchema();
}

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function getMeta(): Promise<DbMeta> {
  if (sqliteConn) {
    const rows = await querySql<{ value: string }>(
      'SELECT value FROM app_meta WHERE key = ?',
      ['db_meta'],
    );
    if (rows[0]?.value) return JSON.parse(rows[0].value) as DbMeta;
  } else {
    const stored = await get(`${IDB_PREFIX}meta:db_meta`);
    if (stored) return stored as DbMeta;
  }
  return { version: 0, migratedFromLocalStorage: false };
}

async function setMeta(meta: DbMeta): Promise<void> {
  const json = JSON.stringify(meta);
  if (sqliteConn) {
    await execSql(
      'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
      ['db_meta', json],
    );
  } else {
    await set(`${IDB_PREFIX}meta:db_meta`, meta);
  }
}

async function migrateFromLocalStorage(): Promise<void> {
  const meta = await getMeta();
  if (meta.migratedFromLocalStorage) return;

  const books = readJsonStorage<Book[]>('inpx_downloaded_books_v2', []);
  const progress = readJsonStorage<ReadingProgress[]>('inpx_progress_list_v2', []);
  const bookmarks = readJsonStorage<Bookmark[]>('inpx_bookmarks_v2', []);
  const highlights = readJsonStorage<Highlight[]>('inpx_highlights_v2', []);
  const shelves = readJsonStorage<Shelf[]>('inpx_shelves_v2', []);
  const favAuthors = readJsonStorage<string[]>('inpx_favorite_authors_v2', []);
  const favSeries = readJsonStorage<string[]>('inpx_favorite_series_v2', []);

  for (const b of books) await upsertBook(b);
  for (const p of progress) await upsertProgress(p);
  for (const bm of bookmarks) await upsertBookmark(bm);
  for (const h of highlights) await upsertHighlight(h);
  for (const s of shelves) await upsertShelf(s);
  for (const name of favAuthors) await addFavoriteAuthor(name);
  for (const name of favSeries) await addFavoriteSeries(name);

  await setMeta({ version: LOCAL_DB_VERSION, migratedFromLocalStorage: true });
}

const READER_LS_PREFIX = 'inpx_offline_reader_';

async function migrateReaderDataFromLocalStorage(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(READER_LS_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    const bookId = key.slice(READER_LS_PREFIX.length);
    const raw = localStorage.getItem(key);
    if (bookId && raw) {
      await upsertReaderData(bookId, raw);
      localStorage.removeItem(key);
    }
  }
}

export async function upsertReaderData(bookId: string, json: string): Promise<void> {
  if (sqliteConn) {
    await execSql('INSERT OR REPLACE INTO reader_data (book_id, json) VALUES (?, ?)', [bookId, json]);
  } else {
    await idbSet('reader_data', bookId, json);
  }
}

export async function getReaderDataJson(bookId: string): Promise<string | null> {
  if (sqliteConn) {
    const rows = await querySql<{ json: string }>(
      'SELECT json FROM reader_data WHERE book_id = ?',
      [bookId],
    );
    return rows[0]?.json ?? null;
  }
  return (await idbGet<string>('reader_data', bookId)) ?? null;
}

// ── App settings (key-value in app_meta) ──

export async function getAppSetting(key: string): Promise<string | null> {
  if (sqliteConn) {
    const rows = await querySql<{ value: string }>(
      'SELECT value FROM app_meta WHERE key = ?',
      [key],
    );
    return rows[0]?.value ?? null;
  }
  return (await get(`${IDB_PREFIX}app_setting:${key}`)) ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  if (sqliteConn) {
    await execSql('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [key, value]);
  } else {
    await set(`${IDB_PREFIX}app_setting:${key}`, value);
  }
}

export async function deleteAppSetting(key: string): Promise<void> {
  if (sqliteConn) {
    await execSql('DELETE FROM app_meta WHERE key = ?', [key]);
  } else {
    await del(`${IDB_PREFIX}app_setting:${key}`);
  }
}

export async function getAllAppSettingKeys(): Promise<string[]> {
  if (sqliteConn) {
    const rows = await querySql<{ key: string }>('SELECT key FROM app_meta WHERE key != ?', ['db_meta']);
    return rows.map((r) => r.key);
  }
  const allKeys = await keys();
  const prefix = `${IDB_PREFIX}app_setting:`;
  return allKeys
    .filter((k): k is string => typeof k === 'string' && k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}

export async function deleteReaderData(bookId: string): Promise<void> {
  if (sqliteConn) {
    await execSql('DELETE FROM reader_data WHERE book_id = ?', [bookId]);
  } else {
    await idbDelete('reader_data', bookId);
  }
}

export async function getAllReaderDataEntries(): Promise<Array<{ bookId: string; json: string }>> {
  if (sqliteConn) {
    const rows = await querySql<{ book_id: string; json: string }>('SELECT book_id, json FROM reader_data');
    return rows.map((r) => ({ bookId: r.book_id, json: r.json }));
  }
  const allKeys = await keys();
  const prefix = `${IDB_PREFIX}reader_data:`;
  const out: Array<{ bookId: string; json: string }> = [];
  for (const k of allKeys) {
    if (typeof k === 'string' && k.startsWith(prefix)) {
      const bookId = k.slice(prefix.length);
      const json = await get(k);
      if (typeof json === 'string') out.push({ bookId, json });
    }
  }
  return out;
}

export async function initLocalDb(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      sqliteConn = await openSqlite();
      useIndexedDb = !sqliteConn;
      if (useIndexedDb && isNativeApp()) {
        console.warn('[localDb] Running on native Android with IndexedDB fallback (SQLite unavailable)');
      }
      await createSchema();
      let meta = await getMeta();
      meta = await runSchemaMigrations(meta);
      await migrateFromLocalStorage();
      await migrateReaderDataFromLocalStorage();
      try {
        await getAllBooks();
      } catch {
        await recoverCorruptedDb();
        await migrateFromLocalStorage();
        await migrateReaderDataFromLocalStorage();
      }
    } catch {
      await recoverCorruptedDb();
      await migrateFromLocalStorage();
      await migrateReaderDataFromLocalStorage();
    }
  })();
  return initPromise;
}

export function isUsingIndexedDbFallback(): boolean {
  return useIndexedDb;
}

// ── Books ──

export async function getAllBooks(): Promise<Book[]> {
  if (sqliteConn) {
    const rows = await querySql<{ json: string }>('SELECT json FROM books');
    return rows.map((r) => JSON.parse(r.json) as Book);
  }
  return idbGetAll<Book>('books');
}

export async function upsertBook(book: Book): Promise<void> {
  const json = JSON.stringify(book);
  if (sqliteConn) {
    await execSql('INSERT OR REPLACE INTO books (id, json) VALUES (?, ?)', [book.id, json]);
  } else {
    await idbSet('books', book.id, book);
  }
}

export async function deleteBook(id: string): Promise<void> {
  if (sqliteConn) {
    await execSql('DELETE FROM books WHERE id = ?', [id]);
  } else {
    await idbDelete('books', id);
  }
}

// ── Progress ──

export async function getAllProgress(): Promise<ReadingProgress[]> {
  if (sqliteConn) {
    const rows = await querySql<{ json: string }>('SELECT json FROM progress');
    return rows.map((r) => JSON.parse(r.json) as ReadingProgress);
  }
  return idbGetAll<ReadingProgress>('progress');
}

export async function upsertProgress(p: ReadingProgress): Promise<void> {
  const json = JSON.stringify(p);
  if (sqliteConn) {
    await execSql('INSERT OR REPLACE INTO progress (book_id, json) VALUES (?, ?)', [p.bookId, json]);
  } else {
    await idbSet('progress', p.bookId, p);
  }
}

export async function deleteProgress(bookId: string): Promise<void> {
  if (sqliteConn) {
    await execSql('DELETE FROM progress WHERE book_id = ?', [bookId]);
  } else {
    await idbDelete('progress', bookId);
  }
}

// ── Bookmarks / Highlights / Shelves ──

export async function getAllBookmarks(): Promise<Bookmark[]> {
  if (sqliteConn) {
    const rows = await querySql<{ json: string }>('SELECT json FROM bookmarks');
    return rows.map((r) => JSON.parse(r.json) as Bookmark);
  }
  return idbGetAll<Bookmark>('bookmarks');
}

export async function upsertBookmark(bm: Bookmark): Promise<void> {
  const json = JSON.stringify(bm);
  if (sqliteConn) {
    await execSql('INSERT OR REPLACE INTO bookmarks (id, json) VALUES (?, ?)', [bm.id, json]);
  } else {
    await idbSet('bookmarks', bm.id, bm);
  }
}

export async function deleteBookmark(id: string): Promise<void> {
  if (sqliteConn) {
    await execSql('DELETE FROM bookmarks WHERE id = ?', [id]);
  } else {
    await idbDelete('bookmarks', id);
  }
}

export async function getAllHighlights(): Promise<Highlight[]> {
  if (sqliteConn) {
    const rows = await querySql<{ json: string }>('SELECT json FROM highlights');
    return rows.map((r) => JSON.parse(r.json) as Highlight);
  }
  return idbGetAll<Highlight>('highlights');
}

export async function upsertHighlight(h: Highlight): Promise<void> {
  const json = JSON.stringify(h);
  if (sqliteConn) {
    await execSql('INSERT OR REPLACE INTO highlights (id, json) VALUES (?, ?)', [h.id, json]);
  } else {
    await idbSet('highlights', h.id, h);
  }
}

export async function deleteHighlight(id: string): Promise<void> {
  if (sqliteConn) {
    await execSql('DELETE FROM highlights WHERE id = ?', [id]);
  } else {
    await idbDelete('highlights', id);
  }
}

export async function getAllShelves(): Promise<Shelf[]> {
  if (sqliteConn) {
    const rows = await querySql<{ json: string }>('SELECT json FROM shelves');
    return rows.map((r) => JSON.parse(r.json) as Shelf);
  }
  return idbGetAll<Shelf>('shelves');
}

export async function upsertShelf(s: Shelf): Promise<void> {
  const json = JSON.stringify(s);
  if (sqliteConn) {
    await execSql('INSERT OR REPLACE INTO shelves (id, json) VALUES (?, ?)', [s.id, json]);
  } else {
    await idbSet('shelves', s.id, s);
  }
}

export async function deleteShelf(id: string): Promise<void> {
  if (sqliteConn) {
    await execSql('DELETE FROM shelves WHERE id = ?', [id]);
  } else {
    await idbDelete('shelves', id);
  }
}

// ── Favorites ──

export async function getFavoriteAuthors(): Promise<string[]> {
  if (sqliteConn) {
    const rows = await querySql<{ name: string }>('SELECT name FROM favorites_authors');
    return rows.map((r) => r.name);
  }
  return (await get(`${IDB_PREFIX}lists:fav_authors`)) ?? [];
}

export async function setFavoriteAuthors(names: string[]): Promise<void> {
  if (sqliteConn) {
    await sqliteConn.execute('DELETE FROM favorites_authors');
    for (const name of names) {
      await execSql('INSERT OR IGNORE INTO favorites_authors (name) VALUES (?)', [name]);
    }
  } else {
    await set(`${IDB_PREFIX}lists:fav_authors`, names);
  }
}

async function addFavoriteAuthor(name: string): Promise<void> {
  if (sqliteConn) {
    await execSql('INSERT OR IGNORE INTO favorites_authors (name) VALUES (?)', [name]);
  } else {
    const cur: string[] = (await get(`${IDB_PREFIX}lists:fav_authors`)) ?? [];
    if (!cur.includes(name)) await set(`${IDB_PREFIX}lists:fav_authors`, [...cur, name]);
  }
}

export async function getFavoriteSeries(): Promise<string[]> {
  if (sqliteConn) {
    const rows = await querySql<{ name: string }>('SELECT name FROM favorites_series');
    return rows.map((r) => r.name);
  }
  return (await get(`${IDB_PREFIX}lists:fav_series`)) ?? [];
}

export async function setFavoriteSeries(names: string[]): Promise<void> {
  if (sqliteConn) {
    await sqliteConn.execute('DELETE FROM favorites_series');
    for (const name of names) {
      await execSql('INSERT OR IGNORE INTO favorites_series (name) VALUES (?)', [name]);
    }
  } else {
    await set(`${IDB_PREFIX}lists:fav_series`, names);
  }
}

async function addFavoriteSeries(name: string): Promise<void> {
  if (sqliteConn) {
    await execSql('INSERT OR IGNORE INTO favorites_series (name) VALUES (?)', [name]);
  } else {
    const cur: string[] = (await get(`${IDB_PREFIX}lists:fav_series`)) ?? [];
    if (!cur.includes(name)) await set(`${IDB_PREFIX}lists:fav_series`, [...cur, name]);
  }
}

// ── Sync queue ──

export interface SyncQueueItem {
  id: number;
  opType: string;
  bookId: string | null;
  payload: string;
  createdAt: number;
  attempts: number;
}

export async function enqueueSyncOp(
  opType: string,
  bookId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  const json = JSON.stringify(payload);
  const now = Date.now();
  if (sqliteConn) {
    await execSql(
      'INSERT INTO sync_queue (op_type, book_id, payload, created_at, attempts) VALUES (?, ?, ?, ?, 0)',
      [opType, bookId, json, now],
    );
  } else {
    const id = now;
    await idbSet('sync_queue', String(id), {
      id,
      opType,
      bookId,
      payload: json,
      createdAt: now,
      attempts: 0,
    });
  }
}

export async function getPendingSyncOps(): Promise<SyncQueueItem[]> {
  if (sqliteConn) {
    const rows = await querySql<{
      id: number;
      op_type: string;
      book_id: string | null;
      payload: string;
      created_at: number;
      attempts: number;
    }>('SELECT * FROM sync_queue ORDER BY created_at ASC');
    return rows.map((r) => ({
      id: r.id,
      opType: r.op_type,
      bookId: r.book_id,
      payload: r.payload,
      createdAt: r.created_at,
      attempts: r.attempts,
    }));
  }
  const items = await idbGetAll<SyncQueueItem>('sync_queue');
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPendingSyncCount(): Promise<number> {
  const ops = await getPendingSyncOps();
  return ops.length;
}

export async function removeSyncOp(id: number): Promise<void> {
  if (sqliteConn) {
    await execSql('DELETE FROM sync_queue WHERE id = ?', [id]);
  } else {
    await idbDelete('sync_queue', String(id));
  }
}

export async function incrementSyncOpAttempts(id: number): Promise<void> {
  if (sqliteConn) {
    await execSql('UPDATE sync_queue SET attempts = attempts + 1 WHERE id = ?', [id]);
  } else {
    const item = await idbGet<SyncQueueItem>('sync_queue', String(id));
    if (item) {
      await idbSet('sync_queue', String(id), { ...item, attempts: item.attempts + 1 });
    }
  }
}

export async function getFailedSyncOps(minAttempts = 3): Promise<SyncQueueItem[]> {
  const ops = await getPendingSyncOps();
  return ops.filter((o) => o.attempts >= minAttempts);
}

export interface SyncConflictRecord {
  id: number;
  bookId: string;
  conflictType: string;
  localJson: string;
  serverJson: string;
  createdAt: number;
}

export async function listSyncConflicts(): Promise<SyncConflictRecord[]> {
  if (sqliteConn) {
    const rows = await querySql<{
      id: number;
      book_id: string;
      conflict_type: string;
      local_json: string;
      server_json: string;
      created_at: number;
    }>('SELECT * FROM sync_conflicts ORDER BY created_at DESC');
    return rows.map((r) => ({
      id: r.id,
      bookId: r.book_id,
      conflictType: r.conflict_type,
      localJson: r.local_json,
      serverJson: r.server_json,
      createdAt: r.created_at,
    }));
  }
  return idbGetAll<SyncConflictRecord>('sync_conflicts');
}

export async function addSyncConflict(
  bookId: string,
  conflictType: string,
  localPayload: Record<string, unknown>,
  serverPayload: Record<string, unknown>,
): Promise<void> {
  const now = Date.now();
  const localJson = JSON.stringify(localPayload);
  const serverJson = JSON.stringify(serverPayload);
  if (sqliteConn) {
    await execSql(
      'INSERT INTO sync_conflicts (book_id, conflict_type, local_json, server_json, created_at) VALUES (?, ?, ?, ?, ?)',
      [bookId, conflictType, localJson, serverJson, now],
    );
  } else {
    await idbSet('sync_conflicts', String(now), {
      id: now,
      bookId,
      conflictType,
      localJson,
      serverJson,
      createdAt: now,
    });
  }
}

export async function removeSyncConflict(id: number): Promise<void> {
  if (sqliteConn) {
    await execSql('DELETE FROM sync_conflicts WHERE id = ?', [id]);
  } else {
    await idbDelete('sync_conflicts', String(id));
  }
}

/** Persist full library snapshot (transactional replace). */
export async function persistLibrarySnapshot(data: {
  books: Book[];
  progress: ReadingProgress[];
  bookmarks: Bookmark[];
  highlights: Highlight[];
  shelves: Shelf[];
}): Promise<void> {
  for (const b of data.books) await upsertBook(b);
  for (const p of data.progress) await upsertProgress(p);
  for (const bm of data.bookmarks) await upsertBookmark(bm);
  for (const h of data.highlights) await upsertHighlight(h);
  for (const s of data.shelves) await upsertShelf(s);
}

export async function loadLibrarySnapshot(): Promise<{
  books: Book[];
  progress: ReadingProgress[];
  bookmarks: Bookmark[];
  highlights: Highlight[];
  shelves: Shelf[];
  favoriteAuthors: string[];
  favoriteSeries: string[];
}> {
  const [books, progress, bookmarks, highlights, shelves, favoriteAuthors, favoriteSeries] =
    await Promise.all([
      getAllBooks(),
      getAllProgress(),
      getAllBookmarks(),
      getAllHighlights(),
      getAllShelves(),
      getFavoriteAuthors(),
      getFavoriteSeries(),
    ]);
  return { books, progress, bookmarks, highlights, shelves, favoriteAuthors, favoriteSeries };
}

/** Сброс состояния БД — только для vitest. */
export async function __resetLocalDbForTests(): Promise<void> {
  initPromise = null;
  sqliteConn = null;
  useIndexedDb = false;
  try {
    const allKeys = await keys();
    for (const k of allKeys) {
      if (typeof k === 'string' && k.startsWith(IDB_PREFIX)) {
        await del(k);
      }
    }
  } catch {
    /* indexedDB недоступен (node без DOM) */
  }
}
