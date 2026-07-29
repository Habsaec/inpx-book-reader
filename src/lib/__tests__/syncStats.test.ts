import { beforeEach, describe, expect, it } from 'vitest';
import { __resetOfflineReaderCacheForTests, writeOfflineReaderData } from '../offlineReaderStore';
import { bookHasPendingSync } from '../syncStats';

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
});
