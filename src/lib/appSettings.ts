/**
 * Несекретные настройки приложения: SQLite app_meta (+ in-memory cache).
 * Импорт из legacy localStorage при первом запуске после обновления.
 */
import {
  deleteAppSetting,
  getAllAppSettingKeys,
  getAppSetting,
  initLocalDb,
  setAppSetting,
} from './localDb';

export const APP_SETTING_KEYS = {
  theme: 'app_theme',
  themeColor: 'theme_color',
  catalogView: 'catalog_view',
  homeView: 'home_view',
  searchHistory: 'search_history',
  readerPrefs: 'reader_prefs',
  storageDirectory: 'storage_directory',
  readerActivitySync: 'reader_activity_sync',
  serverThemeCache: 'server_theme_cache',
  serverBackground: 'server_background',
  safeArea: 'safe_area',
  settingsMigrated: 'settings_migrated_v1',
  onboardingDone: 'onboarding_done',
  einkMode: 'eink_mode',
} as const;

/** Legacy localStorage keys → app_meta key */
const LEGACY_LS_MAP: Record<string, string> = {
  inpx_app_theme: APP_SETTING_KEYS.theme,
  inpx_catalog_view: APP_SETTING_KEYS.catalogView,
  inpx_catalog_search_history: APP_SETTING_KEYS.searchHistory,
  inpx_reader_controls_v1: APP_SETTING_KEYS.readerPrefs,
  inpx_storage_directory: APP_SETTING_KEYS.storageDirectory,
  inpx_reader_activity_sync_v1: APP_SETTING_KEYS.readerActivitySync,
  inpx_server_ui_theme_v2: APP_SETTING_KEYS.serverThemeCache,
  INPX_SAFE_AREA: APP_SETTING_KEYS.safeArea,
};

const cache = new Map<string, string>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function readLegacyLocalStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeLegacyLocalStorage(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

async function migrateLegacySettings(): Promise<void> {
  const migrated = cache.get(APP_SETTING_KEYS.settingsMigrated);
  if (migrated === '1') return;

  for (const [lsKey, metaKey] of Object.entries(LEGACY_LS_MAP)) {
    if (cache.has(metaKey)) continue;
    const raw = readLegacyLocalStorage(lsKey);
    if (raw != null) {
      cache.set(metaKey, raw);
      await setAppSetting(metaKey, raw);
      removeLegacyLocalStorage(lsKey);
    }
  }

  cache.set(APP_SETTING_KEYS.settingsMigrated, '1');
  await setAppSetting(APP_SETTING_KEYS.settingsMigrated, '1');
}

export async function hydrateAppSettings(): Promise<void> {
  if (hydrated) return hydratePromise ?? Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = (async () => {
      await initLocalDb();
      const keys = await getAllAppSettingKeys();
      for (const key of keys) {
        const value = await getAppSetting(key);
        if (value != null) cache.set(key, value);
      }
      await migrateLegacySettings();
      hydrated = true;
    })();
  }
  return hydratePromise;
}

export function isAppSettingsHydrated(): boolean {
  return hydrated;
}

export function getAppSettingRaw(key: string): string | null {
  return cache.get(key) ?? readLegacyLocalStorage(legacyKeyFor(key)) ?? null;
}

function legacyKeyFor(metaKey: string): string | null {
  for (const [lsKey, mk] of Object.entries(LEGACY_LS_MAP)) {
    if (mk === metaKey) return lsKey;
  }
  return null;
}

export function getAppSettingJson<T>(key: string, fallback: T): T {
  const raw = getAppSettingRaw(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getAppSettingString(key: string, fallback = ''): string {
  return getAppSettingRaw(key) ?? fallback;
}

export function setAppSettingRaw(key: string, value: string): void {
  cache.set(key, value);
  void setAppSetting(key, value);
}

export function setAppSettingJson(key: string, value: unknown): void {
  setAppSettingRaw(key, JSON.stringify(value));
}

export function removeAppSetting(key: string): void {
  cache.delete(key);
  const legacy = legacyKeyFor(key);
  if (legacy) removeLegacyLocalStorage(legacy);
  void deleteAppSetting(key);
}

/** Сброс кэша — только для vitest. */
export async function __resetAppSettingsForTests(): Promise<void> {
  cache.clear();
  hydrated = false;
  hydratePromise = null;
}
