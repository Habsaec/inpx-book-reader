/**
 * Обработка кнопки/жеста «Назад» на Android.
 * 
 * 📱 ТОЛЬКО ANDROID. Использует Capacitor App API.
 * 
 * @see AGENTS.md — приложение только для Android
 */

import React from 'react';
import { App as CapApp } from '@capacitor/app';
import { consumeAppBack } from './useBackHandler';
import { isNativeApp } from '../lib/platform';

/** Системная кнопка / жест «Назад» (Capacitor) и клавиша Escape в браузере. */
export function useAppBackButton(onExit?: () => void) {
  React.useEffect(() => {
    if (!isNativeApp()) return;

    let remove: (() => void) | undefined;

    try {
      CapApp.addListener('backButton', () => {
        if (consumeAppBack()) return;
        if (onExit) {
          onExit();
          return;
        }
        CapApp.exitApp();
      }).then((handle) => {
        remove = () => handle.remove();
      });
    } catch (err: unknown) {
      console.warn('Failed to add back button listener:', err);
    }

    return () => remove?.();
  }, [onExit]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (consumeAppBack()) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
