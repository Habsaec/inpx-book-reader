import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, SERVER_BUSY_MESSAGE, withServerBusyRetry } from '../inpxClient';

afterEach(() => {
  vi.useRealTimers();
});

describe('withServerBusyRetry', () => {
  it('waits and retries while the server answers 503', async () => {
    vi.useFakeTimers();
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiError('HTTP 503', 503))
      .mockResolvedValueOnce('ok');
    const done = withServerBusyRetry(run);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(done).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives up with the server wording after a few busy answers', async () => {
    vi.useFakeTimers();
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(new ApiError('HTTP 503', 503));
    const done = withServerBusyRetry(run);
    const settled = expect(done).rejects.toThrow(SERVER_BUSY_MESSAGE);
    await vi.advanceTimersByTimeAsync(80_000);
    await settled;
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('does not retry other errors', async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(new ApiError('HTTP 404', 404));
    await expect(withServerBusyRetry(run)).rejects.toThrow('HTTP 404');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('stops waiting when the download is cancelled', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(new ApiError('HTTP 503', 503));
    const done = withServerBusyRetry(run, controller.signal);
    const settled = expect(done).rejects.toThrow('Aborted');
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await settled;
    expect(run).toHaveBeenCalledTimes(1);
  });
});
