import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as localDb from '../localDb';
import { declinePendingPositionRevision } from '../../../public/inpx-reader/reader-shared/pending-position-revision.js';
import {
  __resetOfflineReaderCacheForTests,
  applyIframeReaderStore,
  applyNewerLocalPositionIfNeeded,
  offlineReaderStorageKey,
  migrateOfflineReaderPositionForFormat,
  primeReaderLocalStorage,
  readOfflineReaderData,
  writeOfflineReaderData,
} from '../offlineReaderStore';

const lsStore = new Map<string, string>();
const lsKeys: string[] = [];

function mockLocalStorage() {
  vi.stubGlobal('localStorage', {
    get length() {
      return lsKeys.length;
    },
    key: (index: number) => lsKeys[index] ?? null,
    getItem: (key: string) => lsStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (!lsStore.has(key)) lsKeys.push(key);
      lsStore.set(key, value);
    },
    removeItem: (key: string) => {
      lsStore.delete(key);
      const idx = lsKeys.indexOf(key);
      if (idx >= 0) lsKeys.splice(idx, 1);
    },
    clear: () => {
      lsStore.clear();
      lsKeys.length = 0;
    },
  });
}

describe('offline reader position restore', () => {
  beforeEach(() => {
    lsStore.clear();
    lsKeys.length = 0;
    mockLocalStorage();
    __resetOfflineReaderCacheForTests();
    vi.spyOn(localDb, 'upsertReaderData').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('primeReaderLocalStorage writes full store for iframe bootstrap', () => {
    const bookId = 'book-1';
    writeOfflineReaderData(bookId, {
      position: 'app:ch3:p12',
      progress: 42.5,
      fraction: 0.425,
      paginatorPage: 12,
      paginatorPages: 280,
      sectionIndex: 3,
      sectionPageFraction: 0.4,
      layoutMode: 'paginated',
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-12T10:00:00.000Z',
    });

    primeReaderLocalStorage(bookId);

    const raw = localStorage.getItem(offlineReaderStorageKey(bookId));
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as Record<string, unknown>;
    expect(parsed.paginatorPage).toBe(12);
    expect(parsed.paginatorPages).toBe(280);
    expect(parsed.sectionIndex).toBe(3);
    expect(parsed.fraction).toBe(0.425);
  });

  it('primeReaderLocalStorage skips empty progress', () => {
    primeReaderLocalStorage('empty-book');
    expect(localStorage.getItem(offlineReaderStorageKey('empty-book'))).toBeNull();
    expect(readOfflineReaderData('empty-book').progress).toBe(0);
    expect(readOfflineReaderData('empty-book').positionVersion).toBe(4);
  });

  it('applyNewerLocalPositionIfNeeded keeps fresher paginator from cache', () => {
    const bookId = 'book-race';
    writeOfflineReaderData(bookId, {
      position: 'app:ch1:p1',
      progress: 5,
      fraction: 0.05,
      paginatorPage: 1,
      paginatorPages: 200,
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-12T09:00:00.000Z',
    });

    writeOfflineReaderData(bookId, {
      ...readOfflineReaderData(bookId),
      position: 'app:ch5:p48',
      progress: 24,
      fraction: 0.24,
      paginatorPage: 48,
      paginatorPages: 200,
      positionChangedAt: '2026-07-12T10:00:00.000Z',
    });

    const staleDraft = {
      ...readOfflineReaderData(bookId),
      position: 'app:ch1:p1',
      progress: 5,
      fraction: 0.05,
      paginatorPage: 1,
      positionChangedAt: '2026-07-12T09:00:00.000Z',
      bookmarks: [{ id: 1, position: 'x', title: 't', createdAt: '2026-07-12T08:00:00.000Z' }],
    };

    const merged = applyNewerLocalPositionIfNeeded(bookId, staleDraft);
    expect(merged.paginatorPage).toBe(48);
    expect(merged.progress).toBe(24);
    expect(merged.bookmarks).toHaveLength(1);
  });

  it('keeps a newer in-reader position dirty while retaining the sync-accepted base', () => {
    const bookId = 'book-sync-race';
    writeOfflineReaderData(bookId, {
      positionVersion: 4,
      serverRevision: 4,
      baseRevision: 4,
      positionDirty: true,
      position: 'epubcfi(/6/8)',
      progress: 40,
      fraction: 0.4,
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-12T10:00:01.000Z',
    });

    const merged = applyNewerLocalPositionIfNeeded(bookId, {
      ...readOfflineReaderData(bookId),
      serverRevision: 5,
      baseRevision: 5,
      positionDirty: false,
      position: 'epubcfi(/6/4)',
      progress: 20,
      fraction: 0.2,
      positionChangedAt: '2026-07-12T10:00:00.000Z',
    });

    expect(merged).toMatchObject({
      position: 'epubcfi(/6/8)',
      fraction: 0.4,
      serverRevision: 5,
      baseRevision: 5,
      positionDirty: true,
      dismissedServerRevision: null,
    });
  });

  it('first iframe relocate clears dismissed revision and marks position dirty', () => {
    const bookId = 'book-dismissed-relocate';
    writeOfflineReaderData(bookId, {
      positionVersion: 4,
      serverRevision: 3,
      baseRevision: 3,
      positionDirty: false,
      dismissedServerRevision: 3,
      position: 'epubcfi(/6/4)',
      progress: 20,
      fraction: 0.2,
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-12T10:00:00.000Z',
    });

    applyIframeReaderStore(bookId, {
      position: 'epubcfi(/6/5)',
      progress: 21,
      fraction: 0.21,
      positionChangedAt: '2026-07-12T10:00:01.000Z',
    });

    expect(readOfflineReaderData(bookId)).toMatchObject({
      baseRevision: 3,
      serverRevision: 3,
      positionDirty: true,
      dismissedServerRevision: null,
      fraction: 0.21,
    });
  });

  it('persists iframe decline revision metadata in the parent store', () => {
    const bookId = 'book-iframe-decline';
    writeOfflineReaderData(bookId, {
      positionVersion: 4,
      serverRevision: 3,
      baseRevision: 2,
      positionDirty: true,
      position: 'epubcfi(/6/4)',
      progress: 20,
      fraction: 0.2,
      bookmarks: [],
      annotations: [],
    });
    const declined = declinePendingPositionRevision({
      ...readOfflineReaderData(bookId),
      serverRevision: 3,
    });

    applyIframeReaderStore(bookId, declined);

    expect(readOfflineReaderData(bookId)).toMatchObject({
      position: 'epubcfi(/6/4)',
      baseRevision: 3,
      serverRevision: 3,
      positionDirty: false,
      dismissedServerRevision: 3,
    });
  });

  it('applyIframeReaderStore ignores spurious reset to start', () => {
    const bookId = 'book-reset';
    writeOfflineReaderData(bookId, {
      position: null,
      progress: 94,
      fraction: 0.94,
      fb2Href: '7#3',
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-12T10:00:00.000Z',
    });

    applyIframeReaderStore(bookId, {
      position: '',
      progress: 1,
      fraction: 0.01,
      fb2Href: null,
      positionChangedAt: '2026-07-12T10:00:05.000Z',
    });

    const data = readOfflineReaderData(bookId);
    expect(data.fraction).toBe(0.94);
    expect(data.progress).toBe(94);
    expect(data.fb2Href).toBe('7#3');
  });

  it('applyIframeReaderStore accepts backward position on flush', () => {
    const bookId = 'book-backward-flush';
    writeOfflineReaderData(bookId, {
      position: null,
      progress: 94,
      fraction: 0.94,
      fb2Href: '11#2',
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-12T10:00:00.000Z',
    });

    applyIframeReaderStore(bookId, {
      position: '',
      progress: 40,
      fraction: 0.4,
      fb2Href: '5#1',
      positionChangedAt: '2026-07-12T11:00:00.000Z',
      positionSaveReason: 'flush',
    });

    const data = readOfflineReaderData(bookId);
    expect(data.fraction).toBe(0.4);
    expect(data.fb2Href).toBe('5#1');
  });

  it('applyIframeReaderStore accepts newer reading progress below previous high water mark', () => {
    const bookId = 'book-forward';
    writeOfflineReaderData(bookId, {
      position: null,
      progress: 94,
      fraction: 0.94,
      fb2Href: '11#2',
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-12T10:00:00.000Z',
    });

    applyIframeReaderStore(bookId, {
      position: '',
      progress: 55,
      fraction: 0.55,
      fb2Href: '5#1',
      positionChangedAt: '2026-07-12T11:00:00.000Z',
    });

    const data = readOfflineReaderData(bookId);
    expect(data.fraction).toBe(0.55);
    expect(data.fb2Href).toBe('5#1');
    const raw = localStorage.getItem(offlineReaderStorageKey(bookId));
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).fraction).toBe(0.55);
  });

  it('schedulePersist does not clear primed localStorage used by iframe', async () => {
    vi.useFakeTimers();
    const bookId = 'book-persist';
    writeOfflineReaderData(bookId, {
      position: null,
      progress: 62,
      fraction: 0.62,
      fb2Href: '9#1',
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-12T10:00:00.000Z',
    });
    primeReaderLocalStorage(bookId);
    const key = offlineReaderStorageKey(bookId);
    expect(localStorage.getItem(key)).toBeTruthy();

    writeOfflineReaderData(bookId, {
      ...readOfflineReaderData(bookId),
      progress: 63,
      fraction: 0.63,
      positionChangedAt: '2026-07-12T10:00:05.000Z',
    });
    primeReaderLocalStorage(bookId);

    vi.advanceTimersByTime(300);
    await vi.runOnlyPendingTimersAsync();
    const raw = localStorage.getItem(key);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { fraction?: number };
    expect(parsed.fraction).toBe(0.63);
  });

  it('resets every v3 FB2 anchor during format-aware migration', () => {
    localStorage.setItem(offlineReaderStorageKey('legacy-fb2'), JSON.stringify({
      positionVersion: 3,
      serverRevision: 7,
      baseRevision: 7,
      positionDirty: true,
      position: 'legacy-fb2-position',
      progress: 73,
      fraction: 0.73,
      fb2Href: '8#2',
      sectionIndex: 8,
      sectionPageFraction: 0.4,
      paginatorPage: 12,
      paginatorPages: 30,
      layoutMode: 'paginated',
      anchorOffset: 512,
      anchorWord: 'legacy',
      textOffset: 513,
      textQuote: 'legacy exact quote',
      textSectionLength: 8000,
      bookmarks: [],
      annotations: [],
    }));

    expect(migrateOfflineReaderPositionForFormat('legacy-fb2', 'fb2')).toBe(true);
    expect(readOfflineReaderData('legacy-fb2')).toMatchObject({
      positionVersion: 4,
      serverRevision: 0,
      baseRevision: 0,
      positionDirty: false,
      position: null,
      progress: 0,
      fraction: null,
      fb2Href: null,
      sectionIndex: null,
      sectionPageFraction: null,
      paginatorPage: null,
      paginatorPages: null,
      layoutMode: null,
      anchorOffset: null,
      anchorWord: '',
      textOffset: null,
      textQuote: null,
      textSectionLength: null,
    });
  });

  it('preserves only the CFI when migrating a v3 EPUB position', () => {
    localStorage.setItem(offlineReaderStorageKey('legacy-epub'), JSON.stringify({
      positionVersion: 3,
      serverRevision: 9,
      baseRevision: 9,
      position: 'epubcfi(/6/8)',
      progress: 42,
      fraction: 0.42,
      fb2Href: '4#2',
      sectionIndex: 4,
      sectionPageFraction: 0.5,
      paginatorPage: 15,
      paginatorPages: 90,
      layoutMode: 'paginated',
      anchorOffset: 256,
      anchorWord: 'legacy',
      textOffset: 257,
      textQuote: 'legacy exact quote',
      textSectionLength: 7000,
      bookmarks: [],
      annotations: [],
    }));

    expect(migrateOfflineReaderPositionForFormat('legacy-epub', '.epub')).toBe(true);
    expect(readOfflineReaderData('legacy-epub')).toMatchObject({
      positionVersion: 4,
      serverRevision: 0,
      baseRevision: 0,
      positionDirty: true,
      position: 'epubcfi(/6/8)',
      progress: 0,
      fraction: null,
      fb2Href: null,
      sectionIndex: null,
      sectionPageFraction: null,
      paginatorPage: null,
      paginatorPages: null,
      layoutMode: null,
      anchorOffset: null,
      anchorWord: '',
      textOffset: null,
      textQuote: null,
      textSectionLength: null,
    });
  });
});
