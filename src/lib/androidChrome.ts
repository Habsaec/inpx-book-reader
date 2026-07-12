/**
 * Синхронизация статус-бара Android с темой приложения.
 * 
 * 📱 ТОЛЬКО ANDROID. На других платформах не используется.
 * 
 * @see AGENTS.md — приложение только для Android
 */

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/** Синхронизация системной строки состояния Android с темой приложения. */
export async function syncAndroidStatusBar(isDark: boolean): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  const bg = isDark ? '#1e1a16' : '#f5f1e8';
  try {
    await StatusBar.setBackgroundColor({ color: bg });
    await StatusBar.setStyle({ style: isDark ? Style.Light : Style.Dark });
  } catch {
    // вне APK (редкая отладка в WebView) — игнорируем
  }
}
