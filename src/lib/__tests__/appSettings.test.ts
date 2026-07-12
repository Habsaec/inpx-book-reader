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

describe('appSettings', () => {
  beforeEach(async () => {
    lsStore.clear();
    lsKeys.length = 0;
    idbStore.clear();
    mockLocalStorage();
    const { __resetLocalDbForTests } = await import('../localDb');
    await __resetLocalDbForTests();
    const { __resetAppSettingsForTests } = await import('../appSettings');
    await __resetAppSettingsForTests();
  });

  it('migrates legacy localStorage theme into app_meta', async () => {
    localStorage.setItem('inpx_app_theme', 'dark');
    const { hydrateAppSettings, getAppSettingString, APP_SETTING_KEYS } = await import('../appSettings');
    await hydrateAppSettings();
    expect(getAppSettingString(APP_SETTING_KEYS.theme)).toBe('dark');
    expect(localStorage.getItem('inpx_app_theme')).toBeNull();
  });

  it('persists search history as JSON', async () => {
    const { hydrateAppSettings, setAppSettingJson, getAppSettingJson, APP_SETTING_KEYS } = await import('../appSettings');
    await hydrateAppSettings();
    setAppSettingJson(APP_SETTING_KEYS.searchHistory, ['tolstoy', 'dostoevsky']);
    expect(getAppSettingJson(APP_SETTING_KEYS.searchHistory, [])).toEqual(['tolstoy', 'dostoevsky']);
  });
});
