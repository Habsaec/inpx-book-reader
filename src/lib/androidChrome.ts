/**
 * Синхронизация статус-бара Android с темой приложения.
 *
 * 📱 ТОЛЬКО ANDROID. На других платформах не используется.
 *
 * @see AGENTS.md — приложение только для Android
 */

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

type AppStatusBarArgs = { isDark: boolean; eink: boolean; bg?: string };

/** Последние параметры темы приложения — для возврата после закрытия читалки. */
let appArgs: AppStatusBarArgs = { isDark: false, eink: false };
/** Цвет фона открытой читалки; пока задан, он главнее темы приложения. */
let readerBg: string | null = null;

const HEX_RE = /^#[0-9a-f]{6}$/i;

function isDarkColor(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

async function applyStatusBar(bg: string, darkBg: boolean): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await StatusBar.setBackgroundColor({ color: bg });
    // Capacitor: Style.Light = тёмные иконки (светлый фон); Style.Dark = светлые иконки (тёмный фон).
    await StatusBar.setStyle({ style: darkBg ? Style.Dark : Style.Light });
  } catch {
    // вне APK (редкая отладка в WebView) — игнорируем
  }
}

function applyAppArgs(): Promise<void> {
  const { isDark, eink, bg } = appArgs;
  const color = eink ? '#ffffff' : bg || (isDark ? '#14130f' : '#f4efe6');
  return applyStatusBar(color, isDark && !eink);
}

/** Синхронизация системной строки состояния Android с темой приложения. */
export async function syncAndroidStatusBar(isDark: boolean, opts?: { eink?: boolean; bg?: string }): Promise<void> {
  appArgs = { isDark, eink: Boolean(opts?.eink), bg: opts?.bg };
  if (readerBg) return; // открыта читалка — её цвет главнее, тему применим при закрытии
  await applyAppArgs();
}

/** Читалка: строка состояния в цвет фона текущей темы чтения. */
export async function syncReaderStatusBar(bg: string): Promise<void> {
  if (!HEX_RE.test(bg)) return;
  readerBg = bg;
  await applyStatusBar(bg, isDarkColor(bg));
}

/** Закрытие читалки: вернуть строку состояния в тему приложения. */
export async function restoreAppStatusBar(): Promise<void> {
  if (!readerBg) return;
  readerBg = null;
  await applyAppArgs();
}
