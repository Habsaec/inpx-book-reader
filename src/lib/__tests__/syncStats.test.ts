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
});
