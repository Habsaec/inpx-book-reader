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
  ensureBookReadState: vi.fn().mockResolvedValue(undefined),
  createServerShelf: vi.fn().mockResolvedValue(1),
  deleteServerShelf: vi.fn().mockResolvedValue(undefined),
  fetchShelves: vi.fn().mockResolvedValue([]),
  fetchFavorites: vi.fn().mockResolvedValue({ authors: [], series: [] }),
  addBookToServerShelf: vi.fn().mockResolvedValue(undefined),
  removeBookFromServerShelf: vi.fn().mockResolvedValue(undefined),
  toggleFavoriteAuthorApi: vi.fn().mockResolvedValue(true),
  toggleFavoriteSeriesApi: vi.fn().mockResolvedValue(true),
  isAuthError: () => false,
  isUnreachableServerError: vi.fn().mockReturnValue(false),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
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

  it('processes toggle_read via ensureBookReadState', async () => {
    const { enqueueSyncOp, getPendingSyncOps, initLocalDb } = await import('../localDb');
    const { ensureBookReadState } = await import('../inpxClient');
    await initLocalDb();
    await enqueueSyncOp('toggle_read', 'book-7', { markRead: true });
    const { processSyncQueue } = await import('../syncQueueProcessor');
    const n = await processSyncQueue({ url: 'http://x', connectionStatus: 'connected' });
    expect(n).toBe(1);
    expect(ensureBookReadState).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://x' }),
      'book-7',
      true,
    );
    const pending = await getPendingSyncOps();
    expect(pending).toHaveLength(0);
  });

  it('skips ops that already hit MAX_SYNC_OP_ATTEMPTS', async () => {
    const { enqueueSyncOp, getPendingSyncOps, incrementSyncOpAttempts, initLocalDb } = await import('../localDb');
    const { deleteReadingHistoryApi } = await import('../inpxClient');
    const { processSyncQueue, MAX_SYNC_OP_ATTEMPTS } = await import('../syncQueueProcessor');
    await initLocalDb();
    await enqueueSyncOp('remove_history', 'book-stuck', {});
    const [op] = await getPendingSyncOps();
    for (let i = 0; i < MAX_SYNC_OP_ATTEMPTS; i++) {
      await incrementSyncOpAttempts(op.id);
    }
    vi.mocked(deleteReadingHistoryApi).mockClear();
    const n = await processSyncQueue({ url: 'http://x', connectionStatus: 'connected' });
    expect(n).toBe(0);
    expect(deleteReadingHistoryApi).not.toHaveBeenCalled();
    const pending = await getPendingSyncOps();
    expect(pending).toHaveLength(1);
  });

  it('drops poison-pill toggle_read ops instead of burning attempts forever', async () => {
    const { enqueueSyncOp, getPendingSyncOps, initLocalDb } = await import('../localDb');
    await initLocalDb();
    await enqueueSyncOp('toggle_read', 'book-poison', { markRead: true });
    const [op] = await getPendingSyncOps();
    // Портим payload напрямую в сторе — имитация повреждённой записи.
    const storeKey = [...idbStore.keys()].find((k) => k.endsWith(`sync_queue:${op.id}`));
    expect(storeKey).toBeTruthy();
    idbStore.set(storeKey!, { ...op, payload: '{broken json' });
    const { processSyncQueue } = await import('../syncQueueProcessor');
    const n = await processSyncQueue({ url: 'http://x', connectionStatus: 'connected' });
    expect(n).toBe(0);
    const pending = await getPendingSyncOps();
    expect(pending).toHaveLength(0);
  });

  it('binds a shelf that the server already created under the same name', async () => {
    const { enqueueSyncOp, getPendingSyncOps, initLocalDb } = await import('../localDb');
    const inpxClient = await import('../inpxClient');
    await initLocalDb();
    await enqueueSyncOp('shelf_create', 'shelf_1', { name: 'Полка' });
    vi.mocked(inpxClient.createServerShelf).mockRejectedValue(
      new inpxClient.ApiError('Полка с таким названием уже существует', 400),
    );
    vi.mocked(inpxClient.fetchShelves).mockResolvedValue([{ id: 42, name: 'Полка' }]);
    const { processSyncQueue, readPersistedShelfIdMap } = await import('../syncQueueProcessor');
    const n = await processSyncQueue({ url: 'http://x', connectionStatus: 'connected' });
    expect(n).toBe(1);
    expect(readPersistedShelfIdMap().get('shelf_1')).toBe(42);
    expect(await getPendingSyncOps()).toHaveLength(0);
  });

  it('does not burn shelf_add attempts while shelf_create is still queued', async () => {
    const { enqueueSyncOp, getPendingSyncOps, initLocalDb } = await import('../localDb');
    const inpxClient = await import('../inpxClient');
    await initLocalDb();
    await enqueueSyncOp('shelf_add', 'shelf_9', { bookId: 'book-1', name: 'Полка' });
    await enqueueSyncOp('shelf_create', 'shelf_9', { name: 'Полка' });
    vi.mocked(inpxClient.createServerShelf).mockResolvedValue(7);
    const { processSyncQueue } = await import('../syncQueueProcessor');
    const n = await processSyncQueue({ url: 'http://x', connectionStatus: 'connected' });
    expect(n).toBe(1);
    expect(inpxClient.addBookToServerShelf).not.toHaveBeenCalled();
    const pending = await getPendingSyncOps();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.attempts).toBe(0);
    expect(pending[0]?.bookId).toBe('7');
  });

  it('stops processing when server is unreachable', async () => {
    const { enqueueSyncOp, getPendingSyncOps, initLocalDb } = await import('../localDb');
    const inpxClient = await import('../inpxClient');
    await initLocalDb();
    await enqueueSyncOp('remove_history', 'book-a', {});
    await enqueueSyncOp('remove_history', 'book-b', {});
    vi.mocked(inpxClient.deleteReadingHistoryApi)
      .mockRejectedValueOnce(Object.assign(new Error('Network error'), { name: 'ApiError', status: 0 }))
      .mockResolvedValue(undefined);
    vi.mocked(inpxClient.isUnreachableServerError).mockReturnValue(true);
    const { processSyncQueue } = await import('../syncQueueProcessor');
    const n = await processSyncQueue({ url: 'http://x', connectionStatus: 'connected' });
    expect(n).toBe(0);
    expect(inpxClient.deleteReadingHistoryApi).toHaveBeenCalledTimes(1);
    const pending = await getPendingSyncOps();
    expect(pending).toHaveLength(2);
  });
});
