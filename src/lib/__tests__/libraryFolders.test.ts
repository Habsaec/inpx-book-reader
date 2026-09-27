import { describe, it, expect, beforeEach, vi } from 'vitest';

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

describe('libraryFolders', () => {
  beforeEach(async () => {
    idbStore.clear();
    const { __resetLocalDbForTests } = await import('../localDb');
    await __resetLocalDbForTests();
    const { __resetAppSettingsForTests } = await import('../appSettings');
    await __resetAppSettingsForTests();
  });

  it('hides the default folder from local browsing without removing it', async () => {
    const { hydrateAppSettings } = await import('../appSettings');
    await hydrateAppSettings();
    const {
      readLibraryFolders,
      addLibraryFolder,
      setHideDefaultInLocal,
    } = await import('../libraryFolders');
    const base = readLibraryFolders({ label: 'INPXLibraryReader', uri: 'downloads://INPXLibraryReader' });
    const withExtra = addLibraryFolder(base, { label: 'Books', uri: 'content://books' });
    const hidden = setHideDefaultInLocal(withExtra, true);
    const again = readLibraryFolders(null);
    expect(again.hideDefaultInLocal).toBe(true);
    expect(again.folders.map((f) => f.id)).toEqual(hidden.folders.map((f) => f.id));
    expect(again.folders.some((f) => f.id === again.defaultId)).toBe(true);
    const shown = setHideDefaultInLocal(again, false);
    expect(readLibraryFolders(null).hideDefaultInLocal).toBe(false);
    expect(shown.folders).toHaveLength(again.folders.length);
  });
});
