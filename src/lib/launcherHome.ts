/**
 * «Домашний экран» — режим лаунчера для читалок (BOOX и др.).
 * Только приложение: сервер и API не меняются. Настройки блоков и закреплённые приложения — локальные.
 * @see LauncherHomePlugin.java, LauncherHomeActivity.java
 */

import React from 'react';
import { registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { isNativeApp } from './platform';
import { getAppSettingJson, getAppSettingString, setAppSettingJson, setAppSettingRaw } from './appSettings';

export interface LauncherState {
  supported: boolean;
  /** Компонент HOME доступен (в манифесте всегда включён). */
  enabled: boolean;
  /** Читалка — главный экран по умолчанию прямо сейчас. */
  isDefault: boolean;
  /** Устройство Onyx BOOX: его автозаморозка снимает роль главного экрана — настройки предупреждают. */
  onyx?: boolean;
}

export interface LauncherApp {
  packageName: string;
  activityName: string;
  label: string;
  /** data:image/png;base64,… */
  icon?: string;
}

interface LauncherHomePluginApi {
  getState(): Promise<LauncherState>;
  openHomeSettings(): Promise<{ ok: boolean }>;
  openOtherLauncher(): Promise<{ ok: boolean; label?: string }>;
  listApps(opts?: { iconSize?: number }): Promise<{ items: LauncherApp[] }>;
  launchApp(opts: { packageName: string; activityName?: string }): Promise<{ ok: boolean }>;
}

export const LauncherHome = registerPlugin<LauncherHomePluginApi>('LauncherHome');

const OFF_STATE: LauncherState = { supported: false, enabled: false, isDefault: false };
const STATE_EVENT = 'inpx-launcher-state';
/** Last known «is the home screen»: a cold start as home draws the launcher layout at once (no extra E-Ink refresh). */
const LAST_DEFAULT_KEY = 'launcher_last_default';

let lastState: LauncherState | null = null;

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
    lastState = {
      supported: Boolean(state?.supported),
      enabled: Boolean(state?.enabled),
      isDefault: Boolean(state?.isDefault),
      onyx: Boolean(state?.onyx),
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

/** Состояние режима; перечитывается при возврате в приложение (после системного выбора главного экрана). */
export function useLauncherState(): LauncherState {
  const [state, setState] = React.useState<LauncherState>(getLastLauncherState);
  React.useEffect(() => {
    if (!isNativeApp()) return;
    const onChange = () => setState(getLastLauncherState());
    window.addEventListener(STATE_EVENT, onChange);
    void readLauncherState();
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void readLauncherState();
    });
    return () => {
      window.removeEventListener(STATE_EVENT, onChange);
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
    return () => window.removeEventListener(SETTINGS_EVENT, onChange);
  }, []);
  return value;
}
