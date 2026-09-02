import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetOfflineReaderCacheForTests,
  readOfflineReaderData,
  writeOfflineReaderData,
} from '../offlineReaderStore';
import type { OfflineReaderData } from '../offlineReaderStore';

vi.mock('../inpxClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../inpxClient')>();
  return {
    ...actual,
    fetchReadingPosition: vi.fn(),
    saveReadingPosition: vi.fn(),
  };
});

import {
  fetchReadingPosition,
  ReadingPositionConflictError,
  saveReadingPosition,
} from '../inpxClient';
import type { ServerReadingPosition } from '../inpxClient';
import { syncOpenBookPosition } from '../openBookPositionSync';
import type { ServerConfig } from '../../types';

const config: ServerConfig = {
  url: 'http://test/',
  username: 'u',
  password: 'p',
  connectionStatus: 'connected',
};

function localPosition(overrides: Partial<OfflineReaderData> = {}): OfflineReaderData {
  return {
    positionVersion: 4,
    serverRevision: 2,
    baseRevision: 2,
    positionDirty: true,
    position: 'epubcfi(/6/4)',
    progress: 12,
    fraction: 0.12,
    positionSessionId: 'tablet-session',
    lastUserActivityAt: new Date().toISOString(),
    bookmarks: [],
    annotations: [],
    ...overrides,
  };
}

function serverPosition(overrides: Partial<ServerReadingPosition> = {}): ServerReadingPosition {
  return {
    positionVersion: 4,
    revision: 3,
    position: 'epubcfi(/6/10)',
    progress: 60,
    fraction: 0.6,
    updatedAt: '2026-07-12T12:00:00.000Z',
    sessionId: 'phone-session',
    sessionStatus: 'active',
    ...overrides,
  };
}

describe('open-book live position sync', () => {
  beforeEach(() => {
    __resetOfflineReaderCacheForTests();
    vi.mocked(fetchReadingPosition).mockReset();
    vi.mocked(saveReadingPosition).mockReset();
  });

  it('does not POST while the local session is idle', async () => {
    writeOfflineReaderData('book-1', localPosition({
      lastUserActivityAt: '2026-07-12T10:00:00.000Z',
    }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      sessionId: 'tablet-session',
      revision: 2,
      position: 'epubcfi(/6/4)',
      progress: 12,
      fraction: 0.12,
    }));

    expect(await syncOpenBookPosition(config, 'book-1', 'tablet-session')).toBe('idle');
    expect(saveReadingPosition).not.toHaveBeenCalled();
  });

  it('does not POST while a cross-device prompt is already pending', async () => {
    writeOfflineReaderData('book-1', localPosition({
      pendingCrossDevicePrompt: true,
      serverRevision: 13,
      baseRevision: 13,
      lastUserActivityAt: new Date().toISOString(),
      fraction: 0.274174,
      progress: 27.4174,
      sectionIndex: 0,
      textOffset: 116699,
      paginatorPage: 151,
      paginatorPages: 560,
      serverPositionFraction: 0.269207,
      serverPositionProgress: 26.9207,
      serverTextOffset: 114585,
      serverPaginatorPage: 44,
      serverPaginatorPages: 170,
    }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      sessionId: 'phone-session',
      revision: 13,
      fraction: 0.269207,
      progress: 26.9207,
      sectionIndex: 0,
      textOffset: 114585,
    }));

    expect(await syncOpenBookPosition(config, 'book-1', 'tablet-session')).toBe('prompt');
    expect(saveReadingPosition).not.toHaveBeenCalled();
  });

  it('stores a live prompt when another session holds a different position', async () => {
    writeOfflineReaderData('book-1', localPosition({ positionDirty: false }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition());

    expect(await syncOpenBookPosition(config, 'book-1', 'tablet-session')).toBe('prompt');
    expect(saveReadingPosition).not.toHaveBeenCalled();
    expect(readOfflineReaderData('book-1')).toMatchObject({
      pendingCrossDevicePrompt: true,
      fraction: 0.12,
      serverRevision: 3,
    });
  });

  it('pushes a dirty active session with sessionId', async () => {
    writeOfflineReaderData('book-1', localPosition());
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      sessionId: 'tablet-session',
      revision: 2,
      position: 'epubcfi(/6/4)',
      progress: 12,
      fraction: 0.12,
    }));
    vi.mocked(saveReadingPosition).mockResolvedValue({
      positionVersion: 4,
      revision: 3,
      updatedAt: '2026-07-12T12:00:00.000Z',
    });

    expect(await syncOpenBookPosition(config, 'book-1', 'tablet-session')).toBe('pushed');
    expect(saveReadingPosition).toHaveBeenCalledWith(
      config,
      'book-1',
      'epubcfi(/6/4)',
      12,
      0.12,
      undefined,
      expect.any(Object),
      2,
      'tablet-session',
    );
    expect(readOfflineReaderData('book-1').pendingCrossDevicePrompt).not.toBe(true);
  });

  it('does not jump silently after a 409 from another session', async () => {
    writeOfflineReaderData('book-1', localPosition({
      position: 'epubcfi(/6/8)',
      progress: 40,
      fraction: 0.4,
    }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      sessionId: 'tablet-session',
      revision: 2,
      position: 'epubcfi(/6/4)',
      progress: 12,
      fraction: 0.12,
    }));
    vi.mocked(saveReadingPosition).mockRejectedValue(new ReadingPositionConflictError(serverPosition()));

    expect(await syncOpenBookPosition(config, 'book-1', 'tablet-session')).toBe('prompt');
    expect(readOfflineReaderData('book-1')).toMatchObject({
      fraction: 0.4,
      pendingCrossDevicePrompt: true,
      serverRevision: 3,
    });
  });

  it('retries a same-session 409 without prompting', async () => {
    writeOfflineReaderData('book-1', localPosition());
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      sessionId: 'tablet-session',
      revision: 2,
      position: 'epubcfi(/6/4)',
      progress: 12,
      fraction: 0.12,
    }));
    vi.mocked(saveReadingPosition)
      .mockRejectedValueOnce(new ReadingPositionConflictError(serverPosition({
        sessionId: 'tablet-session',
        revision: 3,
        position: 'epubcfi(/6/4)',
        progress: 12,
        fraction: 0.12,
      })))
      .mockResolvedValueOnce({
        positionVersion: 4,
        revision: 4,
        updatedAt: '2026-07-12T12:00:01.000Z',
      });

    expect(await syncOpenBookPosition(config, 'book-1', 'tablet-session')).toBe('pushed');
    expect(saveReadingPosition).toHaveBeenCalledTimes(2);
    expect(readOfflineReaderData('book-1').pendingCrossDevicePrompt).not.toBe(true);
  });
});
