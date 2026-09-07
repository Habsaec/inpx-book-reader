/**
 * In-app update check against GitHub Releases + APK download/install bridge.
 * Pure logic (compareVersions, buildAppUpdateCheckResult) is separated for tests.
 */
import { registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { APP_SETTING_KEYS, getAppSettingJson, getAppSettingString, setAppSettingJson, setAppSettingRaw } from './appSettings';

const CHECK_TIMEOUT_MS = 15_000;

interface AppUpdatePluginType {
  /** Latest GitHub release JSON (native HTTP — WebView fetch hangs with CapacitorHttp). */
  checkLatest(): Promise<{ json: string }>;
  /** Stream the release APK into app-private cache (progress via apkDownloadProgress). */
  downloadApk(options: { url: string }): Promise<{ bytesWritten: number }>;
  /** Hand the downloaded APK to the system package installer. */
  installApk(): Promise<void>;
  addListener(
    eventName: 'apkDownloadProgress',
    listenerFunc: (event: { loaded: number; total: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const AppUpdate = registerPlugin<AppUpdatePluginType>('AppUpdate');

export interface AppUpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  publishedAt: string;
  notes: string;
  apkName: string;
  apkSize: number;
  apkUrl: string;
}

/** '1.4.4' → [1, 4, 4]; null если строка не похожа на версию. */
function parseVersion(value: string): [number, number, number] | null {
  const m = String(value || '')
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Сравнение версий: 1 если a > b, -1 если a < b, 0 если равны или нераспознаны. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/** Троттлинг для частых foreground/background — на холодный старт практически всегда идёт запрос. */
export const AUTO_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export function shouldAutoCheckAppUpdate(lastCheckAt: number, now: number): boolean {
  if (!Number.isFinite(lastCheckAt) || lastCheckAt <= 0) return true;
  return now - lastCheckAt >= AUTO_CHECK_INTERVAL_MS;
}

/** Один снэкбар на версию, пока пользователь не обновится. */
export function shouldPromptAppUpdate(latestVersion: string, promptedVersion: string): boolean {
  const latest = latestVersion.trim();
  return Boolean(latest) && latest !== promptedVersion.trim();
}

/** Сохранённый результат; после обновления APK старый (с другой currentVersion) отбрасывается. */
export function loadAppUpdateCheckResult(currentVersion?: string): AppUpdateCheckResult | null {
  const raw = getAppSettingJson<AppUpdateCheckResult | null>(APP_SETTING_KEYS.appUpdateLastResult, null);
  if (!raw || typeof raw !== 'object' || !raw.latestVersion) return null;
  if (currentVersion && raw.currentVersion !== currentVersion) return null;
  return raw;
}

export function saveAppUpdateCheckResult(result: AppUpdateCheckResult, now = Date.now()): void {
  setAppSettingJson(APP_SETTING_KEYS.appUpdateLastResult, result);
  setAppSettingRaw(APP_SETTING_KEYS.appUpdateLastCheck, String(now));
}

const resultListeners = new Set<(result: AppUpdateCheckResult) => void>();

export function publishAppUpdateResult(result: AppUpdateCheckResult): void {
  for (const listener of resultListeners) listener(result);
}

export function subscribeAppUpdateResult(listener: (result: AppUpdateCheckResult) => void): () => void {
  resultListeners.add(listener);
  return () => {
    resultListeners.delete(listener);
  };
}

let checkInFlight: Promise<AppUpdateCheckResult> | null = null;

function checkForAppUpdateShared(): Promise<AppUpdateCheckResult> {
  if (!checkInFlight) {
    checkInFlight = checkForAppUpdate().finally(() => {
      checkInFlight = null;
    });
  }
  return checkInFlight;
}

/** Фоновая проверка: сеть не чаще интервала, если уже есть сохранённый результат. */
export async function maybeAutoCheckAppUpdate(now = Date.now()): Promise<{
  result: AppUpdateCheckResult | null;
  prompt: boolean;
}> {
  const last = Number(getAppSettingString(APP_SETTING_KEYS.appUpdateLastCheck, '0'));
  const saved = loadAppUpdateCheckResult(await getCurrentAppVersion());
  if (!shouldAutoCheckAppUpdate(last, now) && saved) {
    publishAppUpdateResult(saved);
    return {
      result: saved,
      prompt: saved.updateAvailable && shouldPromptAppUpdate(
        saved.latestVersion,
        getAppSettingString(APP_SETTING_KEYS.appUpdatePrompted, ''),
      ),
    };
  }
  const result = await checkForAppUpdateShared();
  saveAppUpdateCheckResult(result, now);
  publishAppUpdateResult(result);
  return {
    result,
    prompt: result.updateAvailable && shouldPromptAppUpdate(
      result.latestVersion,
      getAppSettingString(APP_SETTING_KEYS.appUpdatePrompted, ''),
    ),
  };
}

interface GithubReleaseAsset {
  name?: string;
  size?: number;
  browser_download_url?: string;
}

interface GithubRelease {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
  body?: string;
  assets?: GithubReleaseAsset[];
}

/** Собирает результат проверки из ответа GitHub /releases/latest. */
export function buildAppUpdateCheckResult(
  release: GithubRelease,
  currentVersion: string,
): AppUpdateCheckResult {
  const latestVersion = String(release?.tag_name || '').trim().replace(/^v/i, '');
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const apk = assets.find((a) => /\.apk$/i.test(String(a?.name || '')));
  return {
    currentVersion,
    latestVersion,
    updateAvailable: Boolean(apk) && compareVersions(latestVersion, currentVersion) > 0,
    releaseUrl: String(release?.html_url || ''),
    publishedAt: String(release?.published_at || ''),
    notes: String(release?.body || '').slice(0, 4000),
    apkName: apk ? String(apk.name) : '',
    apkSize: apk ? Number(apk.size) || 0 : 0,
    apkUrl: apk ? String(apk.browser_download_url || '') : '',
  };
}

/** Текущая версия приложения (versionName из APK). */
export async function getCurrentAppVersion(): Promise<string> {
  try {
    const info = await CapApp.getInfo();
    return info.version || '?';
  } catch {
    return '?';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Проверить наличие новой версии APK на GitHub. Бросает при сетевой ошибке. */
export async function checkForAppUpdate(): Promise<AppUpdateCheckResult> {
  const currentVersion = await getCurrentAppVersion();
  const { json } = await withTimeout(
    AppUpdate.checkLatest(),
    CHECK_TIMEOUT_MS,
    'Нет доступа к GitHub. Проверьте сеть или VPN.',
  );
  let release: GithubRelease;
  try {
    release = JSON.parse(json) as GithubRelease;
  } catch {
    throw new Error('Некорректный ответ сервера обновлений');
  }
  return buildAppUpdateCheckResult(release, currentVersion);
}
