/**
 * «Домашний экран» — режим лаунчера для читалок (BOOX и др.).
 * Только приложение: сервер и API не меняются. Настройки блоков и закреплённые приложения — локальные.
 * @see LauncherHomePlugin.java, LauncherHomeActivity.java
 */

import React from 'react';
import { registerPlugin } from '@capacitor/core';
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
}

interface LauncherHomePluginApi {
  getState(): Promise<LauncherState>;
  openHomeSettings(): Promise<{ ok: boolean }>;
  requestHomeRole(): Promise<unknown>;
  requestUnrestricted(): Promise<unknown>;
  openFreezeSettings(): Promise<{ ok: boolean }>;
  openOtherLauncher(): Promise<{ ok: boolean; label?: string }>;
  listApps(opts?: { iconSize?: number }): Promise<{ items: LauncherApp[] }>;
  launchApp(opts: { packageName: string; activityName?: string }): Promise<{ ok: boolean }>;
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

// --- Local settings (device only) ---

export const LAUNCHER_SETTING_KEYS = {
  blocks: 'launcher_blocks',
  apps: 'launcher_apps',
} as const;

/** Only the launcher's own block; the rest of the home follows the account «Блоки главной». */
export interface LauncherBlocks {
  /** Ряд закреплённых приложений внизу главной. */
  apps: boolean;
}

const DEFAULT_BLOCKS: LauncherBlocks = { apps: true };
const SETTINGS_EVENT = 'inpx-launcher-settings';

export function normalizeLauncherBlocks(raw: unknown): LauncherBlocks {
  const obj = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof LauncherBlocks, unknown>>) : {};
  return {
    apps: typeof obj.apps === 'boolean' ? obj.apps : DEFAULT_BLOCKS.apps,
  };
}

export function getLauncherBlocks(): LauncherBlocks {
  return normalizeLauncherBlocks(getAppSettingJson<unknown>(LAUNCHER_SETTING_KEYS.blocks, null));
}

export function setLauncherBlocks(next: LauncherBlocks): void {
  setAppSettingJson(LAUNCHER_SETTING_KEYS.blocks, normalizeLauncherBlocks(next));
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

/** Ключ приложения: `package/activity`. */
export function launcherAppKey(app: Pick<LauncherApp, 'packageName' | 'activityName'>): string {
  return `${app.packageName}/${app.activityName}`;
}

export const LAUNCHER_PINNED_APPS_MAX = 8;

export function normalizePinnedApps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item.includes('/') || out.includes(item)) continue;
    out.push(item);
    if (out.length >= LAUNCHER_PINNED_APPS_MAX) break;
  }
  return out;
}

export function getPinnedApps(): string[] {
  return normalizePinnedApps(getAppSettingJson<unknown>(LAUNCHER_SETTING_KEYS.apps, []));
}

/** Закрепить / открепить; при переполнении новое не добавляется. Возвращает новый список. */
export function togglePinnedApp(list: string[], key: string): string[] {
  if (list.includes(key)) return list.filter((k) => k !== key);
  if (list.length >= LAUNCHER_PINNED_APPS_MAX) return list;
  return [...list, key];
}

export function setPinnedApps(next: string[]): void {
  setAppSettingJson(LAUNCHER_SETTING_KEYS.apps, normalizePinnedApps(next));
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

export function useLauncherSettings(): { blocks: LauncherBlocks; pinnedApps: string[] } {
  const read = () => ({ blocks: getLauncherBlocks(), pinnedApps: getPinnedApps() });
  const [value, setValue] = React.useState(read);
  React.useEffect(() => {
    const onChange = () => setValue(read());
    window.addEventListener(SETTINGS_EVENT, onChange);
    window.addEventListener(APP_SETTINGS_HYDRATED_EVENT, onChange);
    onChange();
    return () => {
      window.removeEventListener(SETTINGS_EVENT, onChange);
      window.removeEventListener(APP_SETTINGS_HYDRATED_EVENT, onChange);
    };
  }, []);
  return value;
}
