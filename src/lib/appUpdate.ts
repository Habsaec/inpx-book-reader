/**
 * In-app update check against GitHub Releases + APK download/install bridge.
 * Pure logic (compareVersions, buildAppUpdateCheckResult) is separated for tests.
 */
import { registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

const RELEASES_LATEST_URL =
  'https://api.github.com/repos/Habsaec/inpx-book-reader/releases/latest';

interface AppUpdatePluginType {
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

/** Проверить наличие новой версии APK на GitHub. Бросает при сетевой ошибке. */
export async function checkForAppUpdate(): Promise<AppUpdateCheckResult> {
  const currentVersion = await getCurrentAppVersion();
  const res = await fetch(RELEASES_LATEST_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
  const release = (await res.json()) as GithubRelease;
  return buildAppUpdateCheckResult(release, currentVersion);
}
