import {
  deleteReaderData,
  getAllReaderDataEntries,
  getReaderDataJson,
  initLocalDb,
  upsertReaderData,
} from './localDb';

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
  position: string | null;
  /** Book-wide progress 0–100 (derived from fraction, 0.0001% precision). */
  progress: number;
  /** Primary resume anchor: 0.0–1.0 through the book (content-based, not page numbers). */
  fraction?: number | null;
  /** FB2 TOC href for cross-device restore (e.g. "3" or "3#2"). */
  fb2Href?: string | null;
  /** Paginator section index when position was saved. */
  sectionIndex?: number | null;
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
  /** Last known server collection revisions (for last-write-wins sync). */
  serverBookmarksRev?: string | null;
  serverAnnotationsRev?: string | null;
  serverPositionUpdatedAt?: string | null;
  serverBookmarkCount?: number;
  serverAnnotationCount?: number;
  serverPositionProgress?: number;
  updatedAt?: string;
}

export function offlineReaderStorageKey(bookId: string): string {
  return `inpx_offline_reader_${bookId}`;
}

const cache = new Map<string, OfflineReaderData>();
const persistTimers = new Map<string, number>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function nullableFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeOfflineReaderData(data: Partial<OfflineReaderData>): OfflineReaderData {
  return {
    position: data.position ?? null,
    progress: Number(data.progress) || 0,
    fraction: nullableFiniteNumber(data.fraction),
    fb2Href: typeof data.fb2Href === 'string' ? data.fb2Href : null,
    sectionIndex: nullableFiniteNumber(data.sectionIndex),
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
    serverBookmarksRev: data.serverBookmarksRev ?? null,
    serverAnnotationsRev: data.serverAnnotationsRev ?? null,
    serverPositionUpdatedAt: data.serverPositionUpdatedAt ?? null,
    serverBookmarkCount: Number.isFinite(Number(data.serverBookmarkCount))
      ? Number(data.serverBookmarkCount)
      : -1,
    serverAnnotationCount: Number.isFinite(Number(data.serverAnnotationCount))
      ? Number(data.serverAnnotationCount)
      : -1,
    serverPositionProgress: Number.isFinite(Number(data.serverPositionProgress))
      ? Number(data.serverPositionProgress)
      : -1,
    updatedAt: data.updatedAt,
  };
}

function emptyReaderData(): OfflineReaderData {
  return {
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
    sectionPageFraction: data.sectionPageFraction,
    paginatorPage: data.paginatorPage,
    paginatorPages: data.paginatorPages,
    layoutMode: data.layoutMode,
    positionChangedAt: data.positionChangedAt,
  };
}

function isFlushLikeRegression(
  prev: OfflineReaderData,
  incoming: OfflineReaderData,
  saveReason?: string | null,
): boolean {
  if (saveReason !== 'flush') return false;
  const prevFrac = readerDataFraction(prev);
  const incomingFrac = readerDataFraction(incoming);
  return incomingFrac + 0.02 < prevFrac;
}

function pickBestPositionFields(
  prev: OfflineReaderData,
  incoming: OfflineReaderData,
  saveReason?: string | null,
): ReturnType<typeof positionFieldsFrom> {
  if (isSpuriousPositionReset(prev, incoming) || isFlushLikeRegression(prev, incoming, saveReason)) {
    return positionFieldsFrom(prev);
  }
  const prevFrac = readerDataFraction(prev);
  const incomingFrac = readerDataFraction(incoming);
  const prevTs = readerDataTimestamp(prev);
  const incomingTs = readerDataTimestamp(incoming);
  if (!hasOfflineReadingProgress(prev)) {
    return positionFieldsFrom(incoming);
  }
  if (incomingTs > prevTs) {
    return positionFieldsFrom(incoming);
  }
  if (incomingFrac > prevFrac + 1e-5) {
    return positionFieldsFrom(incoming);
  }
  if (incomingTs >= prevTs && Math.abs(incomingFrac - prevFrac) <= 1e-5) {
    return positionFieldsFrom(incoming);
  }
  return positionFieldsFrom(prev);
}

export function hasOfflineReadingProgress(data: OfflineReaderData): boolean {
  if (data.position?.trim()) return true;
  if ((data.fraction ?? 0) > 0) return true;
  if ((data.progress ?? 0) > 0) return true;
  if (data.fb2Href?.trim()) return true;
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
  const saveReason = payload.positionSaveReason ?? null;
  const incoming = normalizeOfflineReaderData({ ...emptyReaderData(), ...payload });
  const positionFields = pickBestPositionFields(prev, incoming, saveReason);
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
    deletedBookmarkPositions: incoming.deletedBookmarkPositions?.length
      ? incoming.deletedBookmarkPositions
      : prev.deletedBookmarkPositions,
    deletedAnnotationCfis: incoming.deletedAnnotationCfis?.length
      ? incoming.deletedAnnotationCfis
      : prev.deletedAnnotationCfis,
    bookmarksChangedAt: incoming.bookmarksChangedAt ?? prev.bookmarksChangedAt,
    annotationsChangedAt: incoming.annotationsChangedAt ?? prev.annotationsChangedAt,
  };
  writeOfflineReaderData(bookId, next);
  if (hasOfflineReaderChanges(next)) {
    primeReaderLocalStorage(bookId);
  }
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

/** Не затирать позицию, обновлённую в читалке во время долгого sync. */
export function applyNewerLocalPositionIfNeeded(bookId: string, draft: OfflineReaderData): OfflineReaderData {
  const fresh = readOfflineReaderData(bookId);
  const freshTs = readerDataTimestamp(fresh);
  const draftTs = readerDataTimestamp(draft);
  if (freshTs > draftTs && hasOfflineReadingProgress(fresh)) {
    return { ...draft, ...positionFieldsFrom(fresh) };
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

function schedulePersist(bookId: string, data: OfflineReaderData): void {
  const prev = persistTimers.get(bookId);
  if (prev !== undefined) globalThis.clearTimeout(prev);
  persistTimers.set(
    bookId,
    globalThis.setTimeout(() => {
      persistTimers.delete(bookId);
      const payload = { ...data, updatedAt: new Date().toISOString() };
      void upsertReaderData(bookId, JSON.stringify(payload));
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
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key?.startsWith('inpx_offline_reader_')) continue;
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
    if (legacy && hasOfflineReaderChanges(legacy) && !hasOfflineReaderChanges(cached)) {
      const merged = normalizeOfflineReaderData({ ...cached, ...legacy });
      cache.set(bookId, merged);
      schedulePersist(bookId, merged);
      return merged;
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
  cache.set(bookId, empty);
  return empty;
}

export function writeOfflineReaderData(bookId: string, data: OfflineReaderData): void {
  const next = { ...data, updatedAt: new Date().toISOString() };
  cache.set(bookId, next);
  schedulePersist(bookId, next);
}

export async function flushOfflineReaderStore(): Promise<void> {
  for (const [bookId, timer] of persistTimers.entries()) {
    globalThis.clearTimeout(timer);
    persistTimers.delete(bookId);
    const data = cache.get(bookId);
    if (data) {
      await upsertReaderData(bookId, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
    }
  }
}

export function clearOfflineReaderData(bookId: string): void {
  cache.delete(bookId);
  const t = persistTimers.get(bookId);
  if (t) window.clearTimeout(t);
  persistTimers.delete(bookId);
  try {
    localStorage.removeItem(offlineReaderStorageKey(bookId));
  } catch {
    /* ignore */
  }
  void deleteReaderData(bookId);
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

/** Убрать книгу из «недавно читали» — сброс позиции и прогресса локально. */
export function clearOfflineReadingHistory(bookId: string): void {
  const data = readOfflineReaderData(bookId);
  writeOfflineReaderData(bookId, {
    ...data,
    position: null,
    progress: 0,
    fraction: 0,
    fb2Href: null,
    sectionIndex: null,
    sectionPageFraction: null,
    paginatorPage: null,
    paginatorPages: null,
    layoutMode: null,
    positionChangedAt: nowIso(),
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

export interface OfflineReaderExport {
  version: 1;
  bookId: string;
  exportedAt: string;
  position: string | null;
  progress: number;
  fraction?: number | null;
  sectionIndex?: number | null;
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
  hydrated = false;
  hydratePromise = null;
}
