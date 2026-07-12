import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bookHasPendingSync, summarizeReaderSyncPending, syncOpLabel } from '../syncStats';
import {
  __resetOfflineReaderCacheForTests,
  offlineReaderStorageKey,
  writeOfflineReaderData,
} from '../offlineReaderStore';

const lsStore = new Map<string, string>();

describe('syncStats', () => {
  beforeEach(() => {
    __resetOfflineReaderCacheForTests();
    lsStore.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => lsStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        lsStore.set(key, value);
      },
      removeItem: (key: string) => {
        lsStore.delete(key);
      },
      clear: () => lsStore.clear(),
    });
  });

  it('labels known sync op types', () => {
    expect(syncOpLabel('remove_history')).toBe('История');
    expect(syncOpLabel('custom_op')).toBe('custom_op');
  });

  it('counts books with pending progress', () => {
    lsStore.set(
      offlineReaderStorageKey('b1'),
      JSON.stringify({
        position: 'app:ch1:p1',
        progress: 10,
        bookmarks: [],
        annotations: [],
        positionChangedAt: '2026-07-11T12:00:00.000Z',
        serverPositionUpdatedAt: '2026-07-10T12:00:00.000Z',
      }),
    );
    lsStore.set(
      offlineReaderStorageKey('b2'),
      JSON.stringify({
        position: null,
        progress: 0,
        bookmarks: [],
        annotations: [],
      }),
    );

    const summary = summarizeReaderSyncPending(['b1', 'b2']);
    expect(summary.progressBooks).toBe(1);
    expect(summary.bookmarkBooks).toBe(0);
    expect(summary.annotationBooks).toBe(0);
  });

  it('counts books with pending bookmarks and annotations', () => {
    writeOfflineReaderData('b3', {
      position: null,
      progress: 0,
      bookmarks: [{ id: 1, position: 'x', title: 't' }],
      annotations: [{ id: 1, cfi: 'c', text: 't', note: '', color: 'yellow' }],
      bookmarksChangedAt: '2026-07-11T12:00:00.000Z',
      annotationsChangedAt: '2026-07-11T12:00:00.000Z',
      deletedBookmarkPositions: [],
      deletedAnnotationCfis: [],
    });

    const summary = summarizeReaderSyncPending(['b3']);
    expect(summary.bookmarkBooks).toBe(1);
    expect(summary.annotationBooks).toBe(1);
  });

  it('bookHasPendingSync is true when any reader data is dirty', () => {
    lsStore.set(
      offlineReaderStorageKey('b4'),
      JSON.stringify({
        position: 'x',
        progress: 5,
        bookmarks: [],
        annotations: [],
        positionChangedAt: '2026-07-11T12:00:00.000Z',
      }),
    );
    expect(bookHasPendingSync('b4')).toBe(true);
    expect(bookHasPendingSync('missing')).toBe(false);
  });
});
