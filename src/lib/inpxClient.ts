/**
 * INPX REST API клиент для мобильной читалки.
 *
 * 📱 Только Android:
 * - В браузере (dev) — запросы через /api/proxy (server.ts)
 * - В APK (production) — напрямую через CapacitorHttp
 *
 * @see AGENTS.md — архитектура проекта
 */

import { ServerConfig } from '../types';
import { arrayBufferToBase64 } from './bookStorage';
import { isNativeApp } from './platform';
import { getDebugRequestId } from './debugSessionLog';
import {
  apiBookPath,
  apiBookmarkPath,
  apiReadPath,
  apiReadingHistoryPath,
} from './bookRef';

export interface InpxProfile {
  user: { username: string; role: string };
  userStats: {
    readingCount: number;
    bookmarkCount: number;
    readBooksCount: number;
    favoriteAuthorsCount: number;
    favoriteSeriesCount: number;
    shelvesCount: number;
    readerBookmarksCount: number;
    readerAnnotationsCount: number;
    createdAt: string | null;
  };
  recentBooks: Array<{
    id: string;
    title: string;
    authors?: string;
    authorsDisplay?: string;
    ext?: string;
    series?: string;
    seriesNo?: string | number;
    lastOpenedAt?: string;
    openCount?: number;
    readProgress?: number;
    libRate?: number;
  }>;
  readerBookmarks: Array<{
    id: number;
    bookId: string;
    bookTitle: string;
    label: string;
    position: string;
    ext?: string;
  }>;
  readerAnnotations: Array<{
    id: number;
    bookId: string;
    bookTitle: string;
    text: string;
    note: string;
    cfi: string;
    color: string;
    ext?: string;
  }>;
}

export interface InpxBookItem {
  id: string;
  title: string;
  authors?: string;
  authorsDisplay?: string;
  authorsList?: string[];
  genres?: string;
  genresDisplayList?: string[];
  series?: string;
  seriesNo?: string | number;
  seriesList?: Array<{ name: string; displayName?: string; seriesNo?: string | number }>;
  ext?: string;
  libRate?: number;
  size?: number;
  annotation?: string;
  date?: string;
  lang?: string;
  readProgress?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Recommended list may be building on the server. */
  computing?: boolean;
}

export function normalizeBaseUrl(url: string): string {
  let u = String(url || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) {
    const looksLocal = /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u);
    u = `${looksLocal ? 'http' : 'https'}://${u}`;
  }
  try {
    const parsed = new URL(u);
    // userinfo в URL ломает fetch («URL cannot include credentials») и утекает в логи/DNS.
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    u = parsed.toString();
  } catch {
    /* невалидный URL — оставляем как есть, дальше сработает валидация подключения */
  }
  return u.replace(/\/+$/, '').replace(/\/opds\/v2$/i, '');
}

export function authHeader(config: ServerConfig): Record<string, string> {
  // Явный логин/пароль важнее device token: иначе при повторном вводе пароля
  // устаревший Bearer перекрывает Basic и сервер отвечает 401 «неверный пароль».
  const username = config.username?.trim();
  if (username && config.password) {
    const credentials = `${username}:${config.password}`;
    const encoded = new TextEncoder().encode(credentials);
    const token = arrayBufferToBase64(
      encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength),
    );
    return { Authorization: `Basic ${token}` };
  }
  const deviceToken = config.deviceToken?.trim();
  if (deviceToken) {
    return { Authorization: `Bearer ${deviceToken}` };
  }
  return {};
}

/** В браузере — через Node-прокси; в APK — напрямую (CapacitorHttp). */
export async function apiFetch(
  config: ServerConfig,
  targetPath: string,
  init: RequestInit = {}
): Promise<Response> {
  const base = normalizeBaseUrl(config.url);
  const fullUrl = `${base}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-ID': getDebugRequestId(),
    ...authHeader(config),
    ...(init.headers as Record<string, string> | undefined),
  };

  if (isNativeApp()) {
    return fetch(fullUrl, { ...init, headers });
  }

  return fetch(`/api/proxy?url=${encodeURIComponent(fullUrl)}`, {
    ...init,
    headers,
  });
}

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
  authExpired?: boolean;
}

/** Сеть недоступна или сервер не отвечает (не путать с 401/404). */
export function isUnreachableServerError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|network error|networkrequestfailed|unable to resolve|could not resolve|unknown host|timeout|econnrefused|enetunreach|socket|abort|ssl|certificate|handshake/i.test(
    msg,
  );
}

export interface ServerBranding {
  siteName: string;
  logoPath: string;
  rawUi?: Record<string, unknown>;
}

const BRANDING_FALLBACK_NAME = 'Библиотека';
const DEFAULT_LOGO_PATH = '/logo.png';
const CONNECTION_TIMEOUT_MS = 8_000;
/** Default timeout for catalog/sync/profile JSON API calls. */
const API_TIMEOUT_MS = 20_000;

/** Макс. пауза между чанками тела при скачивании книги. */
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000;

export { CONNECTION_TIMEOUT_MS, API_TIMEOUT_MS };

/** HTTP error with status — used for 401 recovery and UI messaging. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isAuthError(err: unknown): boolean {
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return true;
  // Native download / Capacitor bridge often surfaces plain "HTTP 401" strings.
  const msg = err instanceof Error ? err.message : String(err);
  return /\bHTTP\s+40[13]\b/i.test(msg);
}

async function withTimeoutSignal<T>(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', onCallerAbort);
  try {
    return await work(controller.signal);
  } catch (e: unknown) {
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new Error(`Timeout: сервер не ответил за ${Math.round(timeoutMs / 1000)} с`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}

async function apiFetchWithTimeout(
  config: ServerConfig,
  targetPath: string,
  init: RequestInit = {},
  timeoutMs = CONNECTION_TIMEOUT_MS,
): Promise<Response> {
  return withTimeoutSignal(timeoutMs, init.signal ?? undefined, (signal) =>
    apiFetch(config, targetPath, { ...init, signal }),
  );
}

export async function fetchServerBranding(config: ServerConfig): Promise<ServerBranding> {
  const data = await apiJson<Record<string, unknown>>(config, '/api/settings/ui');

  return {
    siteName: String(data.siteName ?? '').trim() || BRANDING_FALLBACK_NAME,
    logoPath: String(data.logoUrl ?? '') || DEFAULT_LOGO_PATH,
    rawUi: data,
  };
}

export async function fetchServerLogoBlob(config: ServerConfig, logoPath: string): Promise<Blob | null> {
  try {
    return await withTimeoutSignal(API_TIMEOUT_MS, undefined, async (signal) => {
      const res = await apiFetch(config, logoPath, {
        headers: { Accept: 'image/*' },
        signal,
      });
      if (!res.ok) return null;
      return await res.blob();
    });
  } catch {
    return null;
  }
}

export async function testConnection(config: ServerConfig): Promise<ConnectionTestResult> {
  const base = normalizeBaseUrl(config.url);
  if (!base) {
    return { ok: false, error: 'Не указан адрес сервера' };
  }

  if (isNativeApp() && /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(config.url.trim())) {
    return {
      ok: false,
      error: 'На телефоне нельзя использовать localhost. Укажите IP компьютера в Wi‑Fi, например http://192.168.1.42:3000',
    };
  }

  if (!config.username?.trim() && !config.deviceToken?.trim()) {
    return { ok: false, error: 'Укажите логин и пароль пользователя библиотеки' };
  }

  if (!config.deviceToken?.trim() && !config.password) {
    return { ok: false, error: 'Укажите логин и пароль пользователя библиотеки' };
  }

  try {
    // INPX Library Server: GET /health (не /api/health!)
    const healthRes = await apiFetchWithTimeout(config, '/health');
    if (!healthRes.ok) {
      return {
        ok: false,
        error: `Сервер не отвечает (HTTP ${healthRes.status}). Адрес: ${base}`,
      };
    }

    const profileRes = await apiFetchWithTimeout(config, '/api/profile');
    if (profileRes.status === 401) {
      if (config.deviceToken?.trim() && !config.password) {
        return {
          ok: false,
          authExpired: true,
          error: 'Сессия устройства устарела. Введите логин и пароль заново.',
        };
      }
      return { ok: false, error: 'Неверный логин или пароль' };
    }
    if (!profileRes.ok) {
      const hint = profileRes.status === 404
        ? ' Обновите INPX Library Server — нужен endpoint /api/profile.'
        : '';
      return { ok: false, error: `Ошибка авторизации (HTTP ${profileRes.status}).${hint}` };
    }

    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isUnreachableServerError(e)) {
      return {
        ok: false,
        error: `Нет связи с ${base}. Проверьте: сервер запущен, домен открывается в браузере телефона, логин/пароль верны. Для crazeDNS — обновите запись DDNS на роутере.`,
      };
    }
    return { ok: false, error: msg || 'Не удалось подключиться' };
  }
}

function statusFallbackMessage(status: number): string {
  if (status === 401) return 'Сессия устройства устарела. Введите логин и пароль заново.';
  if (status === 403) return 'Недостаточно прав для этого действия.';
  if (status === 404) return 'Не найдено на сервере.';
  if (status === 429) return 'Слишком много запросов. Подождите немного и повторите.';
  if (status >= 500) return `Ошибка сервера (HTTP ${status}). Попробуйте позже.`;
  return `HTTP ${status}`;
}

function messageFromErrorBody(text: string, status: number): string {
  const raw = String(text || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
      const fromJson = parsed.error ?? parsed.message;
      if (fromJson != null && String(fromJson).trim()) return String(fromJson).trim();
    } catch {
      /* plain text body */
    }
    // Avoid dumping HTML error pages into snackbars.
    if (raw.startsWith('<') || /<!DOCTYPE/i.test(raw)) {
      return statusFallbackMessage(status);
    }
    if (!raw.startsWith('{')) {
      return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
    }
  }
  return statusFallbackMessage(status);
}

async function apiJson<T>(config: ServerConfig, path: string, init: RequestInit = {}): Promise<T> {
  return withTimeoutSignal(API_TIMEOUT_MS, init.signal ?? undefined, async (signal) => {
    const res = await apiFetch(config, path, { ...init, signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(messageFromErrorBody(text, res.status), res.status);
    }
    if (res.status === 204) return undefined as T;
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError('Сервер вернул некорректный ответ', res.status);
    }
  });
}

async function apiPostJson<T>(config: ServerConfig, path: string, body?: unknown): Promise<T> {
  return apiJson(config, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : '{}',
  });
}

async function apiPutJson<T>(config: ServerConfig, path: string, body: unknown): Promise<T> {
  return apiJson(config, path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function apiDelete(config: ServerConfig, path: string): Promise<void> {
  await apiJson(config, path, { method: 'DELETE' });
}

export async function fetchProfile(config: ServerConfig): Promise<InpxProfile> {
  return apiJson(config, '/api/profile');
}

export interface FavoriteAuthorItem {
  name: string;
  displayName?: string;
  bookCount?: number;
  coverBookId?: string | null;
}

export interface FavoriteSeriesItem {
  name: string;
  displayName?: string;
  bookCount?: number;
  previewBookIds?: string[];
}

function normalizePreviewBookIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split('|').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export async function fetchFavorites(config: ServerConfig): Promise<{
  authors: FavoriteAuthorItem[];
  series: FavoriteSeriesItem[];
}> {
  const data = await apiJson<{
    authors?: FavoriteAuthorItem[];
    series?: FavoriteSeriesItem[];
  }>(config, '/api/favorites');
  return {
    authors: (data.authors ?? []).map((a) => ({
      name: String(a.name ?? ''),
      displayName: a.displayName != null ? String(a.displayName) : undefined,
      bookCount: a.bookCount != null ? Number(a.bookCount) : undefined,
      coverBookId:
        a.coverBookId != null && String(a.coverBookId).trim() !== ''
          ? String(a.coverBookId)
          : null,
    })).filter((a) => a.name),
    series: (data.series ?? []).map((s) => ({
      name: String(s.name ?? ''),
      displayName: s.displayName != null ? String(s.displayName) : undefined,
      bookCount: s.bookCount != null ? Number(s.bookCount) : undefined,
      previewBookIds: normalizePreviewBookIds(s.previewBookIds),
    })).filter((s) => s.name),
  };
}

export async function fetchBookmarkedBooks(config: ServerConfig, page = 1, pageSize = 24): Promise<Paginated<InpxBookItem>> {
  return apiJson(config, `/api/bookmarks?page=${page}&pageSize=${pageSize}&sort=date`);
}

export async function fetchLibraryView(
  config: ServerConfig,
  view: 'recent' | 'continue' | 'read' | 'recommended',
  page = 1,
  pageSize = 24,
  opts: {
    /** Single code, CSV, or list — OR (at least one genre). */
    genre?: string | string[];
    lang?: string;
    format?: string;
    year?: number;
    /** Minimum libRate 1–5. */
    minRate?: number;
    /** `1` = in a series, `0` = standalone. */
    hasSeries?: 0 | 1 | boolean;
    sort?: string;
    order?: string;
  } = {},
): Promise<Paginated<InpxBookItem>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.order) params.set('order', opts.order);
  if (opts.genre != null) {
    const genres = Array.isArray(opts.genre) ? opts.genre : [opts.genre];
    for (const g of genres) {
      const code = String(g || '').trim();
      if (code) params.append('genre', code);
    }
  }
  if (opts.lang) params.set('lang', opts.lang);
  if (opts.format) params.set('format', opts.format);
  if (opts.year) params.set('year', String(opts.year));
  if (opts.minRate != null && opts.minRate >= 1) params.set('minRate', String(Math.floor(opts.minRate)));
  if (opts.hasSeries === true || opts.hasSeries === 1) params.set('hasSeries', '1');
  else if (opts.hasSeries === false || opts.hasSeries === 0) params.set('hasSeries', '0');
  return apiJson(config, `/api/library/${view}?${params}`);
}

export async function toggleBookBookmark(config: ServerConfig, bookId: string): Promise<boolean> {
  const data = await apiPostJson<{ bookmarked: boolean }>(config, apiBookmarkPath(bookId));
  return data.bookmarked;
}

export async function toggleBookRead(config: ServerConfig, bookId: string): Promise<boolean> {
  const data = await apiPostJson<{ read: boolean }>(config, apiReadPath(bookId));
  return data.read;
}

/** Idempotent desired read state — avoids stranded toggle_read queue ops. */
export async function ensureBookReadState(
  config: ServerConfig,
  bookId: string,
  markRead: boolean,
): Promise<void> {
  if (markRead) {
    await apiPostJson(config, '/api/read/batch', { ids: [bookId] });
    return;
  }
  // Unmark: one toggle if currently read; if we accidentally marked, toggle again.
  let isRead = await toggleBookRead(config, bookId);
  if (!isRead) return;
  isRead = await toggleBookRead(config, bookId);
  if (isRead) {
    throw new Error('Не удалось снять отметку «прочитано»');
  }
}

export async function toggleFavoriteAuthorApi(config: ServerConfig, name: string): Promise<boolean> {
  const data = await apiPostJson<{ favorite: boolean }>(config, '/api/favorites/authors', { name });
  return data.favorite;
}

export async function toggleFavoriteSeriesApi(config: ServerConfig, name: string): Promise<boolean> {
  const data = await apiPostJson<{ favorite: boolean }>(config, '/api/favorites/series', { name });
  return data.favorite;
}

export interface ServerShelf {
  id: number;
  name: string;
  description?: string;
  bookCount?: number;
  previewBookIds?: string[];
}

/** Shelf row for library UI — server numeric id or local string id. */
export type UiShelf = {
  id: number | string;
  name: string;
  bookCount?: number;
  previewBookIds?: string[];
};

export async function fetchShelves(config: ServerConfig): Promise<ServerShelf[]> {
  const rows = await apiJson<ServerShelf[]>(config, '/api/shelves');
  return (Array.isArray(rows) ? rows : []).map((s) => ({
    ...s,
    id: Number(s.id),
    name: String(s.name ?? ''),
    bookCount: s.bookCount != null ? Number(s.bookCount) : undefined,
    previewBookIds: normalizePreviewBookIds(s.previewBookIds).slice(0, 4),
  })).filter((s) => s.name && Number.isFinite(s.id));
}

export async function createServerShelf(config: ServerConfig, name: string, description = ''): Promise<number> {
  const data = await apiPostJson<{ id: number }>(config, '/api/shelves', { name, description });
  return data.id;
}

export async function deleteServerShelf(config: ServerConfig, shelfId: number): Promise<void> {
  await apiDelete(config, `/api/shelves/${shelfId}`);
}

export async function fetchShelfBooks(config: ServerConfig, shelfId: number): Promise<InpxBookItem[]> {
  return apiJson(config, `/api/shelves/${shelfId}/books`);
}

export async function addBookToServerShelf(config: ServerConfig, shelfId: number, bookId: string): Promise<void> {
  await apiPostJson(config, `/api/shelves/${shelfId}/books`, { bookId });
}

export async function removeBookFromServerShelf(config: ServerConfig, shelfId: number, bookId: string): Promise<void> {
  await apiDelete(config, `/api/shelves/${shelfId}/books/${encodeURIComponent(bookId)}`);
}

export interface ServerReadingPosition {
  position: string;
  progress: number;
  fraction?: number | null;
  fb2Href?: string | null;
  sectionIndex?: number | null;
  textOffset?: number | null;
  textQuote?: string | null;
  textSectionLength?: number | null;
  sectionPageFraction?: number | null;
  paginatorPage?: number | null;
  paginatorPages?: number | null;
  layoutMode?: string | null;
  updatedAt?: string | null;
  positionVersion?: number;
  revision?: number;
  sessionId?: string | null;
  lastUserActivityAt?: string | null;
  sessionStatus?: 'active' | 'idle' | null;
}

export class ReadingPositionConflictError extends Error {
  readonly current: ServerReadingPosition;

  constructor(current: ServerReadingPosition) {
    super('Reading position revision conflict');
    this.name = 'ReadingPositionConflictError';
    this.current = current;
  }
}

export class ReadingPositionProtocolError extends Error {
  constructor() {
    super('Reading position protocol upgrade required');
    this.name = 'ReadingPositionProtocolError';
  }
}

export type ReadingPositionAnchors = Pick<
  ServerReadingPosition,
  | 'sectionIndex'
  | 'textOffset'
  | 'textQuote'
  | 'textSectionLength'
  | 'sectionPageFraction'
  | 'paginatorPage'
  | 'paginatorPages'
  | 'layoutMode'
>;

function appendReadingPositionAnchors(
  body: Record<string, unknown>,
  anchors?: ReadingPositionAnchors | null,
): void {
  if (!anchors) return;
  if (anchors.sectionIndex != null && Number.isFinite(Number(anchors.sectionIndex))) {
    body.sectionIndex = Number(anchors.sectionIndex);
  }
  if (anchors.textOffset != null && Number.isFinite(Number(anchors.textOffset))) {
    body.textOffset = Number(anchors.textOffset);
  }
  if (typeof anchors.textQuote === 'string') body.textQuote = anchors.textQuote.slice(0, 256);
  if (anchors.textSectionLength != null && Number.isFinite(Number(anchors.textSectionLength))) {
    body.textSectionLength = Number(anchors.textSectionLength);
  }
  if (Number.isFinite(Number(anchors.sectionPageFraction))) {
    body.sectionPageFraction = Number(anchors.sectionPageFraction);
  }
  if (Number.isFinite(Number(anchors.paginatorPage))) body.paginatorPage = Number(anchors.paginatorPage);
  if (Number.isFinite(Number(anchors.paginatorPages))) body.paginatorPages = Number(anchors.paginatorPages);
  if (typeof anchors.layoutMode === 'string' && anchors.layoutMode.trim()) {
    body.layoutMode = anchors.layoutMode.trim();
  }
}

export async function fetchReadingPosition(config: ServerConfig, bookId: string): Promise<ServerReadingPosition> {
  return apiJson(config, apiBookPath(bookId, 'position'));
}

export interface ReaderBookSyncMeta {
  bookmarksRev: string;
  annotationsRev: string;
  positionUpdatedAt: string | null;
  positionProgress?: number;
  /** Integer CAS revision from reading_positions (0 if none). */
  positionRevision?: number;
  bookmarkCount: number;
  annotationCount: number;
}

export async function fetchReaderBookSyncMeta(
  config: ServerConfig,
  bookId: string,
): Promise<ReaderBookSyncMeta | null> {
  try {
    return await apiJson<ReaderBookSyncMeta>(
      config,
      apiBookPath(bookId, 'reader-sync-meta'),
    );
  } catch (e: unknown) {
    if (isAuthError(e)) throw e;
    return null;
  }
}

export interface ReaderActivitySyncMeta {
  readBooksRev: string;
  readingHistoryRev: string;
  readBookCount: number;
  readingHistoryCount: number;
}

export interface ReaderSyncIndexBook extends ReaderBookSyncMeta {
  bookId: string;
}

export interface ReaderSyncIndex {
  activity: ReaderActivitySyncMeta;
  books: ReaderSyncIndexBook[];
}

export async function fetchReaderActivitySyncMeta(
  config: ServerConfig,
): Promise<ReaderActivitySyncMeta | null> {
  try {
    return await apiJson<ReaderActivitySyncMeta>(config, '/api/reader-activity-sync-meta');
  } catch (e: unknown) {
    if (isAuthError(e)) throw e;
    return null;
  }
}

/** Bulk dirty-check for silent background sync. */
export async function fetchReaderSyncIndex(
  config: ServerConfig,
  bookIds: string[],
): Promise<ReaderSyncIndex | null> {
  const ids = [...new Set(bookIds.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 200);
  try {
    const q = ids.length ? `?ids=${ids.map(encodeURIComponent).join(',')}` : '';
    return await apiJson<ReaderSyncIndex>(config, `/api/reader-sync-index${q}`);
  } catch (e: unknown) {
    // Auth failures must not look like "no index" (that triggers a full sync storm).
    if (isAuthError(e)) throw e;
    return null;
  }
}

export async function saveReadingPosition(
  config: ServerConfig,
  bookId: string,
  position: string,
  progress: number,
  fraction?: number | null,
  fb2Href?: string | null,
  anchors?: ReadingPositionAnchors | null,
  baseRevision = 0,
  sessionId?: string | null,
): Promise<{
  markedRead?: boolean;
  unmarkedRead?: boolean;
  updatedAt?: string | null;
  positionVersion: number;
  revision: number;
}> {
  const body: Record<string, unknown> = {
    position,
    progress,
    positionVersion: 4,
    baseRevision,
  };
  if (Number.isFinite(Number(fraction))) {
    body.fraction = Number(fraction);
  }
  if (fb2Href != null && String(fb2Href).trim()) {
    body.fb2Href = String(fb2Href).trim();
  }
  const normalizedSessionId = String(sessionId || '').trim();
  if (normalizedSessionId) body.sessionId = normalizedSessionId;
  appendReadingPositionAnchors(body, anchors);
  const response = await apiFetchWithTimeout(
    config,
    apiBookPath(bookId, 'position'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    API_TIMEOUT_MS,
  );
  if (response.status === 409) {
    const payload = await response.json().catch(() => null) as { current?: ServerReadingPosition } | null;
    if (payload?.current) throw new ReadingPositionConflictError(payload.current);
    // Контракт: 409 всегда уходит в путь разрешения конфликта. Если тело без
    // `current` (прокси/старый сервер) — дочитываем позицию отдельно.
    const current = await fetchReadingPosition(config, bookId).catch(
      (): ServerReadingPosition => ({ position: '', progress: 0 }),
    );
    throw new ReadingPositionConflictError(current);
  }
  if (response.status === 428) {
    throw new ReadingPositionProtocolError();
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(messageFromErrorBody(text, response.status), response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new ApiError('Сервер вернул некорректный ответ', response.status);
  }
}

export async function recordReadingHistory(config: ServerConfig, bookId: string): Promise<void> {
  await apiPostJson(config, apiReadingHistoryPath(bookId), {
    lastOpenedAt: new Date().toISOString(),
  });
}

export async function deleteReadingHistoryApi(config: ServerConfig, bookId: string): Promise<void> {
  await apiDelete(config, apiReadingHistoryPath(bookId));
}

export interface ServerReaderBookmark {
  id: number;
  position: string;
  title: string;
  createdAt?: string;
}

export async function fetchReaderBookmarks(config: ServerConfig, bookId: string): Promise<ServerReaderBookmark[]> {
  return apiJson(config, apiBookPath(bookId, 'bookmarks'));
}

export async function addReaderBookmarkApi(
  config: ServerConfig,
  bookId: string,
  position: string,
  title: string
): Promise<number> {
  const data = await apiPostJson<{ id: number }>(config, apiBookPath(bookId, 'bookmarks'), {
    position,
    title,
  });
  return data.id;
}

export async function deleteReaderBookmarkApi(config: ServerConfig, bookId: string, bmId: number): Promise<void> {
  await apiDelete(config, apiBookPath(bookId, `bookmarks/${bmId}`));
}

export interface ReaderBookmarkListItem {
  id: number;
  bookId: string;
  bookTitle: string;
  label: string;
  position: string;
  ext?: string;
  createdAt?: string;
}

export async function fetchReaderBookmarkList(
  config: ServerConfig,
  page = 1,
  pageSize = 200,
): Promise<Paginated<ReaderBookmarkListItem>> {
  return apiJson(config, `/api/reader-bookmarks?page=${page}&pageSize=${pageSize}`);
}

export async function fetchAllReaderBookmarkList(config: ServerConfig): Promise<ReaderBookmarkListItem[]> {
  const pageSize = 200;
  const first = await fetchReaderBookmarkList(config, 1, pageSize);
  const items = [...(first.items || [])];
  const total = Number(first.total) || items.length;
  for (let page = 2; items.length < total && page <= 25; page++) {
    const next = await fetchReaderBookmarkList(config, page, pageSize);
    const chunk = next.items || [];
    if (!chunk.length) break;
    items.push(...chunk);
  }
  return items;
}

export interface ServerAnnotation {
  id: number;
  cfi: string;
  text: string;
  note: string;
  color: string;
  createdAt?: string;
}

export async function fetchReaderAnnotations(config: ServerConfig, bookId: string): Promise<ServerAnnotation[]> {
  return apiJson(config, apiBookPath(bookId, 'annotations'));
}

export async function addReaderAnnotationApi(
  config: ServerConfig,
  bookId: string,
  cfi: string,
  text: string,
  note: string,
  color: string
): Promise<number> {
  const data = await apiPostJson<{ id: number }>(config, apiBookPath(bookId, 'annotations'), {
    cfi,
    text,
    note,
    color,
  });
  return data.id;
}

export async function deleteReaderAnnotationApi(config: ServerConfig, bookId: string, aid: number): Promise<void> {
  await apiDelete(config, apiBookPath(bookId, `annotations/${aid}`));
}

export interface ReaderAnnotationListItem {
  id: number;
  bookId: string;
  bookTitle: string;
  text: string;
  note: string;
  cfi: string;
  color: string;
  ext?: string;
  createdAt?: string;
}

export async function fetchReaderAnnotationList(
  config: ServerConfig,
  page = 1,
  pageSize = 200,
): Promise<Paginated<ReaderAnnotationListItem>> {
  return apiJson(config, `/api/reader-annotations?page=${page}&pageSize=${pageSize}`);
}

export async function fetchAllReaderAnnotationList(config: ServerConfig): Promise<ReaderAnnotationListItem[]> {
  const pageSize = 200;
  const first = await fetchReaderAnnotationList(config, 1, pageSize);
  const items = [...(first.items || [])];
  const total = Number(first.total) || items.length;
  for (let page = 2; items.length < total && page <= 25; page++) {
    const next = await fetchReaderAnnotationList(config, page, pageSize);
    const chunk = next.items || [];
    if (!chunk.length) break;
    items.push(...chunk);
  }
  return items;
}

export async function patchReaderAnnotationApi(
  config: ServerConfig,
  bookId: string,
  aid: number,
  patch: { note?: string; color?: string },
): Promise<void> {
  await apiJson(config, apiBookPath(bookId, `annotations/${aid}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

const APP_READER_POS_RE = /^(?:app:)?ch(\d+):p(\d+)$/;

export function readerPosition(chapter: number, paragraph: number): string {
  return `app:ch${chapter}:p${paragraph}`;
}

export function parseReaderPosition(pos: string): { chapter: number; paragraph: number } | null {
  const m = APP_READER_POS_RE.exec(pos.trim());
  if (!m) return null;
  return { chapter: Number(m[1]), paragraph: Number(m[2]) };
}

/** Mobile app position (not EPUB CFI). */
export function isAppReaderPosition(pos: string): boolean {
  return APP_READER_POS_RE.test(pos.trim());
}

/** Foliate / EPUB canonical fragment identifier. */
export function isEpubCfiPosition(pos: string): boolean {
  const s = pos.trim();
  return /^epubcfi/i.test(s) || (s.startsWith('/') && s.includes('!'));
}

export async function fetchBookReviewHtml(config: ServerConfig, bookId: string): Promise<string> {
  const data = await apiJson<{ html?: string }>(config, apiBookPath(bookId, 'review'));
  return data.html || '';
}

export type CatalogField = 'books' | 'authors' | 'series';
export type CatalogBookSort = 'recent' | 'title' | 'author' | 'series' | 'rating';
export type CatalogEntitySort = 'name' | 'count';

export interface CatalogSearchHints {
  tip?: string | null;
  didYouMean?: string[];
  weak?: boolean;
  alternateModes?: Array<{ field?: string; label?: string; q?: string }>;
}

export interface CatalogSearchResult {
  items: InpxBookItem[] | Array<{ name: string; displayName?: string; bookCount?: number; count?: number }>;
  total: number;
  page: number;
  pageSize: number;
  field: CatalogField;
  searchHints?: CatalogSearchHints;
}

export async function searchCatalog(
  config: ServerConfig,
  opts: {
    q: string;
    field: CatalogField;
    sort?: string;
    order?: string;
    /** Single code, CSV, or list — multiple genres are OR-combined (at least one match). */
    genre?: string | string[];
    letter?: string;
    lang?: string;
    format?: string;
    year?: number;
    /** Minimum libRate 1–5. */
    minRate?: number;
    /** `1` = book is in a series, `0` = standalone, omit = any. */
    hasSeries?: 0 | 1 | boolean;
    page?: number;
    pageSize?: number;
  }
): Promise<CatalogSearchResult> {
  const buildParams = (q: string) => {
    const params = new URLSearchParams({
      q,
      field: opts.field,
      page: String(opts.page ?? 1),
      pageSize: String(opts.pageSize ?? 24),
      sort: opts.sort ?? (opts.field === 'books' ? 'title' : 'name'),
    });
    if (opts.order) params.set('order', opts.order);
    if (opts.genre != null) {
      const genres = Array.isArray(opts.genre) ? opts.genre : [opts.genre];
      for (const g of genres) {
        const code = String(g || '').trim();
        if (code) params.append('genre', code);
      }
    }
    if (opts.letter) params.set('letter', opts.letter);
    if (opts.lang) params.set('lang', opts.lang);
    if (opts.format) params.set('format', opts.format);
    if (opts.year) params.set('year', String(opts.year));
    if (opts.minRate != null && opts.minRate >= 1) params.set('minRate', String(Math.floor(opts.minRate)));
    if (opts.hasSeries === true || opts.hasSeries === 1) params.set('hasSeries', '1');
    else if (opts.hasSeries === false || opts.hasSeries === 0) params.set('hasSeries', '0');
    return params;
  };

  const q = String(opts.q || '').trim();
  const result = await apiJson<CatalogSearchResult>(config, `/api/catalog?${buildParams(q)}`);

  // Server FTS can be desynced (dirty=0 but MATCH empty). Prefix `*` forces LIKE and finds books.
  if (
    opts.field === 'books' &&
    q &&
    !q.startsWith('*') &&
    !q.startsWith('=') &&
    !q.startsWith('~') &&
    (result.total ?? 0) === 0
  ) {
    const fallback = await apiJson<CatalogSearchResult>(
      config,
      `/api/catalog?${buildParams(`*${q}`)}`,
    );
    if ((fallback.total ?? 0) > 0) return fallback;
  }

  return result;
}

export interface SearchSuggestions {
  books: Array<{ id: string; title: string; authors?: string; authorsDisplay?: string }>;
  authors: Array<{ name: string; displayName?: string; bookCount?: number }>;
  series: Array<{ name: string; displayName?: string; bookCount?: number }>;
}

export async function fetchSearchSuggestions(config: ServerConfig, q: string): Promise<SearchSuggestions> {
  return apiJson(config, `/api/search/suggest?q=${encodeURIComponent(q.trim())}`);
}

/** Unified search hub — totals before drilling into catalog field results. */
export interface SearchOverviewResult {
  query: string;
  books: { total: number; capped?: boolean };
  authors: { total: number; capped?: boolean };
  series: { total: number; capped?: boolean };
}

export async function fetchSearchOverview(
  config: ServerConfig,
  q: string,
): Promise<SearchOverviewResult> {
  const query = String(q || '').trim();
  if (!query) {
    return { query: '', books: { total: 0 }, authors: { total: 0 }, series: { total: 0 } };
  }
  return apiJson(config, `/api/search?q=${encodeURIComponent(query)}`);
}

/** Genres present in books matching the current search/filters (faceted). */
export async function fetchSearchGenres(
  config: ServerConfig,
  opts: {
    q?: string;
    format?: string;
    year?: number;
    minRate?: number;
    hasSeries?: 0 | 1;
  } = {},
): Promise<{ scoped: boolean; items: Array<{ name: string; displayName?: string; bookCount?: number }> }> {
  const params = new URLSearchParams();
  const q = String(opts.q || '').trim();
  if (q) params.set('q', q);
  if (opts.format) params.set('format', opts.format);
  if (opts.year && opts.year >= 1800 && opts.year <= 2100) params.set('year', String(opts.year));
  if (opts.minRate != null && opts.minRate >= 1) params.set('minRate', String(Math.floor(opts.minRate)));
  if (opts.hasSeries === 0 || opts.hasSeries === 1) params.set('hasSeries', String(opts.hasSeries));
  if (![...params.keys()].length) return { scoped: false, items: [] };
  return apiJson(config, `/api/search/genres?${params}`);
}

export async function fetchRecentBooks(
  config: ServerConfig,
  page = 1,
  sort: CatalogBookSort = 'recent'
): Promise<Paginated<InpxBookItem>> {
  return apiJson(config, `/api/library/recent?page=${page}&pageSize=24&sort=${sort}`);
}

export async function searchBooks(
  config: ServerConfig,
  q: string,
  page = 1,
  sort: CatalogBookSort = 'title'
): Promise<Paginated<InpxBookItem>> {
  const result = await searchCatalog(config, { q, field: 'books', sort, page, pageSize: 24 });
  return { items: result.items as InpxBookItem[], total: result.total, page: result.page, pageSize: result.pageSize };
}

export async function fetchAuthors(
  config: ServerConfig,
  q = '',
  page = 1,
  sort = 'count',
): Promise<Paginated<{ name: string; displayName?: string; bookCount?: number }>> {
  const params = new URLSearchParams({ page: String(page), sort });
  if (q) params.set('q', q);
  return apiJson(config, `/api/browse/authors?${params}`);
}

export async function fetchSeries(
  config: ServerConfig,
  q = '',
  page = 1,
  sort = 'count',
): Promise<Paginated<{ name: string; displayName?: string; bookCount?: number }>> {
  const params = new URLSearchParams({ page: String(page), sort });
  if (q) params.set('q', q);
  return apiJson(config, `/api/browse/series?${params}`);
}

export type GenreGroup = {
  groupName: string;
  items: Array<{ name: string; bookCount?: number; displayName?: string }>;
};

export async function fetchGenres(
  config: ServerConfig,
  sort: CatalogEntitySort = 'count',
): Promise<{
  groups: GenreGroup[];
  items: Array<{ name: string; bookCount?: number; displayName?: string }>;
}> {
  const sortParam = sort === 'name' ? 'name' : 'count';
  const data = await apiJson<{
    groups?: GenreGroup[] | Record<string, string[]>;
    items?: Array<{ name: string; bookCount?: number; displayName?: string }>;
  }>(config, `/api/browse/genres?sort=${sortParam}`);
  const items = Array.isArray(data.items) ? data.items : [];
  // Ожидаем groups: [{ groupName, items }]. Старые серверы отдавали сырой map кодов.
  if (Array.isArray(data.groups)) {
    return { items, groups: data.groups };
  }
  if (items.length) {
    return { items, groups: [{ groupName: 'Жанры', items }] };
  }
  return { items, groups: [] };
}

export async function fetchFacetBooks(
  config: ServerConfig,
  facet: 'authors' | 'series' | 'genres',
  value: string,
  page = 1,
  opts?: {
    author?: string;
    sort?: string;
    format?: string;
    year?: number;
    minRate?: number;
    hasSeries?: 0 | 1 | boolean;
    lang?: string;
  },
): Promise<Paginated<InpxBookItem>> {
  const params = new URLSearchParams({ facet, value, page: String(page), pageSize: '24' });
  if (opts?.author) params.set('author', opts.author);
  if (opts?.sort) params.set('sort', opts.sort);
  if (opts?.lang) params.set('lang', opts.lang);
  if (opts?.format) params.set('format', opts.format);
  if (opts?.year) params.set('year', String(opts.year));
  if (opts?.minRate != null && opts.minRate >= 1) params.set('minRate', String(Math.floor(opts.minRate)));
  if (opts?.hasSeries === true || opts?.hasSeries === 1) params.set('hasSeries', '1');
  else if (opts?.hasSeries === false || opts?.hasSeries === 0) params.set('hasSeries', '0');
  return apiJson(config, `/api/facet-books?${params}`);
}

export interface AuthorGroupedResult {
  series: Array<{
    name: string;
    displayName?: string;
    bookCount: number;
    /** Present when requested with view=list */
    books?: InpxBookItem[];
  }>;
  standaloneBooks: InpxBookItem[];
  total: number;
  bioHtml?: string;
  hasPortrait?: boolean;
  authorName?: string;
}

export async function fetchAuthorPortraitBlob(config: ServerConfig, authorName: string): Promise<Blob | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await apiFetch(config, `/api/authors/portrait?name=${encodeURIComponent(authorName)}`, {
      headers: { Accept: 'image/*' },
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => '');
        throw new ApiError(messageFromErrorBody(text, res.status), res.status);
      }
      throw new ApiError(`Портрет: HTTP ${res.status}`, res.status);
    }
    return await res.blob();
  } catch (e: unknown) {
    if (isAuthError(e)) throw e;
    if (controller.signal.aborted) {
      throw new Error(`Timeout: сервер не ответил за ${Math.round(API_TIMEOUT_MS / 1000)} с`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAuthorGrouped(
  config: ServerConfig,
  authorName: string,
  sort: CatalogBookSort = 'title',
  _opts?: { view?: 'list' | 'series' },
): Promise<AuthorGroupedResult> {
  const params = new URLSearchParams({ sort });
  // Older servers only attached books[] when view=list; current servers always include them.
  params.set('view', 'list');
  return apiJson(
    config,
    `/api/browse/authors/${encodeURIComponent(authorName)}/grouped?${params}`,
  );
}

export interface BookDetailsResponse {
  annotation?: string;
  /** true — аннотация HTML (как на сервере: sanitize + render, не plain text). */
  annotationIsHtml?: boolean;
  title?: string;
}

/**
 * Soft-fail GET JSON: empty on network/4xx/5xx, but rethrow 401/403 so callers
 * can run auth recovery instead of treating auth failure as "no data".
 */
async function softFetchJson<T>(
  config: ServerConfig,
  path: string,
  empty: T,
): Promise<T> {
  try {
    return await withTimeoutSignal(API_TIMEOUT_MS, undefined, async (signal) => {
      const res = await apiFetch(config, path, { signal });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          const text = await res.text().catch(() => '');
          throw new ApiError(messageFromErrorBody(text, res.status), res.status);
        }
        return empty;
      }
      try {
        return (await res.json()) as T;
      } catch {
        return empty;
      }
    });
  } catch (e: unknown) {
    if (isAuthError(e)) throw e;
    return empty;
  }
}

export async function fetchBookDetails(config: ServerConfig, bookId: string): Promise<BookDetailsResponse> {
  return softFetchJson(config, apiBookPath(bookId, 'details'), {} as BookDetailsResponse);
}

/** Полные метаданные книги с серии из INPX (getBookById + book_series). */
export async function fetchBookMeta(config: ServerConfig, bookId: string): Promise<InpxBookItem | null> {
  const data = await softFetchJson<InpxBookItem | null>(
    config,
    apiBookPath(bookId, 'meta'),
    null,
  );
  if (!data || typeof data !== 'object') return null;
  // Minimal shape check — avoid treating HTML error pages / empty objects as meta.
  if (!String((data as InpxBookItem).id ?? '').trim() && !String((data as InpxBookItem).title ?? '').trim()) {
    return null;
  }
  return data;
}

export async function downloadBookBinary(
  config: ServerConfig,
  bookId: string,
  onProgress?: (loaded: number, total: number) => void,
  opts?: { signal?: AbortSignal },
): Promise<ArrayBuffer> {
  // Timeout covers connect + headers only; body transfer can be long and uses caller signal.
  const headerController = new AbortController();
  const headerTimer = setTimeout(() => headerController.abort(), API_TIMEOUT_MS);
  const onCallerAbort = () => headerController.abort();
  opts?.signal?.addEventListener('abort', onCallerAbort);
  let res: Response;
  try {
    res = await apiFetch(config, apiBookPath(bookId, 'content'), {
      headers: { Accept: '*/*' },
      signal: headerController.signal,
    });
  } catch (e: unknown) {
    if (headerController.signal.aborted && !opts?.signal?.aborted) {
      throw new Error(`Timeout: сервер не ответил за ${Math.round(API_TIMEOUT_MS / 1000)} с`);
    }
    throw e;
  } finally {
    clearTimeout(headerTimer);
    opts?.signal?.removeEventListener('abort', onCallerAbort);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ApiError(
      `Загрузка: ${messageFromErrorBody(detail, res.status)}`,
      res.status,
    );
  }
  const totalHeader = res.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : 0;
  const body = res.body;
  if (!body || !onProgress) return res.arrayBuffer();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  try {
    while (true) {
      if (opts?.signal?.aborted) {
        await reader.cancel().catch(() => {});
        throw new DOMException('Aborted', 'AbortError');
      }
      // Idle-сторож: зависший сокет посреди тела (WebView держит соединение)
      // без этого не даёт ни прогресса, ни ошибки — загрузка висит вечно.
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const idleTimeout = new Promise<never>((_, reject) => {
        idleTimer = setTimeout(() => {
          void reader.cancel().catch(() => {});
          reject(new Error('Загрузка остановилась: сервер не присылает данные'));
        }, DOWNLOAD_IDLE_TIMEOUT_MS);
      });
      const { done, value } = await Promise.race([reader.read(), idleTimeout]).finally(() => {
        if (idleTimer !== undefined) clearTimeout(idleTimer);
      });
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress(loaded, total || loaded);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  chunks.length = 0;
  return out.buffer;
}

export function coverUrl(config: ServerConfig, bookId: string, variant: 'thumb' | 'full' = 'thumb'): string {
  const base = normalizeBaseUrl(config.url);
  const suffix = variant === 'full' ? 'cover' : 'cover-thumb';
  return `${base}${apiBookPath(bookId, suffix)}`;
}

export function displayCoverUrl(config: ServerConfig, bookId: string, variant: 'thumb' | 'full' = 'thumb'): string {
  if (isNativeApp()) {
    return coverUrl(config, bookId, variant);
  }
  return `/api/proxy?url=${encodeURIComponent(coverUrl(config, bookId, variant))}`;
}

export async function fetchCoverBlob(
  config: ServerConfig,
  bookId: string,
  variant: 'thumb' | 'full' = 'thumb'
): Promise<Blob | null> {
  const suffix = variant === 'full' ? 'cover' : 'cover-thumb';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await apiFetch(config, apiBookPath(bookId, suffix), {
      headers: { Accept: 'image/*' },
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => '');
        throw new ApiError(messageFromErrorBody(text, res.status), res.status);
      }
      return null;
    }
    return await res.blob();
  } catch (e: unknown) {
    if (isAuthError(e)) throw e;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function bookContentUrl(config: ServerConfig, bookId: string): string {
  const base = normalizeBaseUrl(config.url);
  return `${base}${apiBookPath(bookId, 'content')}`;
}

/** Одно ФИО: «Фамилия, Имя, Отчество» → «Фамилия Имя Отчество». */
function capitalizeNamePart(part: string): string {
  const trimmed = part.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/([-])/g)
    .map((seg) => {
      if (seg === '-') return seg;
      if (!seg) return seg;
      return seg.charAt(0).toLocaleUpperCase('ru-RU') + seg.slice(1).toLocaleLowerCase('ru-RU');
    })
    .join('');
}

export function formatSingleAuthorName(value = ''): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return capitalizeNamePart(raw.replace(/,/g, ' '));
  return parts.map(capitalizeNamePart).join(' ');
}

/** Каноническое имя из БД + опциональный display_name с сервера. */
export function displayAuthorName(canonical = '', displayName?: string): string {
  const fromDisplay = displayName?.trim();
  if (fromDisplay) return formatSingleAuthorName(fromDisplay) || fromDisplay;
  return formatSingleAuthorName(canonical) || canonical;
}

/** Строка authors из INPX: несколько авторов через «:», части ФИО через запятую. */
export function formatAuthorLabel(value = ''): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const authors = raw
    .split(':')
    .map((author) => formatSingleAuthorName(author))
    .filter(Boolean);
  if (!authors.length) return raw;
  const head = authors.slice(0, 3).join(', ');
  return authors.length > 3 ? `${head} и ещё ${authors.length - 3}` : head;
}

export function formatAuthorsFromItem(
  item: Pick<InpxBookItem, 'authors' | 'authorsList' | 'authorsDisplay'>
): string {
  if (item.authorsDisplay?.trim()) return item.authorsDisplay.trim();
  if (item.authorsList?.length) {
    const authors = item.authorsList.map((author) => formatSingleAuthorName(author)).filter(Boolean);
    if (authors.length) {
      const head = authors.slice(0, 3).join(', ');
      return authors.length > 3 ? `${head} и ещё ${authors.length - 3}` : head;
    }
  }
  return formatAuthorLabel(item.authors || '') || 'Неизвестный автор';
}

function parseSeriesNo(value: unknown): number | undefined {
  if (value == null || String(value).trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/** Display label for volume number (keeps non-numeric INPX values like "1-2"). */
export function formatSeriesVolumeLabel(value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  return s;
}

export function pickSeriesFromItem(
  item: Pick<InpxBookItem, 'series' | 'seriesNo' | 'seriesList'>,
  preferredSeries?: string,
): { series?: string; seriesNo?: number; seriesNoLabel?: string } {
  const prefer = preferredSeries?.trim();
  if (prefer && Array.isArray(item.seriesList)) {
    const match = item.seriesList.find(
      (s) => s.name === prefer || s.displayName === prefer,
    );
    if (match?.name?.trim()) {
      return {
        series: match.name.trim(),
        seriesNo: parseSeriesNo(match.seriesNo),
        seriesNoLabel: formatSeriesVolumeLabel(match.seriesNo),
      };
    }
  }
  if (item.series?.trim()) {
    return {
      series: item.series.trim(),
      seriesNo: parseSeriesNo(item.seriesNo),
      seriesNoLabel: formatSeriesVolumeLabel(item.seriesNo),
    };
  }
  const first = item.seriesList?.[0];
  if (first?.name?.trim()) {
    return {
      series: first.name.trim(),
      seriesNo: parseSeriesNo(first.seriesNo),
      seriesNoLabel: formatSeriesVolumeLabel(first.seriesNo),
    };
  }
  return {};
}

/**
 * INPX `libRate` → 1..5 stars for cover ribbon.
 * Server badge: `Math.floor` + clamp 0..5 (`public/app.js` renderCoverRatingBadgeHtml).
 * Values > 5 treated as legacy 0..100 (e.g. 80 → 4).
 */
export function starsFromLibRate(libRate: unknown): number | undefined {
  const n = Number(libRate);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n <= 5) return Math.min(5, Math.max(1, Math.floor(n)));
  return Math.min(5, Math.max(1, Math.round(n / 20)));
}

export function mapServerBook(
  item: InpxBookItem,
  config: ServerConfig,
  opts?: { preferredSeries?: string },
) {
  const author = formatAuthorsFromItem(item);
  const genreParts = item.genresDisplayList || (item.genres ? item.genres.split(':') : []);
  const { series, seriesNo, seriesNoLabel } = pickSeriesFromItem(item, opts?.preferredSeries);
  const rawRate = item.libRate ?? (item as { lib_rate?: unknown }).lib_rate;
  return {
    id: item.id,
    title: item.title,
    author,
    genre: genreParts[0] || 'Другое',
    subgenre: genreParts[1] || 'Разное',
    genresDisplay: genreParts.length ? genreParts : undefined,
    series,
    seriesNo,
    seriesNoLabel: seriesNoLabel || (seriesNo != null ? String(seriesNo) : undefined),
    ext: (item.ext || 'fb2').replace(/^\./, ''),
    size: item.size,
    description: item.annotation,
    rating: starsFromLibRate(rawRate),
    date: item.date,
    year: Number(String(item.date || '').match(/\b(18|19|20)\d{2}\b/)?.[0]) || undefined,
    coverUrl: displayCoverUrl(config, item.id),
    contentUrl: bookContentUrl(config, item.id),
    readProgress: item.readProgress != null ? Math.round(Number(item.readProgress)) : undefined,
  };
}

export interface DeviceTokenExchange {
  deviceToken: string;
  deviceTokenId: string;
  deviceName: string;
}

export async function exchangeDeviceToken(
  config: ServerConfig,
  deviceName = 'INPX Reader',
): Promise<DeviceTokenExchange> {
  const res = await apiFetchWithTimeout(config, '/api/auth/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ deviceName }),
  });
  if (!res.ok) {
    throw new Error(`Не удалось получить device token (HTTP ${res.status})`);
  }
  const data = await res.json() as { ok?: boolean; token?: string; tokenId?: string; deviceName?: string };
  if (!data.token || !data.tokenId) {
    throw new Error('Сервер не вернул device token');
  }
  return {
    deviceToken: data.token,
    deviceTokenId: data.tokenId,
    deviceName: data.deviceName || deviceName,
  };
}

export async function revokeDeviceToken(config: ServerConfig, tokenId: string): Promise<void> {
  const id = tokenId.trim();
  if (!id) return;
  const res = await apiFetchWithTimeout(config, `/api/auth/device/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Не удалось отозвать device token (HTTP ${res.status})`);
  }
}

export interface AppPairingPayload {
  type: 'inpx-pair';
  v: number;
  url: string;
  code: string;
  user?: string;
}

export interface AppPairingRedeemResult {
  serverUrl: string;
  username: string;
  deviceToken: string;
  deviceTokenId: string;
  deviceName: string;
}

export function parsePairingQrPayload(raw: string): AppPairingPayload {
  const text = String(raw || '').trim();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('QR-код не похож на код входа INPX');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('QR-код не похож на код входа INPX');
  }
  const obj = data as Record<string, unknown>;
  if (obj.type !== 'inpx-pair') {
    throw new Error('QR-код не похож на код входа INPX');
  }
  const url = String(obj.url || '').trim();
  const code = String(obj.code || '').trim();
  if (!url || !code) {
    throw new Error('В QR-коде нет адреса сервера или кода');
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    const proto = url.split('://', 1)[0]!.toLowerCase();
    if (proto !== 'http' && proto !== 'https') {
      throw new Error('В QR-коде некорректный адрес сервера');
    }
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[a-z0-9.-]+:\d+/i.test(url)) {
    throw new Error('В QR-коде некорректный адрес сервера');
  }
  const normalized = normalizeBaseUrl(url);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('В QR-коде некорректный адрес сервера');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('В QR-коде некорректный адрес сервера');
  }
  if (!parsed.hostname) {
    throw new Error('В QR-коде некорректный адрес сервера');
  }
  return {
    type: 'inpx-pair',
    v: Number(obj.v) || 1,
    url: normalized,
    code,
    user: obj.user != null ? String(obj.user) : undefined,
  };
}

export async function redeemPairingCode(
  serverUrl: string,
  code: string,
  deviceName = 'INPX Reader',
): Promise<AppPairingRedeemResult> {
  const base = normalizeBaseUrl(serverUrl);
  if (!base) {
    throw new Error('Не указан адрес сервера в QR-коде');
  }
  if (isNativeApp() && /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(serverUrl.trim())) {
    throw new Error('На телефоне нельзя использовать localhost. Обновите Public site URL на сервере.');
  }

  const fullUrl = `${base}/api/auth/pairing/redeem`;
  const init: RequestInit = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Request-ID': getDebugRequestId(),
    },
    body: JSON.stringify({ code, deviceName }),
  };

  let res: Response;
  let data: {
    ok?: boolean;
    error?: string;
    code?: string;
    serverUrl?: string;
    username?: string;
    deviceToken?: string;
    deviceTokenId?: string;
    deviceName?: string;
  };
  try {
    ({ res, data } = await withTimeoutSignal(CONNECTION_TIMEOUT_MS, undefined, async (signal) => {
      const response = isNativeApp()
        ? await fetch(fullUrl, { ...init, signal })
        : await fetch(`/api/proxy?url=${encodeURIComponent(fullUrl)}`, {
            ...init,
            signal,
          });
      const body = await response.json().catch(() => ({})) as typeof data;
      return { res: response, data: body };
    }));
  } catch (e: unknown) {
    if (e instanceof Error && e.message.startsWith('Timeout:')) throw e;
    if (isUnreachableServerError(e)) {
      throw new Error(`Нет связи с ${base}. Проверьте, что телефон в той же сети или указан внешний адрес.`);
    }
    throw e instanceof Error ? e : new Error(String(e));
  }

  if (!res.ok || !data.ok) {
    if (data.code === 'PAIRING_INVALID' || res.status === 400) {
      throw new Error(data.error || 'Код недействителен или истёк');
    }
    if (res.status === 429) {
      throw new Error(data.error || 'Слишком много попыток. Попробуйте позже.');
    }
    throw new Error(data.error || `Не удалось войти по QR (HTTP ${res.status})`);
  }
  if (!data.deviceToken || !data.deviceTokenId || !data.username) {
    throw new Error('Сервер не вернул device token');
  }
  // serverUrl из ответа принимаем только с того же origin, куда отправили код:
  // на http:// (LAN) MITM мог бы подменить адрес и собирать device token дальше.
  let redeemedUrl = base;
  if (data.serverUrl) {
    const candidate = normalizeBaseUrl(data.serverUrl);
    try {
      if (new URL(candidate).origin === new URL(base).origin) {
        redeemedUrl = candidate;
      }
    } catch {
      /* невалидный serverUrl — остаёмся на base */
    }
  }
  return {
    serverUrl: redeemedUrl,
    username: data.username,
    deviceToken: data.deviceToken,
    deviceTokenId: data.deviceTokenId,
    deviceName: data.deviceName || deviceName,
  };
}
