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
}));

import {
  fetchReadingPosition,
  ReadingPositionProtocolError,
  saveReadingPosition,
} from '../inpxClient';
import type { ServerConfig } from '../../types';
import { pushReadingPositionWithRecovery } from '../readingPositionPush';

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
    vi.mocked(fetchReadingPosition).mockResolvedValue({
      position: '',
      progress: 0,
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
    );
  });
});
