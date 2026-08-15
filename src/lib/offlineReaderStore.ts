import {
  deleteReaderData,
  getAllReaderDataEntries,
  getReaderDataJson,
  initLocalDb,
  upsertReaderData,
} from './localDb';
import { positionsDiffer } from '../../public/inpx-reader/reader-shared/position-revision.js';

export interface OfflineReaderBookmark {
  id: number;
  position: string;
  title: string;
  createdAt?: string;
  created_at?: string;
}

export interface OfflineReaderAnnotation {
  id: number;
  cfi: string;
  text: string;
  note: string;
  color: string;
  createdAt?: string;
  created_at?: string;
}

export interface OfflineReaderData {
  /** Local position schema. Version 4 adds exact, layout-independent text anchors. */
  positionVersion?: number;
  /** Last server revision observed by this client. */
  serverRevision?: number;
  /** Server revision on which the current local position is based. */
  baseRevision?: number;
  /** True after a local position mutation not yet accepted by the server. */
  positionDirty?: boolean;
  /** Server revision explicitly declined while preserving local coordinates. */
  dismissedServerRevision?: number | null;
  position: string | null;
  /** Book-wide progress 0–100 (derived from fraction, 0.0001% precision). */
  progress: number;
  /** Primary resume anchor: 0.0–1.0 through the book (content-based, not page numbers). */
  fraction?: number | null;
  /** FB2 TOC href for cross-device restore (e.g. "3" or "3#2"). */
  fb2Href?: string | null;
  /** Paginator section index when position was saved. */
  sectionIndex?: number | null;
  /** Normalized character offset within the current section. */
  textOffset?: number | null;
  /** Text following textOffset, used to relocate an anchor after small content drift. */
  textQuote?: string | null;
  /** Normalized section text length when the anchor was captured. */
  textSectionLength?: number | null;
  /** Page fraction within section (0–1) in paginated mode. */
  sectionPageFraction?: number | null;
  /** 1-based page index in paginated layout when position was saved. */
  paginatorPage?: number | null;
  /** Total pages in paginated layout when position was saved. */
  paginatorPages?: number | null;
  /** Layout mode when position was saved (e.g. paginated / scrolled). */
  layoutMode?: string | null;
  /** Character offset of first visible word within section (primary restore key). */
  anchorOffset?: number | null;
  /** First visible word on screen when position was saved (for verification). */
  anchorWord?: string;
  bookmarks: OfflineReaderBookmark[];
  annotations: OfflineReaderAnnotation[];
  /** Positions the user deleted locally — do not re-merge from server until server confirms removal. */
  deletedBookmarkPositions?: string[];
  /** CFIs the user deleted locally — same tombstone semantics as bookmarks. */
  deletedAnnotationCfis?: string[];
  /** ISO — last local bookmark mutation. */
  bookmarksChangedAt?: string | null;
  /** ISO — last local annotation mutation. */
  annotationsChangedAt?: string | null;
  /** ISO — last local reading-position mutation. */
  positionChangedAt?: string | null;
  /** Hide from local «недавно читали» without wiping resume coordinates. */
  recentHiddenAt?: string | null;
  /** Last known server collection revisions (for last-write-wins sync). */
  serverBookmarksRev?: string | null;
  serverAnnotationsRev?: string | null;
  serverPositionUpdatedAt?: string | null;
  /** Server position snapshot declined on open — skip re-prompt until server changes. */
  dismissedServerPositionUpdatedAt?: string | null;
  serverBookmarkCount?: number;
  serverAnnotationCount?: number;
  serverPositionProgress?: number;
  /** Last known server fraction snapshot (0–1), for sync drift detection. */
  serverPositionFraction?: number;
  /** Server CFI/position snapshot for deferred cross-device prompt. */
  serverPosition?: string | null;
  /** Defer cross-device dialog until reader shows local position. */
  pendingCrossDevicePrompt?: boolean;
  /** Server fb2Href snapshot for cross-device prompt (not resume anchor). */
  serverFb2Href?: string | null;
  /** Server paginator/section snapshot for deferred cross-device accept (EPUB). */
  serverSectionIndex?: number | null;
  serverTextOffset?: number | null;
  serverTextQuote?: string | null;
  serverTextSectionLength?: number | null;
  serverSectionPageFraction?: number | null;
  serverPaginatorPage?: number | null;
  serverPaginatorPages?: number | null;
  serverLayoutMode?: string | null;
  /** Cross-device prompt already handled in React before iframe mount — skip bootstrap duplicate. */
  crossDeviceResolvedAt?: string | null;
  updatedAt?: string;
}

export function offlineReaderStorageKey(bookId: string): string {
  return `inpx_offline_reader_${bookId}`;
}

const cache = new Map<string, OfflineReaderData>();
const persistTimers = new Map<string, number>();
const pendingUpserts = new Map<string, Promise<void>>();
let flushPromise: Promise<void> | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function nullableFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeOfflineReaderData(data: Partial<OfflineReaderData>): OfflineReaderData {
  const serverRevision = Number.isInteger(Number(data.serverRevision)) && Number(data.serverRevision) >= 0
    ? Number(data.serverRevision)
    : 0;
  const inferredBaseRevision = data.pendingCrossDevicePrompt
    ? 0
    : serverRevision;
  const dismissedRevision =
    Number.isInteger(Number(data.dismissedServerRevision)) && Number(data.dismissedServerRevision) >= 0
      ? Number(data.dismissedServerRevision)
      : null;
  const resolvedBaseRevision = Number.isInteger(Number(data.baseRevision)) && Number(data.baseRevision) >= 0
    ? Number(data.baseRevision)
    : dismissedRevision != null
      ? Math.max(dismissedRevision, serverRevision)
      : inferredBaseRevision;
  return {
    positionVersion: Number.isInteger(Number(data.positionVersion))
      ? Number(data.positionVersion)
      : 1,
    serverRevision,
    baseRevision: resolvedBaseRevision,
    positionDirty: Boolean(data.positionDirty),
    dismissedServerRevision:
      Number.isInteger(Number(data.dismissedServerRevision)) && Number(data.dismissedServerRevision) >= 0
        ? Number(data.dismissedServerRevision)
        : null,
    position: data.position ?? null,
    progress: Number(data.progress) || 0,
    fraction: nullableFiniteNumber(data.fraction),
    fb2Href: typeof data.fb2Href === 'string' ? data.fb2Href : null,
    sectionIndex: nullableFiniteNumber(data.sectionIndex),
    textOffset: nullableFiniteNumber(data.textOffset),
    textQuote: typeof data.textQuote === 'string' ? data.textQuote : null,
    textSectionLength: nullableFiniteNumber(data.textSectionLength),
    sectionPageFraction: nullableFiniteNumber(data.sectionPageFraction),
    paginatorPage: nullableFiniteNumber(data.paginatorPage),
    paginatorPages: nullableFiniteNumber(data.paginatorPages),
    layoutMode: typeof data.layoutMode === 'string' ? data.layoutMode : null,
    anchorOffset: nullableFiniteNumber(data.anchorOffset),
    anchorWord: typeof data.anchorWord === 'string' ? data.anchorWord : '',
    bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
    annotations: Array.isArray(data.annotations) ? data.annotations : [],
    deletedBookmarkPositions: Array.isArray(data.deletedBookmarkPositions)
      ? data.deletedBookmarkPositions
      : [],
    deletedAnnotationCfis: Array.isArray(data.deletedAnnotationCfis) ? data.deletedAnnotationCfis : [],
    bookmarksChangedAt: data.bookmarksChangedAt ?? null,
    annotationsChangedAt: data.annotationsChangedAt ?? null,
    positionChangedAt: data.positionChangedAt ?? null,
    recentHiddenAt: typeof data.recentHiddenAt === 'string' ? data.recentHiddenAt : null,
    serverBookmarksRev: data.serverBookmarksRev ?? null,
    serverAnnotationsRev: data.serverAnnotationsRev ?? null,
    serverPositionUpdatedAt: data.serverPositionUpdatedAt ?? null,
    dismissedServerPositionUpdatedAt: data.dismissedServerPositionUpdatedAt ?? null,
    serverBookmarkCount: Number.isFinite(Number(data.serverBookmarkCount))
      ? Number(data.serverBookmarkCount)
      : -1,
    serverAnnotationCount: Number.isFinite(Number(data.serverAnnotationCount))
      ? Number(data.serverAnnotationCount)
      : -1,
    serverPositionProgress: Number.isFinite(Number(data.serverPositionProgress))
      ? Number(data.serverPositionProgress)
      : -1,
    serverPositionFraction: Number.isFinite(Number(data.serverPositionFraction))
      ? Number(data.serverPositionFraction)
      : -1,
    serverPosition: typeof data.serverPosition === 'string' ? data.serverPosition : null,
    pendingCrossDevicePrompt: Boolean(data.pendingCrossDevicePrompt),
    serverFb2Href: typeof data.serverFb2Href === 'string' ? data.serverFb2Href : null,
    serverSectionIndex: nullableFiniteNumber(data.serverSectionIndex),
    serverTextOffset: nullableFiniteNumber(data.serverTextOffset),
    serverTextQuote: typeof data.serverTextQuote === 'string' ? data.serverTextQuote : null,
    serverTextSectionLength: nullableFiniteNumber(data.serverTextSectionLength),
    serverSectionPageFraction: nullableFiniteNumber(data.serverSectionPageFraction),
    serverPaginatorPage: nullableFiniteNumber(data.serverPaginatorPage),
    serverPaginatorPages: nullableFiniteNumber(data.serverPaginatorPages),
    serverLayoutMode: typeof data.serverLayoutMode === 'string' ? data.serverLayoutMode : null,
    crossDeviceResolvedAt: data.crossDeviceResolvedAt ?? null,
    updatedAt: data.updatedAt,
  };
}

function emptyReaderData(): OfflineReaderData {
  return {
    positionVersion: 4,
    serverRevision: 0,
    baseRevision: 0,
    positionDirty: false,
    dismissedServerRevision: null,
    position: null,
    progress: 0,
    bookmarks: [],
    annotations: [],
    deletedBookmarkPositions: [],
    deletedAnnotationCfis: [],
  };
}

function readerDataTimestamp(data: OfflineReaderData): number {
  const iso = data.positionChangedAt || data.updatedAt;
  if (!iso) return 0;
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : 0;
}

function readerDataFraction(data: OfflineReaderData): number {
  if (data.fraction != null && Number.isFinite(Number(data.fraction))) {
    return Math.max(0, Math.min(1, Number(data.fraction)));
  }
  return Math.max(0, Math.min(1, (Number(data.progress) || 0) / 100));
}

/** Игнорировать ложный сброс в начало после перелистывания/смены полей (iframe relocate на ~0%). */
function isSpuriousPositionReset(prev: OfflineReaderData, incoming: OfflineReaderData): boolean {
  const prevFrac = readerDataFraction(prev);
  const incomingFrac = readerDataFraction(incoming);
  return incomingFrac < 0.02 && prevFrac > 0.05;
}

function positionFieldsFrom(data: OfflineReaderData): Pick<
  OfflineReaderData,
  | 'position'
  | 'progress'
  | 'fraction'
  | 'fb2Href'
  | 'sectionIndex'
  | 'textOffset'
  | 'textQuote'
  | 'textSectionLength'
  | 'sectionPageFraction'
  | 'paginatorPage'
  | 'paginatorPages'
  | 'layoutMode'
  | 'positionChangedAt'
> {
  return {
    position: data.position,
    progress: data.progress,
    fraction: data.fraction,
    fb2Href: data.fb2Href,
    sectionIndex: data.sectionIndex,
    textOffset: data.textOffset,
    textQuote: data.textQuote,
    textSectionLength: data.textSectionLength,
    sectionPageFraction: data.sectionPageFraction,
    paginatorPage: data.paginatorPage,
    paginatorPages: data.paginatorPages,
    layoutMode: data.layoutMode,
    positionChangedAt: data.positionChangedAt,
  };
}

function pickBestPositionFields(
  prev: OfflineReaderData,
  incoming: OfflineReaderData,
  saveReason?: string | null,
): ReturnType<typeof positionFieldsFrom> {
  const reason = saveReason != null ? String(saveReason) : '';
  const allowNearStart =
    reason === 'flush' || reason === 'navigation' || reason === 'restore-settle';
  if (!allowNearStart && isSpuriousPositionReset(prev, incoming)) {
    return positionFieldsFrom(prev);
  }
  const prevTs = readerDataTimestamp(prev);
  const incomingTs = readerDataTimestamp(incoming);
  if (!hasOfflineReadingProgress(prev)) {
    return positionFieldsFrom(incoming);
  }
  if (incomingTs >= prevTs) {
    return positionFieldsFrom(incoming);
  }
  return positionFieldsFrom(prev);
}

export function hasOfflineReadingProgress(data: OfflineReaderData): boolean {
  if (data.position?.trim()) return true;
  if ((data.fraction ?? 0) > 0) return true;
  if ((data.progress ?? 0) > 0) return true;
  if (data.fb2Href?.trim()) return true;
  if (
    data.sectionIndex != null
    && Number.isFinite(Number(data.sectionIndex))
    && data.textOffset != null
    && Number.isFinite(Number(data.textOffset))
  ) {
    return true;
  }
  if (data.paginatorPage != null && Number.isFinite(Number(data.paginatorPage))) return true;
  if (
    data.sectionIndex != null
    && Number.isFinite(Number(data.sectionIndex))
    && data.sectionPageFraction != null
    && Number.isFinite(Number(data.sectionPageFraction))
  ) {
    return true;
  }
  return false;
}

/** Любые локальные изменения читалки, не только позиция (закладки, заметки, tombstones, pending sync). */
export function hasOfflineReaderChanges(data: OfflineReaderData): boolean {
  if (hasOfflineReadingProgress(data)) return true;
  if (data.bookmarks.length > 0) return true;
  if (data.annotations.length > 0) return true;
  if ((data.deletedBookmarkPositions?.length ?? 0) > 0) return true;
  if ((data.deletedAnnotationCfis?.length ?? 0) > 0) return true;
  if (data.bookmarksChangedAt) return true;
  if (data.annotationsChangedAt) return true;
  if (data.positionChangedAt) return true;
  return false;
}

/** Слить данные из iframe-читалки в SQLite-кэш родителя. */
export function applyIframeReaderStore(
  bookId: string,
  payload: Partial<OfflineReaderData> & { positionSaveReason?: string | null },
): void {
  const prev = readOfflineReaderData(bookId);
  const incoming = normalizeOfflineReaderData({ ...prev, ...payload });
  const positionFields = pickBestPositionFields(prev, incoming, payload.positionSaveReason);
  const iframeChangedPosition = Boolean(
    payload.positionDirty
    || (
      payload.positionChangedAt
      && payload.positionChangedAt !== prev.positionChangedAt
    )
  );
  const next = {
    ...prev,
    ...incoming,
    ...positionFields,
    bookmarks: incoming.bookmarksChangedAt
      ? incoming.bookmarks
      : (incoming.bookmarks.length ? incoming.bookmarks : prev.bookmarks),
    annotations: incoming.annotationsChangedAt
      ? incoming.annotations
      : (incoming.annotations.length ? incoming.annotations : prev.annotations),
    deletedBookmarkPositions: Array.isArray(payload.deletedBookmarkPositions)
      ? (incoming.deletedBookmarkPositions ?? [])
      : prev.deletedBookmarkPositions,
    deletedAnnotationCfis: Array.isArray(payload.deletedAnnotationCfis)
      ? (incoming.deletedAnnotationCfis ?? [])
      : prev.deletedAnnotationCfis,
    bookmarksChangedAt: incoming.bookmarksChangedAt ?? prev.bookmarksChangedAt,
    annotationsChangedAt: incoming.annotationsChangedAt ?? prev.annotationsChangedAt,
    positionVersion: 4,
    serverRevision: payload.serverRevision !== undefined
      ? incoming.serverRevision
      : (prev.serverRevision ?? 0),
    baseRevision: payload.baseRevision !== undefined
      ? incoming.baseRevision
      : (prev.baseRevision ?? 0),
    positionDirty: iframeChangedPosition
      ? true
      : (payload.positionDirty !== undefined ? Boolean(payload.positionDirty) : Boolean(prev.positionDirty)),
    dismissedServerRevision: iframeChangedPosition
      ? null
      : incoming.dismissedServerRevision,
  };
  writeOfflineReaderData(bookId, next);
  if (hasOfflineReaderChanges(next)) {
    primeReaderLocalStorage(bookId);
  }
}

/** Upgrade legacy local positions once the downloaded book format is known. */
export function migrateOfflineReaderPositionForFormat(bookId: string, format: string): boolean {
  const data = readOfflineReaderData(bookId);
  if ((data.positionVersion ?? 1) >= 4) return false;
  const ext = String(format || '').replace(/^\./, '').toLowerCase();
  const reset = ext === 'fb2' || ext === 'fbz';
  const compatiblePosition = reset ? null : (data.position?.trim() || null);
  const migrated: OfflineReaderData = {
    ...data,
    positionVersion: 4,
    serverRevision: 0,
    baseRevision: 0,
    positionDirty: Boolean(compatiblePosition),
    dismissedServerRevision: null,
    position: compatiblePosition,
    progress: 0,
    fraction: null,
    fb2Href: null,
    sectionIndex: null,
    textOffset: null,
    textQuote: null,
    textSectionLength: null,
    sectionPageFraction: null,
    paginatorPage: null,
    paginatorPages: null,
    layoutMode: null,
    anchorOffset: null,
    anchorWord: '',
    positionChangedAt: reset ? null : data.positionChangedAt,
    pendingCrossDevicePrompt: false,
    serverPosition: null,
    serverPositionUpdatedAt: null,
    serverPositionProgress: -1,
    serverPositionFraction: -1,
    serverFb2Href: null,
    serverSectionIndex: null,
    serverTextOffset: null,
    serverTextQuote: null,
    serverTextSectionLength: null,
    serverSectionPageFraction: null,
    serverPaginatorPage: null,
    serverPaginatorPages: null,
    serverLayoutMode: null,
    dismissedServerPositionUpdatedAt: null,
    crossDeviceResolvedAt: null,
  };
  writeOfflineReaderData(bookId, migrated);
  if (reset) {
    try {
      localStorage.removeItem(offlineReaderStorageKey(bookId));
    } catch {
      /* SQLite cache remains authoritative. */
    }
  } else {
    primeReaderLocalStorage(bookId);
  }
  return true;
}

/** Позиция для возобновления чтения (явная → SQLite/localStorage). */
export function pickResumePosition(bookId: string, explicit?: string | null): string | null {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  const data = readOfflineReaderData(bookId);
  const pos = data.position?.trim();
  if (pos) return pos;
  return null;
}

/** Записать данные читалки в localStorage до загрузки iframe. */
export function primeReaderLocalStorage(bookId: string): void {
  const data = readOfflineReaderData(bookId);
  if (!hasOfflineReaderChanges(data)) return;
  try {
    const payload = {
      ...data,
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
    localStorage.setItem(offlineReaderStorageKey(bookId), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Не затирать позицию, которую пользователь сменил в читалке во время долгого sync. */
export function applyNewerLocalPositionIfNeeded(
  bookId: string,
  draft: OfflineReaderData,
  openedLocal?: OfflineReaderData,
): OfflineReaderData {
  const fresh = readOfflineReaderData(bookId);
  // Compare position clocks only — `updatedAt` bumps on any store write and must not undo pulls.
  if (!fresh.positionChangedAt) return draft;
  const freshTs = Date.parse(fresh.positionChangedAt);
  const draftTs = Date.parse(draft.positionChangedAt || '') || 0;
  if (
    Number.isFinite(freshTs)
    && freshTs > draftTs
    && hasOfflineReadingProgress(fresh)
  ) {
    // Restore/open only bumps the clock; same coordinates as before sync must not
    // beat a silent server pull (phone → Go7).
    if (openedLocal && !positionsDiffer(fresh, openedLocal)) {
      return draft;
    }
    return {
      ...draft,
      ...positionFieldsFrom(fresh),
      positionDirty: true,
      dismissedServerRevision: null,
    };
  }
  return draft;
}

function readLegacyLocalStorage(bookId: string): OfflineReaderData | null {
  try {
    const raw = localStorage.getItem(offlineReaderStorageKey(bookId));
    if (!raw) return null;
    return normalizeOfflineReaderData(JSON.parse(raw) as OfflineReaderData);
  } catch {
    return null;
  }
}

function enqueueUpsert(bookId: string, json: string): Promise<void> {
  const prev = pendingUpserts.get(bookId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => upsertReaderData(bookId, json));
  pendingUpserts.set(bookId, next);
  void next.finally(() => {
    if (pendingUpserts.get(bookId) === next) pendingUpserts.delete(bookId);
  });
  return next;
}

function schedulePersist(bookId: string, _data: OfflineReaderData): void {
  const prev = persistTimers.get(bookId);
  if (prev !== undefined) globalThis.clearTimeout(prev);
  persistTimers.set(
    bookId,
    globalThis.setTimeout(() => {
      persistTimers.delete(bookId);
      const data = cache.get(bookId);
      if (!data) return;
      const payload = { ...data, updatedAt: new Date().toISOString() };
      void enqueueUpsert(bookId, JSON.stringify(payload));
      // Keep iframe localStorage snapshot for GET /position during the open session.
    }, 250) as unknown as number,
  );
}

/** Загрузить все данные читалки из SQLite в память (вызывается при старте). */
export async function hydrateOfflineReaderStore(): Promise<void> {
  if (hydrated) return hydratePromise ?? Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = (async () => {
      await initLocalDb();
      const entries = await getAllReaderDataEntries();
      for (const { bookId, json } of entries) {
        try {
          const fromDb = normalizeOfflineReaderData(JSON.parse(json) as OfflineReaderData);
          const legacy = readLegacyLocalStorage(bookId);
          if (legacy && hasOfflineReaderChanges(legacy) && !hasOfflineReaderChanges(fromDb)) {
            cache.set(bookId, normalizeOfflineReaderData({ ...fromDb, ...legacy }));
            schedulePersist(bookId, cache.get(bookId)!);
          } else {
            cache.set(bookId, fromDb);
          }
        } catch {
          /* skip corrupt */
        }
      }
      if (typeof localStorage !== 'undefined') {
        const legacyKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('inpx_offline_reader_')) legacyKeys.push(key);
        }
        for (const key of legacyKeys) {
          const bookId = key.slice('inpx_offline_reader_'.length);
          if (cache.has(bookId)) {
            const cached = cache.get(bookId)!;
            const legacy = readLegacyLocalStorage(bookId);
            if (legacy && hasOfflineReaderChanges(legacy) && !hasOfflineReaderChanges(cached)) {
              const merged = normalizeOfflineReaderData({ ...cached, ...legacy });
              cache.set(bookId, merged);
              schedulePersist(bookId, merged);
            } else if (legacy && hasOfflineReaderChanges(legacy)) {
              try {
                localStorage.removeItem(offlineReaderStorageKey(bookId));
              } catch {
                /* drop stale iframe snapshot */
              }
            }
            continue;
          }
          const legacy = readLegacyLocalStorage(bookId);
          if (legacy && hasOfflineReaderChanges(legacy)) {
            cache.set(bookId, normalizeOfflineReaderData({ ...legacy }));
            schedulePersist(bookId, cache.get(bookId)!);
          }
        }
      }
      hydrated = true;
    })();
  }
  return hydratePromise;
}

export function isOfflineReaderStoreHydrated(): boolean {
  return hydrated;
}

export function readOfflineReaderData(bookId: string): OfflineReaderData {
  if (cache.has(bookId)) {
    const cached = cache.get(bookId)!;
    const legacy = readLegacyLocalStorage(bookId);
    if (legacy && hasOfflineReaderChanges(legacy)) {
      if (!hasOfflineReaderChanges(cached)) {
        const merged = normalizeOfflineReaderData({ ...cached, ...legacy });
        cache.set(bookId, merged);
        schedulePersist(bookId, merged);
        return merged;
      }
      // Both have progress — prefer the newer position clock (iframe LS vs parent cache).
      const legacyTs = Date.parse(legacy.positionChangedAt || '') || 0;
      const cachedTs = Date.parse(cached.positionChangedAt || '') || 0;
      if (legacyTs > cachedTs) {
        const merged = normalizeOfflineReaderData({
          ...cached,
          ...positionFieldsFrom(legacy),
          positionDirty: true,
          bookmarks: legacy.bookmarksChangedAt ? legacy.bookmarks : cached.bookmarks,
          annotations: legacy.annotationsChangedAt ? legacy.annotations : cached.annotations,
          deletedBookmarkPositions: Array.isArray(legacy.deletedBookmarkPositions)
            ? legacy.deletedBookmarkPositions
            : cached.deletedBookmarkPositions,
          deletedAnnotationCfis: Array.isArray(legacy.deletedAnnotationCfis)
            ? legacy.deletedAnnotationCfis
            : cached.deletedAnnotationCfis,
          bookmarksChangedAt: legacy.bookmarksChangedAt ?? cached.bookmarksChangedAt,
          annotationsChangedAt: legacy.annotationsChangedAt ?? cached.annotationsChangedAt,
        });
        cache.set(bookId, merged);
        schedulePersist(bookId, merged);
        return merged;
      }
    }
    return cached;
  }
  const legacy = readLegacyLocalStorage(bookId);
  if (legacy) {
    const merged = normalizeOfflineReaderData({ ...emptyReaderData(), ...legacy });
    if (hasOfflineReaderChanges(merged)) {
      cache.set(bookId, merged);
      schedulePersist(bookId, merged);
      return merged;
    }
    try {
      localStorage.removeItem(offlineReaderStorageKey(bookId));
    } catch {
      /* ignore stale zero snapshot */
    }
  }
  const empty = emptyReaderData();
  // Do not cache empty shells — catalog cold reads would unbounded-fill memory.
  return empty;
}

export function writeOfflineReaderData(bookId: string, data: OfflineReaderData): void {
  const next = { ...data, updatedAt: new Date().toISOString() };
  cache.set(bookId, next);
  schedulePersist(bookId, next);
}

export async function flushOfflineReaderStore(): Promise<void> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    // Drain timers and await serialized upserts; re-scan if writes arrive mid-flush.
    for (let pass = 0; pass < 3; pass++) {
      const bookIds = [...persistTimers.keys()];
      for (const bookId of bookIds) {
        const timer = persistTimers.get(bookId);
        if (timer !== undefined) globalThis.clearTimeout(timer);
        persistTimers.delete(bookId);
        const data = cache.get(bookId);
        if (data) {
          void enqueueUpsert(
            bookId,
            JSON.stringify({ ...data, updatedAt: new Date().toISOString() }),
          );
        }
      }
      if (pendingUpserts.size > 0) {
        await Promise.all([...pendingUpserts.values()].map((p) => p.catch(() => {})));
      }
      if (persistTimers.size === 0) break;
    }
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

export async function clearOfflineReaderData(bookId: string): Promise<void> {
  cache.delete(bookId);
  const t = persistTimers.get(bookId);
  if (t !== undefined) globalThis.clearTimeout(t);
  persistTimers.delete(bookId);
  try {
    localStorage.removeItem(offlineReaderStorageKey(bookId));
  } catch {
    /* ignore */
  }
  const pending = pendingUpserts.get(bookId);
  if (pending) await pending.catch(() => {});
  await deleteReaderData(bookId);
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function nowIso(): string {
  return new Date().toISOString();
}

export function deleteOfflineReaderBookmark(bookId: string, bookmarkId: number): boolean {
  const data = readOfflineReaderData(bookId);
  const removed = data.bookmarks.find((b) => b.id === bookmarkId);
  if (!removed) return false;
  writeOfflineReaderData(bookId, {
    ...data,
    bookmarks: data.bookmarks.filter((b) => b.id !== bookmarkId),
    deletedBookmarkPositions: uniqueStrings([
      ...(data.deletedBookmarkPositions || []),
      removed.position,
    ]),
    bookmarksChangedAt: nowIso(),
  });
  return true;
}

export function restoreOfflineReaderBookmark(bookId: string, bookmark: OfflineReaderBookmark): void {
  const data = readOfflineReaderData(bookId);
  if (data.bookmarks.some((b) => b.id === bookmark.id || b.position === bookmark.position)) return;
  writeOfflineReaderData(bookId, {
    ...data,
    bookmarks: [...data.bookmarks, bookmark],
    deletedBookmarkPositions: (data.deletedBookmarkPositions || []).filter((p) => p !== bookmark.position),
    bookmarksChangedAt: nowIso(),
  });
}

export function deleteOfflineReaderAnnotation(bookId: string, annotationId: number): boolean {
  const data = readOfflineReaderData(bookId);
  const removed = data.annotations.find((a) => a.id === annotationId);
  if (!removed) return false;
  writeOfflineReaderData(bookId, {
    ...data,
    annotations: data.annotations.filter((a) => a.id !== annotationId),
    deletedAnnotationCfis: uniqueStrings([...(data.deletedAnnotationCfis || []), removed.cfi]),
    annotationsChangedAt: nowIso(),
  });
  return true;
}

export function restoreOfflineReaderAnnotation(bookId: string, annotation: OfflineReaderAnnotation): void {
  const data = readOfflineReaderData(bookId);
  if (data.annotations.some((a) => a.id === annotation.id || a.cfi === annotation.cfi)) return;
  writeOfflineReaderData(bookId, {
    ...data,
    annotations: [...data.annotations, annotation],
    deletedAnnotationCfis: (data.deletedAnnotationCfis || []).filter((c) => c !== annotation.cfi),
    annotationsChangedAt: nowIso(),
  });
}

/** Put a server/list annotation into the local store without marking it as a local edit. */
export function ensureOfflineReaderAnnotation(bookId: string, annotation: OfflineReaderAnnotation): void {
  const data = readOfflineReaderData(bookId);
  const idx = data.annotations.findIndex((a) => a.id === annotation.id || a.cfi === annotation.cfi);
  if (idx >= 0) {
    const cur = data.annotations[idx];
    if (
      cur.color === annotation.color
      && cur.note === annotation.note
      && cur.text === annotation.text
    ) {
      return;
    }
    const next = [...data.annotations];
    next[idx] = { ...cur, ...annotation, id: cur.id };
    writeOfflineReaderData(bookId, { ...data, annotations: next });
    return;
  }
  writeOfflineReaderData(bookId, {
    ...data,
    annotations: [...data.annotations, annotation],
    deletedAnnotationCfis: (data.deletedAnnotationCfis || []).filter((c) => c !== annotation.cfi),
  });
}

export function updateOfflineReaderAnnotation(
  bookId: string,
  annotationId: number,
  patch: { note?: string; color?: string },
): boolean {
  const data = readOfflineReaderData(bookId);
  const idx = data.annotations.findIndex((a) => a.id === annotationId);
  if (idx < 0) return false;
  const next = [...data.annotations];
  next[idx] = {
    ...next[idx],
    ...(patch.note !== undefined ? { note: patch.note } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
  };
  writeOfflineReaderData(bookId, {
    ...data,
    annotations: next,
    annotationsChangedAt: nowIso(),
  });
  return true;
}

/** Убрать книгу из локального «недавно читали» — без сброса позиции и без dirty zero-push. */
export function clearOfflineReadingHistory(bookId: string): void {
  const data = readOfflineReaderData(bookId);
  writeOfflineReaderData(bookId, {
    ...data,
    recentHiddenAt: nowIso(),
  });
}

export function restoreOfflineReadingHistoryVisibility(bookId: string): void {
  const data = readOfflineReaderData(bookId);
  if (!data.recentHiddenAt) return;
  writeOfflineReaderData(bookId, {
    ...data,
    recentHiddenAt: null,
  });
}

/** Снять локальную отметку «прочитано» (progress ≥ 95). */
export function clearOfflineReadMark(bookId: string): void {
  const data = readOfflineReaderData(bookId);
  const fraction = data.fraction ?? (data.progress || 0) / 100;
  if ((data.progress || 0) < 95 && fraction < 0.95) return;
  writeOfflineReaderData(bookId, {
    ...data,
    progress: 94,
    fraction: Math.min(fraction, 0.94),
    positionChangedAt: nowIso(),
    positionVersion: 4,
    positionDirty: true,
  });
}

export interface LocalReaderBookmarkItem {
  id: number;
  bookId: string;
  bookTitle: string;
  label: string;
  position: string;
  ext?: string;
}

export interface LocalReaderAnnotationItem {
  id: number;
  bookId: string;
  bookTitle: string;
  text: string;
  note: string;
  cfi: string;
  color: string;
  ext?: string;
}

export function listLocalReaderBookmarks(
  books: Array<{ id: string; title: string; ext?: string }>,
): LocalReaderBookmarkItem[] {
  const out: LocalReaderBookmarkItem[] = [];
  for (const book of books) {
    const ext = (book.ext || 'fb2').replace(/^\./, '');
    for (const bm of readOfflineReaderData(book.id).bookmarks) {
      out.push({
        id: bm.id,
        bookId: book.id,
        bookTitle: book.title,
        label: bm.title || 'Закладка',
        position: bm.position,
        ext,
      });
    }
  }
  return out;
}

export function listLocalReaderAnnotations(
  books: Array<{ id: string; title: string; ext?: string }>,
): LocalReaderAnnotationItem[] {
  const out: LocalReaderAnnotationItem[] = [];
  for (const book of books) {
    const ext = (book.ext || 'fb2').replace(/^\./, '');
    for (const ann of readOfflineReaderData(book.id).annotations) {
      out.push({
        id: ann.id,
        bookId: book.id,
        bookTitle: book.title,
        text: ann.text,
        note: ann.note,
        cfi: ann.cfi,
        color: ann.color,
        ext,
      });
    }
  }
  return out;
}

export function readerBookmarkFromApi(row: {
  id: number;
  bookId: string;
  bookTitle?: string;
  label?: string;
  position?: string;
  ext?: string;
}): LocalReaderBookmarkItem {
  return {
    id: Number(row.id),
    bookId: String(row.bookId),
    bookTitle: String(row.bookTitle || ''),
    label: String(row.label || 'Закладка'),
    position: String(row.position || ''),
    ext: row.ext ? String(row.ext).replace(/^\./, '') : undefined,
  };
}

export function readerAnnotationFromApi(row: {
  id: number;
  bookId: string;
  bookTitle?: string;
  text?: string;
  note?: string;
  cfi?: string;
  color?: string;
  ext?: string;
}): LocalReaderAnnotationItem {
  return {
    id: Number(row.id),
    bookId: String(row.bookId),
    bookTitle: String(row.bookTitle || ''),
    text: String(row.text || ''),
    note: String(row.note || ''),
    cfi: String(row.cfi || ''),
    color: String(row.color || 'yellow'),
    ext: row.ext ? String(row.ext).replace(/^\./, '') : undefined,
  };
}

/** Server first, local overlays matching keys and appends unsynced items. */
export function mergeReaderBookmarkLists(
  server: LocalReaderBookmarkItem[],
  local: LocalReaderBookmarkItem[],
): LocalReaderBookmarkItem[] {
  if (!server.length) return local;
  if (!local.length) return server;
  const byKey = new Map<string, LocalReaderBookmarkItem>();
  for (const item of server) byKey.set(`${item.bookId}\0${item.position}`, item);
  for (const item of local) byKey.set(`${item.bookId}\0${item.position}`, item);
  return [...byKey.values()];
}

export function mergeReaderAnnotationLists(
  server: LocalReaderAnnotationItem[],
  local: LocalReaderAnnotationItem[],
): LocalReaderAnnotationItem[] {
  if (!server.length) return local;
  if (!local.length) return server;
  const byKey = new Map<string, LocalReaderAnnotationItem>();
  for (const item of server) byKey.set(`${item.bookId}\0${item.cfi}`, item);
  for (const item of local) byKey.set(`${item.bookId}\0${item.cfi}`, item);
  return [...byKey.values()];
}

export interface OfflineReaderExport {
  version: 1;
  bookId: string;
  exportedAt: string;
  position: string | null;
  progress: number;
  fraction?: number | null;
  sectionIndex?: number | null;
  textOffset?: number | null;
  textQuote?: string | null;
  textSectionLength?: number | null;
  anchorOffset?: number | null;
  anchorWord?: string;
  bookmarks: OfflineReaderBookmark[];
  annotations: OfflineReaderAnnotation[];
}

export function exportOfflineReaderJson(bookId: string): string {
  const data = readOfflineReaderData(bookId);
  const payload: OfflineReaderExport = {
    version: 1,
    bookId,
    exportedAt: new Date().toISOString(),
    position: data.position,
    progress: data.progress,
    fraction: data.fraction,
    sectionIndex: data.sectionIndex,
    textOffset: data.textOffset,
    textQuote: data.textQuote,
    textSectionLength: data.textSectionLength,
    anchorOffset: data.anchorOffset,
    anchorWord: data.anchorWord,
    bookmarks: data.bookmarks,
    annotations: data.annotations,
  };
  return JSON.stringify(payload, null, 2);
}

export function importOfflineReaderJson(bookId: string, json: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(json) as Partial<OfflineReaderExport>;
    if (parsed.bookId && parsed.bookId !== bookId) {
      return { ok: false, error: 'Файл от другой книги' };
    }
    const current = readOfflineReaderData(bookId);
    const deletedBm = new Set(current.deletedBookmarkPositions || []);
    const deletedAnn = new Set(current.deletedAnnotationCfis || []);
    const bmByPos = new Map(current.bookmarks.map((b) => [b.position, b]));
    for (const bm of parsed.bookmarks || []) {
      if (bm.position && !bmByPos.has(bm.position) && !deletedBm.has(bm.position)) {
        bmByPos.set(bm.position, bm);
      }
    }
    const annByCfi = new Map(current.annotations.map((a) => [a.cfi, a]));
    for (const ann of parsed.annotations || []) {
      if (ann.cfi && !annByCfi.has(ann.cfi) && !deletedAnn.has(ann.cfi)) {
        annByCfi.set(ann.cfi, ann);
      }
    }
    const importedProgress = Number(parsed.progress) || 0;
    const importedFraction = nullableFiniteNumber(parsed.fraction) ?? importedProgress / 100;
    const currentFraction = nullableFiniteNumber(current.fraction) ?? (current.progress || 0) / 100;
    const useImported = importedFraction > currentFraction;
    writeOfflineReaderData(bookId, {
      ...current,
      position: useImported ? (parsed.position ?? current.position) : current.position,
      progress: useImported ? importedProgress : (current.progress || 0),
      fraction: useImported ? importedFraction : (current.fraction ?? currentFraction),
      sectionIndex: useImported
        ? (nullableFiniteNumber(parsed.sectionIndex) ?? current.sectionIndex ?? null)
        : (current.sectionIndex ?? null),
      textOffset: useImported
        ? (nullableFiniteNumber(parsed.textOffset) ?? current.textOffset ?? null)
        : (current.textOffset ?? null),
      textQuote: useImported
        ? (typeof parsed.textQuote === 'string' ? parsed.textQuote : current.textQuote ?? null)
        : (current.textQuote ?? null),
      textSectionLength: useImported
        ? (nullableFiniteNumber(parsed.textSectionLength) ?? current.textSectionLength ?? null)
        : (current.textSectionLength ?? null),
      anchorOffset: useImported
        ? (nullableFiniteNumber(parsed.anchorOffset) ?? current.anchorOffset ?? null)
        : (current.anchorOffset ?? null),
      anchorWord: useImported ? String(parsed.anchorWord || '') : (current.anchorWord || ''),
      bookmarks: [...bmByPos.values()],
      annotations: [...annByCfi.values()],
      deletedBookmarkPositions: current.deletedBookmarkPositions,
      deletedAnnotationCfis: current.deletedAnnotationCfis,
      bookmarksChangedAt: nowIso(),
      annotationsChangedAt: nowIso(),
      positionChangedAt: useImported ? nowIso() : current.positionChangedAt,
      positionVersion: 4,
      positionDirty: useImported ? true : current.positionDirty,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Некорректный JSON' };
  }
}

/** Для vitest — сброс кэша. */
export function __resetOfflineReaderCacheForTests(): void {
  cache.clear();
  for (const t of persistTimers.values()) globalThis.clearTimeout(t);
  persistTimers.clear();
  pendingUpserts.clear();
  flushPromise = null;
  hydrated = false;
  hydratePromise = null;
}
