import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetOfflineReaderCacheForTests, writeOfflineReaderData } from '../offlineReaderStore';
import { bookHasPendingSync, countCrossDeviceConflicts, getSyncAttentionCount } from '../syncStats';
import { getFailedSyncOps } from '../localDb';

vi.mock('../localDb', async () => {
  const actual = await vi.importActual<typeof import('../localDb')>('../localDb');
  return {
    ...actual,
    getFailedSyncOps: vi.fn(async () => []),
  };
});

describe('syncStats', () => {
  beforeEach(() => {
    __resetOfflineReaderCacheForTests();
  });

  it('reports pending progress when positionDirty is true', () => {
    writeOfflineReaderData('book-1', {
      positionVersion: 4,
      position: null,
      positionDirty: true,
      positionChangedAt: '2026-07-12T10:00:00.000Z',
      serverPositionUpdatedAt: '2026-07-12T12:00:00.000Z',
      progress: 40,
      bookmarks: [],
      annotations: [],
    });
    expect(bookHasPendingSync('book-1')).toBe(true);
  });

  it('reports pending progress when baseRevision lags serverRevision', () => {
    writeOfflineReaderData('book-1', {
      positionVersion: 4,
      position: null,
      positionDirty: false,
      baseRevision: 2,
      serverRevision: 4,
      positionChangedAt: '2026-07-12T10:00:00.000Z',
      serverPositionUpdatedAt: '2026-07-12T12:00:00.000Z',
      progress: 40,
      bookmarks: [],
      annotations: [],
    });
    expect(bookHasPendingSync('book-1')).toBe(true);
  });

  it('does not report pending when CAS state is clean', () => {
    writeOfflineReaderData('book-1', {
      positionVersion: 4,
      position: null,
      positionDirty: false,
      baseRevision: 4,
      serverRevision: 4,
      positionChangedAt: '2026-07-12T10:00:00.000Z',
      serverPositionUpdatedAt: '2026-07-12T12:00:00.000Z',
      progress: 40,
      bookmarks: [],
      annotations: [],
    });
    expect(bookHasPendingSync('book-1')).toBe(false);
  });

  it('does not treat missing serverPositionUpdatedAt as pending when not dirty', () => {
    writeOfflineReaderData('book-1', {
      positionVersion: 4,
      position: null,
      positionDirty: false,
      baseRevision: 1,
      serverRevision: 1,
      positionChangedAt: '2026-07-12T10:00:00.000Z',
      serverPositionUpdatedAt: null,
      progress: 40,
      bookmarks: [],
      annotations: [],
    });
    expect(bookHasPendingSync('book-1')).toBe(false);
  });

  it('does not keep bookmarks pending when counts already match after sync', () => {
    writeOfflineReaderData('book-1', {
      positionVersion: 4,
      position: null,
      positionDirty: false,
      baseRevision: 1,
      serverRevision: 1,
      progress: 40,
      bookmarks: [{ id: 1, position: 'cfi-1', title: 'A', createdAt: '2026-07-12T10:00:00.000Z' }],
      annotations: [],
      bookmarksChangedAt: '2026-07-12T10:00:00.000Z',
      serverBookmarksRev: '1970-01-01T00:00:00.000Z',
      serverBookmarkCount: 1,
    });
    expect(bookHasPendingSync('book-1')).toBe(false);
  });

  it('reports bookmarks pending when local count differs from server count', () => {
    writeOfflineReaderData('book-1', {
      positionVersion: 4,
      position: null,
      positionDirty: false,
      baseRevision: 1,
      serverRevision: 1,
      progress: 40,
      bookmarks: [
        { id: 1, position: 'cfi-1', title: 'A', createdAt: '2026-07-12T10:00:00.000Z' },
        { id: 2, position: 'cfi-2', title: 'B', createdAt: '2026-07-12T11:00:00.000Z' },
      ],
      annotations: [],
      bookmarksChangedAt: '2026-07-12T11:00:00.000Z',
      serverBookmarksRev: '1970-01-01T00:00:00.000Z',
      serverBookmarkCount: 1,
    });
    expect(bookHasPendingSync('book-1')).toBe(true);
  });

  it('countCrossDeviceConflicts only counts pendingCrossDevicePrompt', () => {
    writeOfflineReaderData('book-1', {
      positionVersion: 4,
      position: null,
      positionDirty: true,
      progress: 10,
      bookmarks: [],
      annotations: [],
      pendingCrossDevicePrompt: true,
    });
    writeOfflineReaderData('book-2', {
      positionVersion: 4,
      position: null,
      positionDirty: true,
      progress: 10,
      bookmarks: [],
      annotations: [],
      pendingCrossDevicePrompt: false,
    });
    expect(countCrossDeviceConflicts(['book-1', 'book-2'])).toBe(1);
  });

  it('getSyncAttentionCount adds failed queue ops', async () => {
    vi.mocked(getFailedSyncOps).mockResolvedValueOnce([
      { id: 1, opType: 'toggle_read', bookId: 'x', payload: '{}', attempts: 3, createdAt: '' },
    ] as unknown as Awaited<ReturnType<typeof getFailedSyncOps>>);
    writeOfflineReaderData('book-1', {
      positionVersion: 4,
      position: null,
      progress: 10,
      bookmarks: [],
      annotations: [],
      pendingCrossDevicePrompt: true,
    });
    expect(await getSyncAttentionCount(['book-1'])).toBe(2);
  });
});
