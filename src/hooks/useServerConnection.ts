import React from 'react';
import { isAndroid } from '../lib/platform';
import {
  initialServerConfig,
  loadServerConfig,
  persistServerConfig,
} from '../lib/secureServerConfig';
import {
  testConnection,
  CONNECTION_TIMEOUT_MS,
  exchangeDeviceToken,
} from '../lib/inpxClient';
import type { ServerConfig } from '../types';

export function useServerConnection() {
  const [serverConfig, setServerConfig] = React.useState<ServerConfig>(initialServerConfig);
  const [serverConfigReady, setServerConfigReady] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const connectionVerifyIdRef = React.useRef(0);

  const markServerDisconnected = React.useCallback(() => {
    setServerConfig((prev) =>
      prev.connectionStatus === 'connected' || prev.connectionStatus === 'testing'
        ? { ...prev, connectionStatus: 'disconnected' }
        : prev,
    );
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void loadServerConfig().then((loaded) => {
      if (cancelled) return;
      setServerConfig(loaded);
      setServerConfigReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!serverConfigReady) return;
    const timer = window.setTimeout(() => {
      void persistServerConfig(serverConfig).catch(() => {
        setConnectionError('Не удалось сохранить учётные данные в защищённом хранилище Android');
      });
    }, 250);
    return () => window.clearTimeout(timer);
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
    };

    const verifyId = ++connectionVerifyIdRef.current;
    const safetyTimer = window.setTimeout(() => {
      if (connectionVerifyIdRef.current !== verifyId) return;
      markServerDisconnected();
    }, CONNECTION_TIMEOUT_MS + 2_000);

    void (async () => {
      try {
        const result = await testConnection(configSnapshot);
        if (connectionVerifyIdRef.current !== verifyId) return;
        setConnectionError(result.ok ? null : result.error || 'Не удалось подключиться');
        if (result.ok && isAndroid() && configSnapshot.username?.trim() && configSnapshot.password) {
          try {
            const exchanged = await exchangeDeviceToken(configSnapshot);
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

    return () => window.clearTimeout(safetyTimer);
  }, [
    markServerDisconnected,
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
    if (!serverConfig.url) {
      setServerConfig((prev) => ({ ...prev, connectionStatus: 'disconnected' }));
      setConnectionError('Укажите адрес сервера');
      return;
    }
    setConnectionError(null);
    setServerConfig((prev) => ({ ...prev, connectionStatus: 'testing' }));
  }, [serverConfig.url]);

  const isVerifyingConnection = serverConfig.connectionStatus === 'testing';

  return {
    serverConfig,
    setServerConfig,
    serverConfigReady,
    connectionError,
    setConnectionError,
    markServerDisconnected,
    handleServerConfigChange,
    handleTestConnection,
    isVerifyingConnection,
  };
}
