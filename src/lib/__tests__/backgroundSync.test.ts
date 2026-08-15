import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetBackgroundSyncForTests,
  requestBackgroundSync,
  selectBooksNeedingSync,
  getBackgroundSyncStatus,
} from '../backgroundSync';
import { __resetOfflineReaderCacheForTests, writeOfflineReaderData } from '../offlineReaderStore';
import type { ServerConfig } from '../../types';

vi.mock('../inpxClient', () => ({
  fetchReaderSyncIndex: vi.fn(async () => ({
    activity: {
      readBooksRev: '2026-01-01T00:00:00.000Z',
      readingHistoryRev: '2026-01-01T00:00:00.000Z',
      readBookCount: 0,
      readingHistoryCount: 0,
    },
    books: [
      {
        bookId: 'a',
        bookmarksRev: '1970-01-01T00:00:00.000Z',
        annotationsRev: '1970-01-01T00:00:00.000Z',
        positionUpdatedAt: null,
        positionRevision: 0,
        bookmarkCount: 0,
        annotationCount: 0,
      },
      {
        bookId: 'b',
        bookmarksRev: '2026-08-01T00:00:00.000Z',
        annotationsRev: '1970-01-01T00:00:00.000Z',
        positionUpdatedAt: '2026-08-01T00:00:00.000Z',
        positionRevision: 5,
        bookmarkCount: 1,
        annotationCount: 0,
      },
    ],
  })),
  isAuthError: vi.fn(() => false),
}));

vi.mock('../offlineSync', () => ({
  syncAllOfflineReaders: vi.fn(async () => {}),
  syncOfflineReaderForBook: vi.fn(async () => {}),
}));

vi.mock('../syncQueueProcessor', () => ({
  processSyncQueue: vi.fn(async () => 0),
}));

vi.mock('../readerActivitySync', async () => {
  const actual = await vi.importActual<typeof import('../readerActivitySync')>('../readerActivitySync');
  return {
    ...actual,
    applyServerActivitySyncMeta: vi.fn(),
    readReaderActivitySync: vi.fn(() => ({
      readingHistoryLocalRev: null,
      readBooksLocalRev: null,
      lastServerReadingHistoryRev: '2026-01-01T00:00:00.000Z',
      lastServerReadBooksRev: '2026-01-01T00:00:00.000Z',
      lastServerReadingHistoryCount: 0,
      lastServerReadBookCount: 0,
    })),
  };
});

vi.mock('../offlineReaderStore', async () => {
  const actual = await vi.importActual<typeof import('../offlineReaderStore')>('../offlineReaderStore');
  return {
    ...actual,
    flushOfflineReaderStore: vi.fn(async () => {}),
  };
});

const config = {
  url: 'http://localhost',
  username: 'u',
  password: '',
  connectionStatus: 'connected',
} as ServerConfig;

describe('backgroundSync', () => {
  beforeEach(() => {
    __resetOfflineReaderCacheForTests();
    resetBackgroundSyncForTests();
    vi.clearAllMocks();
  });

  it('selectBooksNeedingSync picks local dirty and server-ahead books', () => {
    writeOfflineReaderData('a', {
      positionVersion: 4,
      position: null,
      positionDirty: true,
      baseRevision: 0,
      serverRevision: 0,
      progress: 10,
      bookmarks: [],
      annotations: [],
    });
    writeOfflineReaderData('b', {
      positionVersion: 4,
      position: null,
      positionDirty: false,
      baseRevision: 1,
      serverRevision: 1,
      serverBookmarksRev: '1970-01-01T00:00:00.000Z',
      progress: 10,
      bookmarks: [],
      annotations: [],
    });
    writeOfflineReaderData('c', {
      positionVersion: 4,
      position: null,
      positionDirty: false,
      baseRevision: 2,
      serverRevision: 2,
      serverBookmarksRev: '2026-08-01T00:00:00.000Z',
      serverAnnotationsRev: '1970-01-01T00:00:00.000Z',
      progress: 10,
      bookmarks: [],
      annotations: [],
    });

    const index = [
      {
        bookId: 'a',
        bookmarksRev: '1970-01-01T00:00:00.000Z',
        annotationsRev: '1970-01-01T00:00:00.000Z',
        positionUpdatedAt: null,
        positionRevision: 0,
        bookmarkCount: 0,
        annotationCount: 0,
      },
      {
        bookId: 'b',
        bookmarksRev: '2026-08-01T00:00:00.000Z',
        annotationsRev: '1970-01-01T00:00:00.000Z',
        positionUpdatedAt: '2026-08-01T00:00:00.000Z',
        positionRevision: 5,
        bookmarkCount: 1,
        annotationCount: 0,
      },
      {
        bookId: 'c',
        bookmarksRev: '2026-08-01T00:00:00.000Z',
        annotationsRev: '1970-01-01T00:00:00.000Z',
        positionUpdatedAt: null,
        positionRevision: 2,
        bookmarkCount: 0,
        annotationCount: 0,
      },
    ];

    expect(selectBooksNeedingSync(['a', 'b', 'c'], index).sort()).toEqual(['a', 'b']);
  });

  it('coalesces concurrent requests while a cycle runs', async () => {
    const { syncAllOfflineReaders } = await import('../offlineSync');
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    vi.mocked(syncAllOfflineReaders).mockImplementationOnce(async () => {
      await gate;
    });

    writeOfflineReaderData('a', {
      positionVersion: 4,
      position: null,
      positionDirty: true,
      progress: 1,
      bookmarks: [],
      annotations: [],
    });

    const first = requestBackgroundSync({
      reason: 'resume',
      bookIds: ['a'],
      serverConfig: config,
    });

    await Promise.resolve();
    expect(getBackgroundSyncStatus().running).toBe(true);

    const second = await requestBackgroundSync({
      reason: 'periodic',
      bookIds: ['a'],
      serverConfig: config,
    });
    expect(second.skipped).toBe(true);

    release();
    const result = await first;
    expect(result.ok).toBe(true);
    expect(getBackgroundSyncStatus().running).toBe(false);
  });

  it('debounces rapid non-manual starts', async () => {
    let t = 1_000_000;
    resetBackgroundSyncForTests({ now: () => t, minGapMs: 40 });

    writeOfflineReaderData('a', {
      positionVersion: 4,
      position: null,
      positionDirty: true,
      progress: 1,
      bookmarks: [],
      annotations: [],
    });

    const r1 = await requestBackgroundSync({
      reason: 'resume',
      bookIds: ['a'],
      serverConfig: config,
    });
    expect(r1.ok).toBe(true);
    expect(r1.skipped).toBeFalsy();

    t += 10;
    const r2 = await requestBackgroundSync({
      reason: 'online',
      bookIds: ['a'],
      serverConfig: config,
    });
    expect(r2.ok).toBe(true);
  });

  it('backs off when sync index fails instead of syncing every book', async () => {
    const { fetchReaderSyncIndex } = await import('../inpxClient');
    vi.mocked(fetchReaderSyncIndex).mockResolvedValueOnce(null);

    const result = await requestBackgroundSync({
      reason: 'periodic',
      bookIds: ['a', 'b'],
      serverConfig: config,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/синхронизации/i);
    expect(getBackgroundSyncStatus().backoffUntil).toBeGreaterThan(0);
  });
});

