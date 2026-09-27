import { describe, it, expect, vi } from 'vitest';
import type { ServerConfig } from '../../types';
import { runBookOpenOnlineSync } from '../bookOpenSync';
import type { CrossDevicePositionChoice } from '../offlineSync';

const config: ServerConfig = {
  url: 'http://test/',
  username: 'u',
  password: 'p',
  connectionStatus: 'connected',
};

describe('runBookOpenOnlineSync', () => {
  it('skips sync when offline', async () => {
    const syncPosition = vi.fn();
    const syncReaderData = vi.fn();
    const recordReadingHistory = vi.fn();

    const result = await runBookOpenOnlineSync(false, config, 'book-1', null, {
      syncPosition,
      syncReaderData,
      recordReadingHistory,
    });

    expect(result).toEqual({ positionChoice: null, syncFailed: false });
    expect(syncPosition).not.toHaveBeenCalled();
    expect(syncReaderData).not.toHaveBeenCalled();
    expect(recordReadingHistory).not.toHaveBeenCalled();
  });

  it('does not wait for reading history before position sync', async () => {
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    const recordReadingHistory = vi.fn().mockImplementation(() => historyGate);
    const syncPosition = vi.fn().mockResolvedValue('noop' satisfies CrossDevicePositionChoice);
    const syncReaderData = vi.fn().mockResolvedValue(undefined);

    const resultPromise = runBookOpenOnlineSync(true, config, 'book-1', null, {
      syncPosition,
      syncReaderData,
      recordReadingHistory,
    });
    await vi.waitFor(() => {
      expect(syncPosition).toHaveBeenCalled();
      expect(syncReaderData).toHaveBeenCalled();
    });
    const result = await resultPromise;
    releaseHistory();

    expect(result.syncFailed).toBe(false);
    expect(recordReadingHistory).toHaveBeenCalledWith('book-1');
  });

  it('records history when opening at an explicit bookmark', async () => {
    const recordReadingHistory = vi.fn().mockResolvedValue(undefined);
    const syncPosition = vi.fn();
    const syncReaderData = vi.fn().mockResolvedValue(undefined);

    await runBookOpenOnlineSync(true, config, 'book-1', 'epubcfi(/6/4!)', {
      syncPosition,
      syncReaderData,
      recordReadingHistory,
    });

    expect(recordReadingHistory).toHaveBeenCalledWith('book-1');
    expect(syncPosition).not.toHaveBeenCalled();
  });

  it('continues open when history POST fails', async () => {
    const recordReadingHistory = vi.fn().mockRejectedValue(new Error('network down'));
    const syncPosition = vi.fn().mockResolvedValue('noop' satisfies CrossDevicePositionChoice);
    const syncReaderData = vi.fn().mockResolvedValue(undefined);

    const result = await runBookOpenOnlineSync(true, config, 'book-1', null, {
      syncPosition,
      syncReaderData,
      recordReadingHistory,
    });

    expect(result).toEqual({ positionChoice: 'noop', syncFailed: false });
    expect(syncReaderData).toHaveBeenCalled();
  });

  it('continues when position sync throws (open must not be blocked)', async () => {
    const syncPosition = vi.fn().mockRejectedValue(new Error('network down'));
    const syncReaderData = vi.fn().mockResolvedValue(undefined);

    const result = await runBookOpenOnlineSync(true, config, 'book-1', null, {
      syncPosition,
      syncReaderData,
    });

    expect(result.syncFailed).toBe(true);
    expect(syncReaderData).not.toHaveBeenCalled();
  });

  it('continues when bookmark sync throws after position sync', async () => {
    const syncPosition = vi.fn().mockResolvedValue('noop' satisfies CrossDevicePositionChoice);
    const syncReaderData = vi.fn().mockRejectedValue(new Error('timeout'));

    const result = await runBookOpenOnlineSync(true, config, 'book-1', null, {
      syncPosition,
      syncReaderData,
    });

    expect(result).toEqual({ positionChoice: 'noop', syncFailed: true });
    expect(syncPosition).toHaveBeenCalled();
  });

  it('skips position prompt when opening at explicit bookmark position', async () => {
    const syncPosition = vi.fn();
    const syncReaderData = vi.fn().mockResolvedValue(undefined);

    await runBookOpenOnlineSync(true, config, 'book-1', 'epubcfi(/6/4!)', {
      syncPosition,
      syncReaderData,
    });

    expect(syncPosition).not.toHaveBeenCalled();
    expect(syncReaderData).toHaveBeenCalledWith('book-1');
  });

  it('runs position sync without network when fetch fails inside syncPosition', async () => {
    const syncPosition = vi.fn().mockResolvedValue('noop' satisfies CrossDevicePositionChoice);
    const syncReaderData = vi.fn().mockResolvedValue(undefined);

    const result = await runBookOpenOnlineSync(true, config, 'book-1', null, {
      syncPosition,
      syncReaderData,
    });

    expect(result).toEqual({ positionChoice: 'noop', syncFailed: false });
    expect(syncReaderData).toHaveBeenCalledWith('book-1');
  });

  it('aborts mid-sync when shouldContinue becomes false', async () => {
    const syncPosition = vi.fn().mockResolvedValue('noop' satisfies CrossDevicePositionChoice);
    const syncReaderData = vi.fn().mockResolvedValue(undefined);
    let alive = true;

    const result = await runBookOpenOnlineSync(true, config, 'book-1', null, {
      syncPosition,
      syncReaderData,
      shouldContinue: () => alive,
      yieldForUi: async () => {
        alive = false;
      },
    });

    expect(result).toEqual({ positionChoice: null, syncFailed: false });
    expect(syncPosition).not.toHaveBeenCalled();
    expect(syncReaderData).not.toHaveBeenCalled();
  });

  it('rethrows auth errors for callers to mark session expired', async () => {
    const { ApiError } = await import('../inpxClient');
    const authErr = new ApiError('auth', 401);
    const syncPosition = vi.fn().mockRejectedValue(authErr);
    const syncReaderData = vi.fn();

    await expect(
      runBookOpenOnlineSync(true, config, 'book-1', null, {
        syncPosition,
        syncReaderData,
      }),
    ).rejects.toBe(authErr);
    expect(syncReaderData).not.toHaveBeenCalled();
  });

  it('does not block position sync when history POST returns 401', async () => {
    const { ApiError } = await import('../inpxClient');
    const authErr = new ApiError('auth', 401);
    const recordReadingHistory = vi.fn().mockRejectedValue(authErr);
    const syncPosition = vi.fn().mockResolvedValue('noop' satisfies CrossDevicePositionChoice);
    const syncReaderData = vi.fn().mockResolvedValue(undefined);

    const result = await runBookOpenOnlineSync(true, config, 'book-1', null, {
      syncPosition,
      syncReaderData,
      recordReadingHistory,
    });

    expect(result).toEqual({ positionChoice: 'noop', syncFailed: false });
    expect(syncPosition).toHaveBeenCalled();
  });
});
