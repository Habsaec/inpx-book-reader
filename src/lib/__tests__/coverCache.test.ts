import { beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
const appFiles = new Map<string, string>();

vi.mock('idb-keyval', () => ({
  get: async (key: string) => idb.get(key) ?? undefined,
  set: async (key: string, value: unknown) => {
    idb.set(key, value);
  },
  del: async (key: string) => {
    idb.delete(key);
  },
}));

vi.mock('../platform', () => ({
  isNativeApp: () => true,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    convertFileSrc: (path: string) => `cap-file:${path}`,
  },
  registerPlugin: () => ({
    appCacheFileExists: async ({ path }: { path: string }) => ({
      exists: appFiles.has(path),
    }),
    getAppCacheFilePath: async ({ path }: { path: string }) => ({
      absolutePath: `/mock/cache/${path}`,
    }),
    writeAppCacheFile: async ({ path, data }: { path: string; data: string }) => {
      appFiles.set(path, data);
    },
    readAppCacheFile: async ({ path }: { path: string }) => {
      const data = appFiles.get(path);
      if (!data) throw new Error('missing');
      return { data };
    },
    deleteAppCacheFile: async ({ path }: { path: string }) => {
      appFiles.delete(path);
    },
    downloadUrlToAppCache: async () => ({ bytesWritten: 0, digestSha256: '', statusCode: 200 }),
  }),
}));

import {
  coverRelativePath,
  peekCoverMemory,
  portraitRelativePath,
  resolveCoverUrl,
  safeAuthorPortraitFileKey,
  saveCoverToDirectory,
} from '../coverCache';

describe('coverCache paths', () => {
  it('keeps cover paths under .inpx-reader/covers', () => {
    expect(coverRelativePath('12345', 'thumb')).toBe('.inpx-reader/covers/12345_thumb.jpg');
    expect(coverRelativePath('12345', 'full')).toBe('.inpx-reader/covers/12345_full.jpg');
  });

  it('encodes author portrait keys safely', () => {
    const key = safeAuthorPortraitFileKey('Толстой, Лев');
    expect(key.startsWith('a_')).toBe(true);
    expect(key).not.toMatch(/[\/\\*?"<>|]/);
    expect(portraitRelativePath('Толстой, Лев')).toBe(`.inpx-reader/portraits/${key}.jpg`);
  });

  it('uses stable keys for the same author name', () => {
    expect(safeAuthorPortraitFileKey('Pushkin A.')).toBe(safeAuthorPortraitFileKey('Pushkin A.'));
  });
});

describe('coverCache app-private persistence', () => {
  beforeEach(() => {
    idb.clear();
    appFiles.clear();
  });

  it('serves covers offline from app cache after save', async () => {
    const bytes = new Uint8Array(64).fill(7);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const saved = await saveCoverToDirectory(
      { label: 'test', uri: 'downloads://INPXLibraryReader' },
      'book-1',
      blob,
      'thumb',
    );
    expect(saved).toMatch(/^blob:/);
    expect(peekCoverMemory('book-1', 'thumb')).toBe(saved);
    expect(appFiles.size).toBeGreaterThan(0);

    const offline = await resolveCoverUrl({
      bookId: 'book-1',
      variant: 'thumb',
      directory: null,
      config: { url: 'http://x', connectionStatus: 'disconnected' } as never,
    });
    expect(offline).toMatch(/^blob:/);
  });
});
