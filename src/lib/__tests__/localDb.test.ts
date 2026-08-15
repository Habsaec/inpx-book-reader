import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Book } from '../../types';

const idbStore = new Map<string, unknown>();

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

const lsStore = new Map<string, string>();
const lsKeys: string[] = [];

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

describe('localDb migration', () => {
  beforeEach(async () => {
    lsStore.clear();
    lsKeys.length = 0;
    idbStore.clear();
    mockLocalStorage();
    const { __resetLocalDbForTests } = await import('../localDb');
    const { __resetOfflineReaderCacheForTests } = await import('../offlineReaderStore');
    await __resetLocalDbForTests();
    __resetOfflineReaderCacheForTests();
  });

  it('imports legacy localStorage into IndexedDB fallback', async () => {
    const legacyBook: Book = {
      id: 'legacy-1',
      title: 'Legacy Book',
      author: 'Legacy Author',
      ext: 'fb2',
    };
    localStorage.setItem('inpx_downloaded_books_v2', JSON.stringify([legacyBook]));
    localStorage.setItem('inpx_favorite_authors_v2', JSON.stringify(['Pushkin']));

    const { initLocalDb, getAllBooks, getFavoriteAuthors, isUsingIndexedDbFallback } = await import('../localDb');
    await initLocalDb();

    expect(isUsingIndexedDbFallback()).toBe(true);
    const books = await getAllBooks();
    expect(books.some((b) => b.id === 'legacy-1')).toBe(true);
    const authors = await getFavoriteAuthors();
    expect(authors).toContain('Pushkin');

    await initLocalDb();
    const booksAgain = await getAllBooks();
    expect(booksAgain.filter((b) => b.id === 'legacy-1')).toHaveLength(1);
  });

  it('imports offline reader localStorage into reader_data', async () => {
    localStorage.setItem(
      'inpx_offline_reader_book-1',
      JSON.stringify({ position: 'cfi1', progress: 10, bookmarks: [], annotations: [] }),
    );
    const { initLocalDb, getReaderDataJson } = await import('../localDb');
    await initLocalDb();
    const json = await getReaderDataJson('book-1');
    expect(json).toBeTruthy();
    expect(localStorage.getItem('inpx_offline_reader_book-1')).toBeNull();
  });

  it('preserves precise reader anchors across export and import', async () => {
    const {
      exportOfflineReaderJson,
      importOfflineReaderJson,
      readOfflineReaderData,
      writeOfflineReaderData,
    } = await import('../offlineReaderStore');
    writeOfflineReaderData('book-1', {
      position: 'epubcfi(/6/4!)',
      progress: 42.5,
      fraction: 0.425,
      sectionIndex: 3,
      sectionPageFraction: 0.7,
      paginatorPage: 12,
      paginatorPages: 30,
      layoutMode: 'paginated',
      anchorOffset: 1234,
      anchorWord: 'Слово',
      bookmarks: [],
      annotations: [],
    });

    const exported = JSON.parse(exportOfflineReaderJson('book-1'));
    expect(exported.fraction).toBe(0.425);
    expect(exported.sectionIndex).toBe(3);
    expect(exported.anchorOffset).toBe(1234);
    expect(exported.anchorWord).toBe('Слово');

    expect(importOfflineReaderJson('book-1', JSON.stringify({
      ...exported,
      fraction: 0.5,
      progress: 50,
      position: 'epubcfi(/6/8!)',
    }))).toEqual({ ok: true });
    const restored = readOfflineReaderData('book-1');
    expect(restored.layoutMode).toBe('paginated');
    expect(restored.sectionPageFraction).toBe(0.7);
    expect(restored.paginatorPage).toBe(12);
    expect(restored.position).toBe('epubcfi(/6/8!)');
  });

  it('persistLibrarySnapshot deletes books removed from the snapshot', async () => {
    const { initLocalDb, persistLibrarySnapshot, getAllBooks, upsertBook } = await import('../localDb');
    await initLocalDb();
    await upsertBook({ id: 'keep', title: 'Keep', author: 'A', ext: 'fb2' });
    await upsertBook({ id: 'gone', title: 'Gone', author: 'B', ext: 'fb2' });
    await persistLibrarySnapshot({
      books: [{ id: 'keep', title: 'Keep', author: 'A', ext: 'fb2' }],
      progress: [],
      bookmarks: [],
      highlights: [],
      shelves: [],
    });
    const books = await getAllBooks();
    expect(books.map((b) => b.id).sort()).toEqual(['keep']);
  });
});
