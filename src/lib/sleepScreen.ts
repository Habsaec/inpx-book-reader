/**
 * Обложка текущей книги на экране сна BOOX (только приложение, только устройства Onyx с Android 10+).
 * Настройка одна на устройство (не на аккаунт): `app_meta` `sleep_screen`. Картинку рисует и
 * публикует нативный `SleepScreenPlugin`; здесь — настройки, условие «что изменилось» и вызовы.
 * @see SleepScreenPlugin.java
 */

import React from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { APP_SETTINGS_HYDRATED_EVENT, getAppSettingJson, setAppSettingJson } from './appSettings';

export type SleepScreenLayout = 'card' | 'cover';
export type SleepScreenTheme = 'light' | 'dark';

export interface SleepScreenSettings {
  enabled: boolean;
  /** `card`: cover + title, author, series, progress; `cover`: the cover over the whole screen. */
  layout: SleepScreenLayout;
  theme: SleepScreenTheme;
  /** Keep the top free for the BOOX clock (drawn over the picture, updated while asleep). */
  clockSpace: boolean;
  showProgress: boolean;
}

export interface SleepScreenBook {
  id: string;
  title: string;
  author?: string;
  series?: string;
  progress?: number;
}

interface SleepScreenPluginApi {
  getState(): Promise<{ supported: boolean; applied: boolean }>;
  publish(opts: {
    title: string;
    author: string;
    series: string;
    progress: number;
    coverPath: string;
    layout: SleepScreenLayout;
    theme: SleepScreenTheme;
    clockSpace: boolean;
    showProgress: boolean;
  }): Promise<{ ok: boolean; path?: string }>;
  restore(): Promise<{ ok: boolean }>;
}

export const SleepScreen = registerPlugin<SleepScreenPluginApi>('SleepScreen');

export const SLEEP_SCREEN_KEY = 'sleep_screen';
const EVENT = 'inpx-sleep-screen';

const DEFAULTS: SleepScreenSettings = {
  enabled: false,
  layout: 'card',
  theme: 'light',
  clockSpace: true,
  showProgress: true,
};

export function normalizeSleepScreenSettings(raw: unknown): SleepScreenSettings {
  const o = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof SleepScreenSettings, unknown>>) : {};
  return {
    enabled: o.enabled === true,
    layout: o.layout === 'cover' ? 'cover' : 'card',
    theme: o.theme === 'dark' ? 'dark' : 'light',
    clockSpace: typeof o.clockSpace === 'boolean' ? o.clockSpace : DEFAULTS.clockSpace,
    showProgress: typeof o.showProgress === 'boolean' ? o.showProgress : DEFAULTS.showProgress,
  };
}

export function getSleepScreenSettings(): SleepScreenSettings {
  return normalizeSleepScreenSettings(getAppSettingJson<unknown>(SLEEP_SCREEN_KEY, null));
}

export function useSleepScreenSettings(): SleepScreenSettings {
  const [value, setValue] = React.useState(getSleepScreenSettings);
  React.useEffect(() => {
    const onChange = () => setValue(getSleepScreenSettings());
    window.addEventListener(EVENT, onChange);
    window.addEventListener(APP_SETTINGS_HYDRATED_EVENT, onChange);
    onChange();
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener(APP_SETTINGS_HYDRATED_EVENT, onChange);
    };
  }, []);
  return value;
}

let supportedPromise: Promise<boolean> | null = null;

export function isSleepScreenSupported(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return Promise.resolve(false);
  if (!supportedPromise) {
    supportedPromise = SleepScreen.getState()
      .then((s) => Boolean(s?.supported))
      .catch(() => false);
  }
  return supportedPromise;
}

/** Saves the settings; turning it off gives BOOX its own picture back. */
export async function setSleepScreenSettings(next: SleepScreenSettings): Promise<void> {
  const prev = getSleepScreenSettings();
  const value = normalizeSleepScreenSettings(next);
  setAppSettingJson(SLEEP_SCREEN_KEY, value);
  window.dispatchEvent(new Event(EVENT));
  if (prev.enabled && !value.enabled) {
    lastKey = '';
    try {
      await SleepScreen.restore();
    } catch {
      /* old build */
    }
  }
}

/**
 * What the picture shows: a new one is drawn only when this changes (book, whole percent,
 * settings) — page turns inside the same percent cost nothing.
 */
export function sleepScreenKey(book: SleepScreenBook, settings: SleepScreenSettings, coverPath: string): string {
  const percent = settings.showProgress ? Math.max(0, Math.min(100, Math.floor(Number(book.progress) || 0))) : -1;
  return [
    book.id,
    book.title,
    book.author || '',
    book.series || '',
    percent,
    coverPath,
    settings.layout,
    settings.theme,
    settings.clockSpace ? 1 : 0,
    settings.showProgress ? 1 : 0,
  ].join('\u0001');
}

let lastKey = '';

/** A step that hangs (a cover fetch with no answer, a native call that never returns) must not stall the next ones. */
const COVER_TIMEOUT_MS = 8000;
const PUBLISH_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

type SleepJob = { book: SleepScreenBook; resolveCoverPath: (bookId: string) => Promise<string> };
let pending: SleepJob | null = null;
let draining = false;

async function publishJob(job: SleepJob): Promise<void> {
  // Settings are read at run time: a change made while an older job ran is never lost.
  const settings = getSleepScreenSettings();
  if (!settings.enabled) return;
  if (!(await isSleepScreenSupported())) return;
  const coverPath = await withTimeout(job.resolveCoverPath(job.book.id), COVER_TIMEOUT_MS, '');
  const key = sleepScreenKey(job.book, settings, coverPath);
  if (key === lastKey) {
    setSleepScreenStatus({ state: 'published', title: job.book.title });
    return;
  }
  const res = await withTimeout(
    SleepScreen.publish({
      title: job.book.title || '',
      author: job.book.author || '',
      series: job.book.series || '',
      progress: settings.showProgress ? Math.max(0, Math.min(100, Math.floor(Number(job.book.progress) || 0))) : -1,
      coverPath,
      layout: settings.layout,
      theme: settings.theme,
      clockSpace: settings.clockSpace,
      showProgress: settings.showProgress,
    }),
    PUBLISH_TIMEOUT_MS,
    null,
  );
  // Not ok (or no answer): the key stays old, so the next change or start tries again.
  if (res?.ok) {
    lastKey = key;
    setSleepScreenStatus({ state: 'published', title: job.book.title });
  } else {
    setSleepScreenStatus({ state: 'failed' });
  }
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (pending) {
      const job = pending;
      pending = null;
      await publishJob(job).catch(() => {});
    }
  } finally {
    draining = false;
  }
}

/**
 * Publishes the current book as the BOOX sleep picture. Latest wins: calls made while one runs
 * collapse into one more run with the newest book and settings. `null` (no book on the device)
 * keeps the last picture. `resolveCoverPath` gives the cover file in the app cache (same as the widget).
 */
export function syncSleepScreen(
  book: SleepScreenBook | null,
  resolveCoverPath: (bookId: string) => Promise<string>,
): Promise<void> {
  if (!getSleepScreenSettings().enabled || !book?.id) return Promise.resolve();
  pending = { book, resolveCoverPath };
  return drain();
}

// --- Status shown under the setting («what is on the sleep screen now») ---

export type SleepScreenStatus =
  | { state: 'idle' }
  /** No book read on this device with its file here (fresh install, nothing opened yet). */
  | { state: 'no-book' }
  | { state: 'published'; title: string }
  | { state: 'failed' };

const STATUS_EVENT = 'inpx-sleep-screen-status';
let status: SleepScreenStatus = { state: 'idle' };

export function setSleepScreenStatus(next: SleepScreenStatus): void {
  status = next;
  window.dispatchEvent(new Event(STATUS_EVENT));
}

export function useSleepScreenStatus(): SleepScreenStatus {
  const [value, setValue] = React.useState(status);
  React.useEffect(() => {
    const onChange = () => setValue(status);
    window.addEventListener(STATUS_EVENT, onChange);
    onChange();
    return () => window.removeEventListener(STATUS_EVENT, onChange);
  }, []);
  return value;
}
