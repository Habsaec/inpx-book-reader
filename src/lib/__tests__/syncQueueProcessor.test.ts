import { describe, expect, it, vi, beforeEach } from 'vitest';

const idbStore = new Map<string, unknown>();
const lsStore = new Map<string, string>();
const lsKeys: string[] = [];

vi.mock('idb-keyval', () => ({
  get: async (key: string) => idbStore.get(key),
  set: async (key: string, value: unknown) => {
    idbStore.set(key, value);
  },
  del: async (key: string) => {
    idbStore.delete(key);
  },
  keys: async () => [...idbStore.keys()],
}));

vi.mock('../platform', () => ({
  isNativeApp: () => false,
}));

vi.mock('../inpxClient', () => ({
  deleteReadingHistoryApi: vi.fn().mockResolvedValue(undefined),
  toggleBookRead: vi.fn().mockResolvedValue(true),
}));

function mockLocalStorage() {
  vi.stubGlobal('localStorage', {
    get length() {
      return lsKeys.length;
    },
    key: (index: number) => lsKeys[index] ?? null,
    getItem: (key: string) => lsStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (!lsStore.has(key)) lsKeys.push(key);
      lsStore.set(key, value);
    },
    removeItem: (key: string) => {
      lsStore.delete(key);
      const i = lsKeys.indexOf(key);
      if (i >= 0) lsKeys.splice(i, 1);
    },
    clear: () => {
      lsStore.clear();
      lsKeys.length = 0;
    },
  });
}

describe('syncQueueProcessor', () => {
  beforeEach(async () => {
    lsStore.clear();
    lsKeys.length = 0;
    idbStore.clear();
    mockLocalStorage();
    const { __resetLocalDbForTests } = await import('../localDb');
    await __resetLocalDbForTests();
  });

  it('processes remove_history ops', async () => {
    const { enqueueSyncOp, getPendingSyncOps, initLocalDb } = await import('../localDb');
    const { deleteReadingHistoryApi } = await import('../inpxClient');
    await initLocalDb();
    await enqueueSyncOp('remove_history', 'book-99', {});
    const { processSyncQueue } = await import('../syncQueueProcessor');
    const n = await processSyncQueue({ url: 'http://x', connectionStatus: 'connected' });
    expect(n).toBe(1);
    expect(deleteReadingHistoryApi).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://x' }), 'book-99');
    const pending = await getPendingSyncOps();
    expect(pending).toHaveLength(0);
  });
});
