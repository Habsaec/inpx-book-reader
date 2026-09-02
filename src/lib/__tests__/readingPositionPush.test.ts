import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfflineReaderData } from '../offlineReaderStore';

vi.mock('../inpxClient', () => ({
  fetchReadingPosition: vi.fn(),
  saveReadingPosition: vi.fn(),
  ReadingPositionProtocolError: class ReadingPositionProtocolError extends Error {
    constructor() {
      super('protocol');
      this.name = 'ReadingPositionProtocolError';
    }
  },
  ReadingPositionConflictError: class ReadingPositionConflictError extends Error {
    current: unknown;
    constructor(current: unknown) {
      super('conflict');
      this.name = 'ReadingPositionConflictError';
      this.current = current;
    }
  },
}));

import {
  fetchReadingPosition,
  ReadingPositionProtocolError,
  saveReadingPosition,
} from '../inpxClient';
import type { ServerConfig } from '../../types';
import { pushReadingPositionWithRecovery, writePushSuccessFields } from '../readingPositionPush';

const config: ServerConfig = {
  url: 'http://test/',
  username: 'u',
  password: 'p',
  connectionStatus: 'connected',
};

function local(overrides: Partial<OfflineReaderData> = {}): OfflineReaderData {
  return {
    positionVersion: 4,
    serverRevision: 1,
    baseRevision: 1,
    positionDirty: true,
    position: 'epubcfi(/6/8)',
    progress: 40,
    fraction: 0.4,
    bookmarks: [],
    annotations: [],
    ...overrides,
  };
}

describe('pushReadingPositionWithRecovery', () => {
  beforeEach(() => {
    vi.mocked(saveReadingPosition).mockReset();
    vi.mocked(fetchReadingPosition).mockReset();
  });

  it('retries once after HTTP 428 by refreshing baseRevision from GET', async () => {
    vi.mocked(saveReadingPosition)
      .mockRejectedValueOnce(new ReadingPositionProtocolError())
      .mockResolvedValueOnce({
        positionVersion: 4,
        revision: 5,
        updatedAt: '2026-07-12T12:00:00.000Z',
      });
    // Same coords as local — only baseRevision was stale (protocol 428).
    vi.mocked(fetchReadingPosition).mockResolvedValue({
      position: 'epubcfi(/6/8)',
      progress: 40,
      fraction: 0.4,
      positionVersion: 4,
      revision: 4,
    });

    const result = await pushReadingPositionWithRecovery(config, 'book-1', local(), 1);

    expect(result.revision).toBe(5);
    expect(saveReadingPosition).toHaveBeenCalledTimes(2);
    expect(saveReadingPosition).toHaveBeenLastCalledWith(
      config,
      'book-1',
      'epubcfi(/6/8)',
      40,
      0.4,
      undefined,
      expect.any(Object),
      4,
      undefined,
    );
  });

  it('copies local anchors into the server snapshot after a successful push', () => {
    const fields = writePushSuccessFields(local({
      fb2Href: '0#6',
      sectionIndex: 0,
      textOffset: 116699,
      textQuote: 'local quote',
      textSectionLength: 425639,
      paginatorPage: 151,
      paginatorPages: 560,
      layoutMode: 'paginated',
      positionSessionId: 'tablet-session',
    }), {
      positionVersion: 4,
      revision: 14,
      updatedAt: '2026-09-02T17:45:45.000Z',
    }, 0.274174);

    expect(fields).toMatchObject({
      serverRevision: 14,
      baseRevision: 14,
      positionDirty: false,
      pendingCrossDevicePrompt: false,
      serverPositionFraction: 0.274174,
      serverFb2Href: '0#6',
      serverTextOffset: 116699,
      serverPaginatorPage: 151,
      serverPaginatorPages: 560,
      serverSessionId: 'tablet-session',
    });
  });
});
