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

const EXIT_WINDOW_MS = 2000;

/**
 * Системная кнопка / жест «Назад» (Capacitor) и клавиша Escape в браузере.
 * На корне: первый Back показывает подсказку (`onExitPrompt`), второй за EXIT_WINDOW_MS — выход.
 */
export function useAppBackButton(onExitPrompt?: () => void) {
  const lastBackAt = React.useRef(0);
  const onExitPromptRef = React.useRef(onExitPrompt);
  onExitPromptRef.current = onExitPrompt;

  React.useEffect(() => {
    if (!isNativeApp()) return;

    let remove: (() => void) | undefined;

    try {
      CapApp.addListener('backButton', () => {
        if (consumeAppBack()) return;
        const now = Date.now();
        if (now - lastBackAt.current < EXIT_WINDOW_MS) {
          lastBackAt.current = 0;
          void CapApp.exitApp();
          return;
        }
        lastBackAt.current = now;
        onExitPromptRef.current?.();
      }).then((handle) => {
        remove = () => handle.remove();
      });
    } catch (err: unknown) {
      console.warn('Failed to add back button listener:', err);
    }

    return () => remove?.();
  }, []);

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
