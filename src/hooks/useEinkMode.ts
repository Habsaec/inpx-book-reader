import React from 'react';
import { APP_SETTING_KEYS, getAppSettingString, setAppSettingRaw } from '../lib/appSettings';
import {
  applyEinkDataset,
  detectEinkDevice,
  parseEinkModePref,
  resolveEinkActive,
  type DeviceIdentity,
  type EinkModePref,
} from '../lib/einkMode';
import { isAndroid } from '../lib/platform';
import { ReaderNative } from '../lib/readerNative';

export function useEinkMode(libraryReady: boolean) {
  const [pref, setPrefState] = React.useState<EinkModePref>(() =>
    parseEinkModePref(getAppSettingString(APP_SETTING_KEYS.einkMode, 'auto')),
  );
  const [device, setDevice] = React.useState<DeviceIdentity | null>(null);
  const [deviceReady, setDeviceReady] = React.useState(() => !isAndroid());

  React.useEffect(() => {
    if (!libraryReady) return;
    const saved = parseEinkModePref(getAppSettingString(APP_SETTING_KEYS.einkMode, 'auto'));
    setPrefState(saved);
  }, [libraryReady]);

  React.useEffect(() => {
    if (!libraryReady) return;
    setAppSettingRaw(APP_SETTING_KEYS.einkMode, pref);
  }, [pref, libraryReady]);

  React.useEffect(() => {
    if (!libraryReady || !isAndroid()) {
      setDeviceReady(true);
      return;
    }
    let cancelled = false;
    void ReaderNative.getDeviceInfo()
      .then((info) => {
        if (cancelled) return;
        if (info?.onyxDevice) {
          console.info('[eink] onyx frontlight', {
            ok: info.onyxFrontLight,
            status: info.onyxStatus,
            error: info.onyxError,
            writeSettings: info.writeSettings,
          });
        }
        setDevice({
          manufacturer: String(info?.manufacturer || ''),
          brand: String(info?.brand || ''),
          model: String(info?.model || ''),
        });
      })
      .catch(() => {
        if (!cancelled) setDevice(null);
      })
      .finally(() => {
        if (!cancelled) setDeviceReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [libraryReady]);

  const detected = React.useMemo(() => detectEinkDevice(device), [device]);
  const active = React.useMemo(() => resolveEinkActive(pref, device), [pref, device]);

  React.useEffect(() => {
    applyEinkDataset(active);
  }, [active]);

  const setPref = React.useCallback((next: EinkModePref) => {
    setPrefState(next);
  }, []);

  return {
    pref,
    setPref,
    active,
    detected,
    device,
    deviceReady,
  };
}
