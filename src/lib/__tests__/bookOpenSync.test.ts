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

    const result = await runBookOpenOnlineSync(false, config, 'book-1', null, {
      syncPosition,
      syncReaderData,
    });

    expect(result).toEqual({ positionChoice: null, syncFailed: false });
    expect(syncPosition).not.toHaveBeenCalled();
    expect(syncReaderData).not.toHaveBeenCalled();
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
});
