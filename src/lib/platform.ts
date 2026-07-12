import { Capacitor } from '@capacitor/core';

/**
 * Запущено как APK (Capacitor), а не в браузере с Node-прокси.
 * @see AGENTS.md — приложение только для Android
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Проверка на Android. Приложение разрабатывается ТОЛЬКО для Android.
 * iOS и десктоп не поддерживаются.
 */
export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/**
 * @deprecated Всегда true в production. Приложение только для Android.
 * Используется только для dev-режима в браузере.
 */
export function isDevBrowser(): boolean {
  return !isNativeApp();
}
