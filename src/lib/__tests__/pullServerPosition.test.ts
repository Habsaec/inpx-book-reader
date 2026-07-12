import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetOfflineReaderCacheForTests, readOfflineReaderData, writeOfflineReaderData } from '../offlineReaderStore';

vi.mock('../inpxClient', () => ({
  fetchReadingPosition: vi.fn(),
  fetchReaderBookSyncMeta: vi.fn(),
}));

import { fetchReadingPosition, fetchReaderBookSyncMeta } from '../inpxClient';
import { finalizeReadingPositionSync, pullServerPositionIfAhead } from '../offlineSync';
import type { ServerConfig } from '../../types';

const config: ServerConfig = {
  url: 'http://test/',
  username: 'u',
  password: 'p',
  connectionStatus: 'connected',
};

describe('pullServerPositionIfAhead', () => {
  beforeEach(() => {
    __resetOfflineReaderCacheForTests();
    vi.mocked(fetchReadingPosition).mockReset();
    vi.mocked(fetchReaderBookSyncMeta).mockReset();
    vi.mocked(fetchReaderBookSyncMeta).mockResolvedValue(null);
  });

  it('replaces stale local progress when server is ahead', async () => {
    writeOfflineReaderData('book-1', {
      position: null,
      progress: 62,
      fraction: 0.62,
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-11T10:00:00.000Z',
    });

    vi.mocked(fetchReadingPosition).mockResolvedValue({
      position: '',
      progress: 94,
      fraction: 0.94,
      fb2Href: '12#45',
      updatedAt: '2026-07-12T12:00:00.000Z',
    });

    const pulled = await pullServerPositionIfAhead(config, 'book-1');
    expect(pulled).toBe(true);

    const local = readOfflineReaderData('book-1');
    expect(local.progress).toBe(94);
    expect(local.fraction).toBe(0.94);
    expect(local.fb2Href).toBe('12#45');
    expect(local.paginatorPage).toBeNull();
  });

  it('keeps newer local progress when server is behind', async () => {
    writeOfflineReaderData('book-1', {
      position: null,
      progress: 96,
      fraction: 0.96,
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-12T14:00:00.000Z',
    });

    vi.mocked(fetchReadingPosition).mockResolvedValue({
      position: '',
      progress: 62,
      fraction: 0.62,
      updatedAt: '2026-07-11T10:00:00.000Z',
    });

    const pulled = await pullServerPositionIfAhead(config, 'book-1');
    expect(pulled).toBe(false);
    expect(readOfflineReaderData('book-1').progress).toBe(96);
  });

  it('replaces inflated local progress when server was updated on web', async () => {
    writeOfflineReaderData('book-1', {
      position: null,
      progress: 90,
      fraction: 0.9,
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-11T10:00:00.000Z',
      serverPositionUpdatedAt: '2026-07-11T08:00:00.000Z',
      serverPositionProgress: 62,
    });

    vi.mocked(fetchReadingPosition).mockResolvedValue({
      position: '',
      progress: 85,
      fraction: 0.85,
      fb2Href: '18#3',
      updatedAt: '2026-07-12T14:00:00.000Z',
    });

    const pulled = await pullServerPositionIfAhead(config, 'book-1');
    expect(pulled).toBe(true);
    const local = readOfflineReaderData('book-1');
    expect(local.progress).toBe(85);
    expect(local.fraction).toBe(0.85);
    expect(local.fb2Href).toBe('18#3');
  });
});

describe('finalizeReadingPositionSync', () => {
  beforeEach(() => {
    __resetOfflineReaderCacheForTests();
    vi.mocked(fetchReadingPosition).mockReset();
    vi.mocked(fetchReaderBookSyncMeta).mockReset();
    vi.mocked(fetchReaderBookSyncMeta).mockResolvedValue(null);
  });

  it('pulls server position on close when web is ahead', async () => {
    writeOfflineReaderData('book-1', {
      position: null,
      progress: 62,
      fraction: 0.62,
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-11T10:00:00.000Z',
    });

    vi.mocked(fetchReadingPosition).mockResolvedValue({
      position: '',
      progress: 85,
      fraction: 0.85,
      fb2Href: '12#1',
      updatedAt: '2026-07-12T14:00:00.000Z',
    });

    const result = await finalizeReadingPositionSync(config, 'book-1');
    expect(result).toBe('pulled');
    expect(readOfflineReaderData('book-1').progress).toBe(85);
  });

  it('does not push stale local when server is ahead', async () => {
    writeOfflineReaderData('book-1', {
      position: null,
      progress: 62,
      fraction: 0.62,
      bookmarks: [],
      annotations: [],
      positionChangedAt: '2026-07-11T10:00:00.000Z',
    });

    vi.mocked(fetchReadingPosition).mockResolvedValue({
      position: '',
      progress: 85,
      fraction: 0.85,
      updatedAt: '2026-07-12T14:00:00.000Z',
    });

    const result = await finalizeReadingPositionSync(config, 'book-1');
    expect(result).toBe('pulled');
  });
});
