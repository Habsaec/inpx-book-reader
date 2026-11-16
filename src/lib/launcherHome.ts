/**
 * «Домашний экран» — режим лаунчера для читалок (BOOX и др.).
 * Только приложение: сервер и API не меняются.
 * @see LauncherHomePlugin.java, LauncherHomeActivity.java
 */

import React from 'react';
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { isNativeApp } from './platform';
import { APP_SETTINGS_HYDRATED_EVENT, getAppSettingJson, getAppSettingString, setAppSettingJson, setAppSettingRaw } from './appSettings';

export interface LauncherState {
  supported: boolean;
  /** Компонент HOME доступен (в манифесте всегда включён). */
  enabled: boolean;
  /** Читалка — главный экран по умолчанию прямо сейчас. */
  isDefault: boolean;
  /** Устройство Onyx BOOX: его автозаморозка снимает роль главного экрана — настройки предупреждают. */
  onyx?: boolean;
  /** Android's battery optimisation is off for the app (other firmwares unload background apps through it). */
  unrestricted?: boolean;
  /** Android 10+: the system «make it the home screen» dialog is available. */
  canRequestRole?: boolean;
  /** BOOX: its app-freeze screen can be opened directly. */
  canOpenFreeze?: boolean;
  /** The reader was the home screen, the user did not switch away on purpose, and now it is not (BOOX freeze, an update…). */
  lost?: boolean;
}

export interface LauncherApp {
  packageName: string;
  activityName: string;
  label: string;
  /** data:image/png;base64,… */
  icon?: string;
  /** Suspended by BOOX (the whole package is off): launching asks BOOX to unfreeze it first. */
  frozen?: boolean;
  /** Preinstalled: cannot be removed. */
  system?: boolean;
  /** Serial of another profile of this user (work profile); absent for the user's own apps. */
  user?: number;
}

export interface LauncherShortcut {
  id: string;
  label: string;
}

type LauncherAppRef = { packageName: string; activityName?: string; user?: number };

interface LauncherHomePluginApi {
  getState(): Promise<LauncherState>;
  openHomeSettings(): Promise<{ ok: boolean }>;
  requestHomeRole(): Promise<unknown>;
  requestUnrestricted(): Promise<unknown>;
  openFreezeSettings(): Promise<{ ok: boolean }>;
  openOtherLauncher(): Promise<{ ok: boolean; label?: string }>;
  listApps(opts?: { iconSize?: number }): Promise<{ items: LauncherApp[] }>;
  launchApp(opts: LauncherAppRef): Promise<{ ok: boolean }>;
  openAppInfo(opts: LauncherAppRef): Promise<{ ok: boolean }>;
  uninstallApp(opts: { packageName: string }): Promise<{ ok: boolean }>;
  getShortcuts(opts: { packageName: string }): Promise<{ items: LauncherShortcut[] }>;
  startShortcut(opts: { packageName: string; id: string }): Promise<{ ok: boolean }>;
  /** An app was installed, removed, updated, suspended or unfrozen. */
  addListener(event: 'appsChanged', listener: () => void): Promise<PluginListenerHandle>;
}

export const LauncherHome = registerPlugin<LauncherHomePluginApi>('LauncherHome');

const OFF_STATE: LauncherState = { supported: false, enabled: false, isDefault: false };
const STATE_EVENT = 'inpx-launcher-state';
/** Last known «is the home screen»: a cold start as home draws the launcher layout at once (no extra E-Ink refresh). */
const LAST_DEFAULT_KEY = 'launcher_last_default';
/** '1' once the reader was the home screen; '0' after the user switched away on purpose. Drives the `lost` flag. */
const WANTED_KEY = 'launcher_wanted';

let lastState: LauncherState | null = null;
/** True once the native plugin answered: a guess from the cached flag never overrides it. */
let lastStateFromNative = false;

export function getLastLauncherState(): LauncherState {
  if (!lastState) {
    const wasDefault = isNativeApp() && getAppSettingString(LAST_DEFAULT_KEY) === '1';
    lastState = wasDefault ? { supported: true, enabled: true, isDefault: true } : OFF_STATE;
  }
  return lastState;
}

export async function readLauncherState(): Promise<LauncherState> {
  if (!isNativeApp()) return OFF_STATE;
  try {
    const state = await LauncherHome.getState();
    lastStateFromNative = true;
    const isDefault = Boolean(state?.isDefault);
    if (isDefault && getAppSettingString(WANTED_KEY) !== '1') setAppSettingRaw(WANTED_KEY, '1');
    lastState = {
      supported: Boolean(state?.supported),
      enabled: Boolean(state?.enabled),
      isDefault,
      onyx: Boolean(state?.onyx),
      unrestricted: Boolean(state?.unrestricted),
      canRequestRole: Boolean(state?.canRequestRole),
      canOpenFreeze: Boolean(state?.canOpenFreeze),
      lost: !isDefault && Boolean(state?.enabled) && getAppSettingString(WANTED_KEY) === '1',
    };
  } catch {
    // Старая сборка без плагина.
    lastState = OFF_STATE;
  }
  const flag = lastState.isDefault ? '1' : '0';
  if (getAppSettingString(LAST_DEFAULT_KEY) !== flag) setAppSettingRaw(LAST_DEFAULT_KEY, flag);
  window.dispatchEvent(new Event(STATE_EVENT));
  return lastState;
}

/** The system dialog «make INPX Reader the home screen» (Settings on old systems); then the state again. */
export async function requestHomeRole(): Promise<LauncherState> {
  try {
    await LauncherHome.requestHomeRole();
  } catch {
    /* old build */
  }
  return readLauncherState();
}

/** The system dialog «allow running in the background without limits». */
export async function requestUnrestricted(): Promise<LauncherState> {
  try {
    await LauncherHome.requestUnrestricted();
  } catch {
    /* old build */
  }
  return readLauncherState();
}

export async function openFreezeSettings(): Promise<boolean> {
  try {
    return Boolean((await LauncherHome.openFreezeSettings())?.ok);
  } catch {
    return false;
  }
}

/** The user leaves the home screen mode on purpose: no «it got lost» prompt afterwards. */
export function forgetLauncherHome(): void {
  setAppSettingRaw(WANTED_KEY, '0');
  if (lastState?.lost) {
    lastState = { ...lastState, lost: false };
    window.dispatchEvent(new Event(STATE_EVENT));
  }
}

/** Состояние режима; перечитывается при возврате в приложение (после системного выбора главного экрана). */
export function useLauncherState(): LauncherState {
  const [state, setState] = React.useState<LauncherState>(getLastLauncherState);
  React.useEffect(() => {
    if (!isNativeApp()) return;
    const onChange = () => setState(getLastLauncherState());
    // Read before the settings were loaded: guess again from the cached flag.
    const onHydrated = () => {
      if (lastStateFromNative) return;
      lastState = null;
      onChange();
    };
    window.addEventListener(STATE_EVENT, onChange);
    window.addEventListener(APP_SETTINGS_HYDRATED_EVENT, onHydrated);
    void readLauncherState();
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void readLauncherState();
    });
    return () => {
      window.removeEventListener(STATE_EVENT, onChange);
      window.removeEventListener(APP_SETTINGS_HYDRATED_EVENT, onHydrated);
      void sub.then((h) => h.remove()).catch(() => {});
    };
  }, []);
  return state;
}

/** Ключ приложения: `package/activity` (+ `#profile` for an app of another profile). */
export function launcherAppKey(app: Pick<LauncherApp, 'packageName' | 'activityName' | 'user'>): string {
  const key = `${app.packageName}/${app.activityName}`;
  return app.user == null ? key : `${key}#${app.user}`;
}

// --- Apps screen: hidden and recently opened apps (device only, app_meta) ---

const HIDDEN_APPS_KEY = 'launcher_hidden_apps';
const RECENT_APPS_KEY = 'launcher_recent_apps';
const APP_PREFS_EVENT = 'inpx-launcher-app-prefs';
export const LAUNCHER_RECENT_APPS_MAX = 5;
const HIDDEN_APPS_MAX = 500;

export function normalizeAppKeys(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item.includes('/') || out.includes(item)) continue;
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** The app just opened goes first; the list keeps the last few. */
export function pushRecentApp(list: string[], key: string): string[] {
  return [key, ...list.filter((k) => k !== key)].slice(0, LAUNCHER_RECENT_APPS_MAX);
}

export function toggleAppKey(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/** Every word of the query must occur in the app name (any case). */
export function filterLauncherApps<T extends { label: string }>(apps: T[], query: string): T[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return apps;
  return apps.filter((app) => {
    const label = app.label.toLocaleLowerCase();
    return words.every((word) => label.includes(word));
  });
}

/**
 * What the apps screen shows: the visible apps with the recently opened among them first, and the
 * hidden apps apart — they live in the «Скрытые» folder only. A search looks through the list on
 * screen (the apps, or the folder when it is open) and shows no «recent» row.
 */
export function arrangeLauncherApps<T extends Pick<LauncherApp, 'packageName' | 'activityName' | 'user' | 'label'>>(
  apps: T[],
  opts: { hidden: string[]; recent: string[]; query: string },
): { recent: T[]; all: T[]; hidden: T[] } {
  const hiddenKeys = new Set(opts.hidden);
  const hidden = apps.filter((app) => hiddenKeys.has(launcherAppKey(app)));
  const visible = apps.filter((app) => !hiddenKeys.has(launcherAppKey(app)));
  if (opts.query.trim()) {
    return { recent: [], all: filterLauncherApps(visible, opts.query), hidden: filterLauncherApps(hidden, opts.query) };
  }
  const byKey = new Map(visible.map((app) => [launcherAppKey(app), app]));
  const recent = opts.recent.map((key) => byKey.get(key)).filter((app): app is T => Boolean(app));
  return { recent, all: visible, hidden };
}

function readAppPrefs(): { hidden: string[]; recent: string[] } {
  return {
    hidden: normalizeAppKeys(getAppSettingJson<unknown>(HIDDEN_APPS_KEY, []), HIDDEN_APPS_MAX),
    recent: normalizeAppKeys(getAppSettingJson<unknown>(RECENT_APPS_KEY, []), LAUNCHER_RECENT_APPS_MAX),
  };
}

export function setHiddenApp(key: string, hide: boolean): void {
  const { hidden } = readAppPrefs();
  if (hidden.includes(key) === hide) return;
  setAppSettingJson(HIDDEN_APPS_KEY, normalizeAppKeys(toggleAppKey(hidden, key), HIDDEN_APPS_MAX));
  window.dispatchEvent(new Event(APP_PREFS_EVENT));
}

export function noteAppOpened(key: string): void {
  const { recent } = readAppPrefs();
  if (recent[0] === key) return;
  setAppSettingJson(RECENT_APPS_KEY, pushRecentApp(recent, key));
  window.dispatchEvent(new Event(APP_PREFS_EVENT));
}

/** Hidden / recent apps; re-read once app_meta is loaded (a list read empty and saved would wipe the stored one). */
export function useLauncherAppPrefs(): { hidden: string[]; recent: string[] } {
  const [value, setValue] = React.useState(readAppPrefs);
  React.useEffect(() => {
    const onChange = () => setValue(readAppPrefs());
    window.addEventListener(APP_PREFS_EVENT, onChange);
    window.addEventListener(APP_SETTINGS_HYDRATED_EVENT, onChange);
    onChange();
    return () => {
      window.removeEventListener(APP_PREFS_EVENT, onChange);
      window.removeEventListener(APP_SETTINGS_HYDRATED_EVENT, onChange);
    };
  }, []);
  return value;
}

