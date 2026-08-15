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

  // Сброс окна «ещё раз для выхода»: любая навигация/оверлей между двумя Back
  // означает, что второй Back — не подтверждение выхода.
  const resetExitPrompt = React.useCallback(() => {
    lastBackAt.current = 0;
  }, []);

  React.useEffect(() => {
    if (!isNativeApp()) return;

    const subPromise = CapApp.addListener('backButton', () => {
      if (consumeAppBack()) {
        lastBackAt.current = 0;
        return;
      }
      const now = Date.now();
      if (now - lastBackAt.current < EXIT_WINDOW_MS) {
        lastBackAt.current = 0;
        void CapApp.exitApp();
        return;
      }
      lastBackAt.current = now;
      onExitPromptRef.current?.();
    });

    return () => {
      void subPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, []);

  return { resetExitPrompt };

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
