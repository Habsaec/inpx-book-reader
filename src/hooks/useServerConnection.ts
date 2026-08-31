import React from 'react';
import { App as CapApp } from '@capacitor/app';
import { isAndroid, isNativeApp } from '../lib/platform';
import {
  initialServerConfig,
  loadServerConfig,
  persistServerConfig,
  shouldAutoReconnect,
} from '../lib/secureServerConfig';
import {
  testConnection,
  CONNECTION_TIMEOUT_MS,
  exchangeDeviceToken,
  probeServerHealth,
  normalizeBaseUrl,
} from '../lib/inpxClient';
import { candidateServerUrls } from '../lib/serverUrlSwitch';
import { getNetworkStatus, subscribeNetworkChanges } from '../lib/networkInfo';
import type { ServerConfig } from '../types';

export function useServerConnection() {
  const [serverConfig, setServerConfig] = React.useState<ServerConfig>(initialServerConfig);
  const [serverConfigReady, setServerConfigReady] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const connectionVerifyIdRef = React.useRef(0);
  const urlSwitchGenRef = React.useRef(0);
  const serverConfigRef = React.useRef(serverConfig);
  serverConfigRef.current = serverConfig;

  const applyActiveUrl = React.useCallback((url: string) => {
    const next = normalizeBaseUrl(url);
    if (!next) return;
    setServerConfig((prev) => {
      if (normalizeBaseUrl(prev.url) === next) return prev;
      return { ...prev, url: next };
    });
  }, []);

  const pickReachableUrl = React.useCallback(async (config: ServerConfig, ssid?: string | null) => {
    const urls = candidateServerUrls(config, ssid);
    for (const url of urls) {
      const ok = await probeServerHealth({ ...config, url });
      if (ok) return url;
    }
    return normalizeBaseUrl(config.url);
  }, []);

  const markServerDisconnected = React.useCallback(() => {
    setServerConfig((prev) =>
      prev.connectionStatus === 'connected' || prev.connectionStatus === 'testing'
        ? { ...prev, connectionStatus: 'disconnected' }
        : prev,
    );
  }, []);

  const markAuthExpired = React.useCallback(() => {
    setConnectionError('Сессия устройства устарела. Введите логин и пароль заново.');
    const next: ServerConfig = {
      ...serverConfigRef.current,
      connectionStatus: 'disconnected',
      deviceToken: '',
      deviceTokenId: '',
    };
    setServerConfig(next);
    void persistServerConfig(next).catch(() => {
      setConnectionError('Не удалось сохранить учётные данные в защищённом хранилище Android');
    });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void loadServerConfig()
      .then((loaded) => {
        if (cancelled) return;
        setServerConfig(loaded);
      })
      .catch((err) => {
        console.warn('[useServerConnection] loadServerConfig failed:', err);
        if (!cancelled) setServerConfig(initialServerConfig);
      })
      .finally(() => {
        if (!cancelled) setServerConfigReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!serverConfigReady) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void persistServerConfig(serverConfig).catch(() => {
        if (!cancelled) {
          setConnectionError('Не удалось сохранить учётные данные в защищённом хранилище Android');
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [serverConfig, serverConfigReady]);

  React.useEffect(() => {
    if (!serverConfigReady || serverConfig.connectionStatus !== 'testing') return;

    const configSnapshot: ServerConfig = {
      url: serverConfig.url,
      username: serverConfig.username,
      password: serverConfig.password,
      deviceToken: serverConfig.deviceToken,
      deviceTokenId: serverConfig.deviceTokenId,
      connectionStatus: 'testing',
      autoSwitch: serverConfig.autoSwitch,
      localSsid: serverConfig.localSsid,
      localUrl: serverConfig.localUrl,
      alternateUrls: serverConfig.alternateUrls,
    };

    const verifyId = ++connectionVerifyIdRef.current;
    // testConnection can run health + profile (2× CONNECTION_TIMEOUT) then exchangeDeviceToken.
    // Auto-switch may probe a few extra /health URLs first.
    const safetyTimer = window.setTimeout(() => {
      if (connectionVerifyIdRef.current !== verifyId) return;
      markServerDisconnected();
    }, 3 * CONNECTION_TIMEOUT_MS + 12_000);

    void (async () => {
      try {
        let working = configSnapshot;
        if (configSnapshot.autoSwitch && isNativeApp()) {
          const net = await getNetworkStatus();
          if (connectionVerifyIdRef.current !== verifyId) return;
          const picked = await pickReachableUrl(configSnapshot, net.ssid);
          if (connectionVerifyIdRef.current !== verifyId) return;
          if (picked) {
            working = { ...configSnapshot, url: picked };
            applyActiveUrl(picked);
          }
        }
        const result = await testConnection(working);
        if (connectionVerifyIdRef.current !== verifyId) return;
        if (result.authExpired) {
          markAuthExpired();
          return;
        }
        setConnectionError(result.ok ? null : result.error || 'Не удалось подключиться');
        if (result.ok && isAndroid() && working.username?.trim() && working.password) {
          try {
            const exchanged = await exchangeDeviceToken(working);
            if (connectionVerifyIdRef.current !== verifyId) return;
            setServerConfig((prev) => ({
              ...prev,
              connectionStatus: 'connected',
              deviceToken: exchanged.deviceToken,
              deviceTokenId: exchanged.deviceTokenId,
              password: '',
            }));
            return;
          } catch {
            /* keep basic auth */
          }
        }
        setServerConfig((prev) => ({
          ...prev,
          connectionStatus: result.ok ? 'connected' : 'disconnected',
        }));
      } catch {
        if (connectionVerifyIdRef.current !== verifyId) return;
        markServerDisconnected();
      } finally {
        window.clearTimeout(safetyTimer);
      }
    })();

    return () => {
      connectionVerifyIdRef.current += 1;
      window.clearTimeout(safetyTimer);
    };
  }, [
    applyActiveUrl,
    markAuthExpired,
    markServerDisconnected,
    pickReachableUrl,
    serverConfig.autoSwitch,
    serverConfig.connectionStatus,
    serverConfig.deviceToken,
    serverConfig.password,
    serverConfig.url,
    serverConfig.username,
    serverConfigReady,
  ]);

  const handleServerConfigChange = React.useCallback((updatedFields: Partial<ServerConfig>) => {
    setServerConfig((prev) => {
      const next = { ...prev, ...updatedFields };
      if (
        updatedFields.url !== undefined ||
        updatedFields.username !== undefined ||
        updatedFields.password !== undefined
      ) {
        // Смена учётных данных → старый device token больше недействителен для логина.
        next.deviceToken = '';
        next.deviceTokenId = '';
        next.connectionStatus = 'disconnected';
        setConnectionError(null);
      }
      return next;
    });
  }, []);

  const handleTestConnection = React.useCallback(() => {
    const prev = serverConfigRef.current;
    const fallback =
      normalizeBaseUrl(prev.url) ||
      normalizeBaseUrl(prev.localUrl || '') ||
      normalizeBaseUrl((prev.alternateUrls || [])[0] || '');
    if (!fallback) {
      setServerConfig((cur) => ({ ...cur, connectionStatus: 'disconnected' }));
      setConnectionError('Укажите адрес сервера');
      return;
    }
    setConnectionError(null);
    setServerConfig((cur) => ({
      ...cur,
      url: normalizeBaseUrl(cur.url) || fallback,
      connectionStatus: 'testing',
    }));
  }, []);

  const tryAutoReconnect = React.useCallback(() => {
    const prev = serverConfigRef.current;
    if (prev.connectionStatus === 'connected' || prev.connectionStatus === 'testing') return;
    if (!shouldAutoReconnect(prev)) return;
    setConnectionError(null);
    setServerConfig((cur) =>
      cur.connectionStatus === 'connected' || cur.connectionStatus === 'testing'
        ? cur
        : { ...cur, connectionStatus: 'testing' },
    );
  }, []);

  const maybeSwitchServerUrl = React.useCallback(async (ssid?: string | null) => {
    const prev = serverConfigRef.current;
    if (!prev.autoSwitch || !isNativeApp()) return;
    if (prev.connectionStatus === 'testing') return;
    if (prev.connectionStatus !== 'connected' && !shouldAutoReconnect(prev)) return;
    const gen = ++urlSwitchGenRef.current;
    const current = normalizeBaseUrl(prev.url);
    const urls = candidateServerUrls(prev, ssid);
    const preferred = urls[0] || current;
    if (preferred === current && prev.connectionStatus === 'connected') return;
    const picked = await pickReachableUrl(prev, ssid);
    if (urlSwitchGenRef.current !== gen) return;
    if (picked && picked !== current) applyActiveUrl(picked);
    if (prev.connectionStatus !== 'connected') tryAutoReconnect();
  }, [applyActiveUrl, pickReachableUrl, tryAutoReconnect]);

  // Foreground resume: server may have come back after a failed boot probe.
  React.useEffect(() => {
    if (!serverConfigReady || !isNativeApp()) return;
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      const prev = serverConfigRef.current;
      if (prev.autoSwitch) {
        void getNetworkStatus().then((net) => void maybeSwitchServerUrl(net.ssid));
        return;
      }
      tryAutoReconnect();
    });
    return () => {
      void sub.then((h) => h.remove()).catch(() => {});
    };
  }, [maybeSwitchServerUrl, serverConfigReady, tryAutoReconnect]);

  // WebView получает online/offline из ConnectivityManager — статус в шапке
  // реагирует мгновенно, а не после первого упавшего запроса.
  React.useEffect(() => {
    if (!serverConfigReady || !isNativeApp()) return;
    const onOffline = () => markServerDisconnected();
    const onOnline = () => {
      const prev = serverConfigRef.current;
      if (prev.autoSwitch) {
        void getNetworkStatus().then((net) => void maybeSwitchServerUrl(net.ssid));
        return;
      }
      tryAutoReconnect();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [maybeSwitchServerUrl, serverConfigReady, markServerDisconnected, tryAutoReconnect]);

  React.useEffect(() => {
    if (!serverConfigReady || !isNativeApp()) return;
    if (!serverConfig.autoSwitch) return;
    let timer = 0;
    const unsub = subscribeNetworkChanges((status) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void maybeSwitchServerUrl(status.ssid);
      }, 400);
    });
    return () => {
      window.clearTimeout(timer);
      unsub();
    };
  }, [maybeSwitchServerUrl, serverConfig.autoSwitch, serverConfigReady]);

  // Самолечение «застрял офлайн»: transient-ошибка boot-пробы или упавший запрос
  // без последующего события online не должны оставлять приложение офлайн навсегда.
  React.useEffect(() => {
    if (!serverConfigReady || !isNativeApp()) return;
    if (serverConfig.connectionStatus !== 'disconnected') return;
    if (!shouldAutoReconnect(serverConfig)) return;
    const timer = window.setTimeout(() => tryAutoReconnect(), 30_000);
    return () => window.clearTimeout(timer);
  }, [serverConfigReady, serverConfig, tryAutoReconnect]);

  const applyPairingLogin = React.useCallback((result: {
    url: string;
    username: string;
    deviceToken: string;
    deviceTokenId: string;
  }) => {
    setConnectionError(null);
    setServerConfig((prev) => ({
      ...prev,
      url: result.url,
      username: result.username,
      password: '',
      deviceToken: result.deviceToken,
      deviceTokenId: result.deviceTokenId,
      connectionStatus: 'testing',
    }));
  }, []);

  const isVerifyingConnection = serverConfig.connectionStatus === 'testing';

  return {
    serverConfig,
    setServerConfig,
    serverConfigReady,
    connectionError,
    setConnectionError,
    markServerDisconnected,
    markAuthExpired,
    handleServerConfigChange,
    handleTestConnection,
    applyPairingLogin,
    isVerifyingConnection,
  };
}
