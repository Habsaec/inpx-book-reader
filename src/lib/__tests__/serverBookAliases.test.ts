import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiBookPath, apiReadingHistoryPath, setServerBookAliases, toLocalBookId } from '../bookRef';
import { mergeRecentReadingLists } from '../localReadingProgress';
import {
  __resetServerBookAliasesForTests,
  activateServerBookAliases,
  resolveUnknownServerBooks,
} from '../serverBookAliases';
import {
  __resetOfflineReaderCacheForTests,
  readOfflineReaderData,
  writeOfflineReaderData,
} from '../offlineReaderStore';
import type { ServerConfig } from '../../types';

const resolveServerBookIds = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const recordReadingHistoryAt = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});

vi.mock('../inpxClient', async () => {
  const actual = await vi.importActual<typeof import('../inpxClient')>('../inpxClient');
  return {
    ...actual,
    resolveServerBookIds: (...args: unknown[]) => resolveServerBookIds(...args),
    recordReadingHistoryAt: (...args: unknown[]) => recordReadingHistoryAt(...args),
  };
});

vi.mock('../localDb', () => ({
  getAllBooks: vi.fn(async () => [
    { id: '9:857614', title: 'Кодекс Охотника #41', author: 'Винокуров Юрий, Сапфир Олег', ext: 'fb2' },
    { id: '9:1', title: 'Нет на сервере', author: 'Кто-то', ext: 'fb2' },
  ]),
  getAllProgress: vi.fn(async () => [{ bookId: '9:857614', lastRead: Date.parse('2026-10-19T10:30:00Z') }]),
}));

const home = { url: 'http://10.0.2.2:3000', username: 'u', password: '', connectionStatus: 'connected' } as ServerConfig;
const other = { ...home, url: 'http://192.168.1.30:3000' } as ServerConfig;

describe('server book aliases', () => {
  beforeEach(() => {
    __resetServerBookAliasesForTests();
    __resetOfflineReaderCacheForTests();
    resolveServerBookIds.mockReset();
    recordReadingHistoryAt.mockClear();
  });

  it('maps a book from another server and pushes it as a fresh book', async () => {
    writeOfflineReaderData('9:857614', {
      ...readOfflineReaderData('9:857614'),
      progress: 29.8,
      fraction: 0.298,
      positionDirty: true,
      baseRevision: 122,
      serverRevision: 0,
    });
    resolveServerBookIds.mockResolvedValue([
      { id: '9:857614', bookId: '6:857614', match: 'libId' },
      { id: '9:1', bookId: null, match: null },
    ]);

    const rebound = await resolveUnknownServerBooks(home, ['9:857614', '9:1'], Date.parse('2026-10-25T18:00:00Z'));

    expect(rebound).toBe(1);
    expect(resolveServerBookIds.mock.calls[0][1]).toEqual([
      { id: '9:857614', title: 'Кодекс Охотника #41', authors: 'Винокуров Юрий, Сапфир Олег', ext: 'fb2' },
      { id: '9:1', title: 'Нет на сервере', authors: 'Кто-то', ext: 'fb2' },
    ]);
    expect(apiBookPath('9:857614', 'position')).toBe('/api/books/6%3A857614/position');
    expect(apiReadingHistoryPath('9:857614')).toBe('/api/reading-history/6%3A857614');
    expect(toLocalBookId('6:857614')).toBe('9:857614');
    const local = readOfflineReaderData('9:857614');
    expect(local.baseRevision).toBe(0);
    expect(local.positionDirty).toBe(true);
    expect(recordReadingHistoryAt).toHaveBeenCalledWith(home, '9:857614', '2026-10-19T10:30:00.000Z');
  });

  it('keeps aliases per server and does not ask again for a recent miss', async () => {
    resolveServerBookIds.mockResolvedValue([{ id: '9:857614', bookId: '6:857614', match: 'libId' }]);
    await resolveUnknownServerBooks(home, ['9:857614']);

    activateServerBookAliases(other.url);
    expect(apiBookPath('9:857614', 'position')).toBe('/api/books/9%3A857614/position');
    activateServerBookAliases(home.url);
    expect(apiBookPath('9:857614', 'position')).toBe('/api/books/6%3A857614/position');

    resolveServerBookIds.mockResolvedValue([{ id: '9:1', bookId: null, match: null }]);
    const now = Date.now();
    expect(await resolveUnknownServerBooks(home, ['9:1'], now)).toBe(0);
    expect(await resolveUnknownServerBooks(home, ['9:1', '9:857614'], now + 1000)).toBe(0);
    expect(resolveServerBookIds).toHaveBeenCalledTimes(2);
  });

  it('server lists come back under the local id: one «Недавно читали» entry, hero opens the local file', async () => {
    const { fetchProfile, fetchLibraryView } = await import('../inpxClient');
    setServerBookAliases({ '9:857614': '6:857614' });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      if (url.includes('/api/profile')) {
        return new Response(JSON.stringify({
          user: {},
          recentBooks: [{ id: '6:857614', title: 'Кодекс Охотника #41', readProgress: 30, lastOpenedAt: '2026-10-25T19:00:00Z' }],
          readerBookmarks: [{ id: 1, bookId: '6:857614', bookTitle: 'x', label: '', position: '' }],
          readerAnnotations: [],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [{ id: '6:857614', title: 'Кодекс Охотника #41' }], total: 1 }), { status: 200 });
    }));
    try {
      const profile = await fetchProfile(home);
      expect(profile.recentBooks[0].id).toBe('9:857614');
      expect(profile.readerBookmarks[0].bookId).toBe('9:857614');
      expect((await fetchLibraryView(home, 'continue')).items[0].id).toBe('9:857614');

      const merged = mergeRecentReadingLists(
        profile.recentBooks.map((b) => ({
          id: b.id, title: b.title, authorsDisplay: '', ext: 'fb2',
          readProgress: b.readProgress ?? 0, lastOpenedAt: b.lastOpenedAt ?? '',
        })),
        [{ id: '9:857614', title: 'Кодекс Охотника #41', authorsDisplay: '', ext: 'fb2', readProgress: 30, lastOpenedAt: '2026-10-19T10:30:00Z' }],
      );
      expect(merged.map((item) => item.id)).toEqual(['9:857614']);
      expect(merged[0].readProgress).toBe(30);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
