import { Capacitor } from '@capacitor/core';
import { APP_SETTING_KEYS, setAppSettingJson } from './appSettings';
import { ReaderNative } from './readerNative';

export type SafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

const ZERO_INSETS: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

function readCssSafeAreaInsets(): SafeAreaInsets {
  if (typeof document === 'undefined') return ZERO_INSETS;

  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

export async function getSafeAreaInsets(): Promise<SafeAreaInsets> {
  if (Capacitor.isNativePlatform()) {
    try {
      const native = await ReaderNative.getSafeAreaInsets();
      if (native && (native.top > 0 || native.bottom > 0)) {
        return {
          top: Number(native.top) || 0,
          bottom: Number(native.bottom) || 0,
          left: Number(native.left) || 0,
          right: Number(native.right) || 0,
        };
      }
    } catch {
      // fallback below
    }
  }

  return readCssSafeAreaInsets();
}

export function storeReaderSafeArea(insets: SafeAreaInsets) {
  setAppSettingJson(APP_SETTING_KEYS.safeArea, insets);
  // iframe bootstrap читает localStorage до postMessage; SQLite ему недоступен.
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('INPX_SAFE_AREA', JSON.stringify(insets));
    }
  } catch {
    /* ignore */
  }
}

export async function prepareReaderSafeArea(): Promise<SafeAreaInsets> {
  const insets = await getSafeAreaInsets();
  storeReaderSafeArea(insets);
  return insets;
}

export function postSafeAreaToWindow(target: Window | null, insets: SafeAreaInsets) {
  target?.postMessage({ type: 'inpx-safe-area', insets }, '*');
}
