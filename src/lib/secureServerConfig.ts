import { registerPlugin } from '@capacitor/core';
import { ServerConfig } from '../types';
import { isNativeApp } from './platform';
import { revokeDeviceToken } from './inpxClient';

const STORAGE_KEY = 'inpx_server_config';
const DEFAULT_URL = 'http://127.0.0.1:3000';

interface SecureCredentialsPlugin {
  save(options: {
    username: string;
    password: string;
    deviceToken?: string;
    deviceTokenId?: string;
  }): Promise<void>;
  load(): Promise<{
    found: boolean;
    username: string;
    password: string;
    deviceToken: string;
    deviceTokenId: string;
  }>;
  clear(): Promise<void>;
}

interface StoredServerConfig {
  url?: string;
  username?: string;
  password?: string;
  connectionStatus?: ServerConfig['connectionStatus'];
}

const SecureCredentials = registerPlugin<SecureCredentialsPlugin>('SecureCredentials');
let persistQueue = Promise.resolve();

function readStoredConfig(): StoredServerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredServerConfig : {};
  } catch {
    return {};
  }
}

function persistedConnectionStatus(config: ServerConfig): 'connected' | 'disconnected' {
  return config.connectionStatus === 'testing' ? 'connected' : config.connectionStatus;
}

function hasReconnectCredentials(
  username: string,
  password: string,
  deviceToken: string,
): boolean {
  return Boolean(deviceToken.trim() || (username.trim() && password));
}

export function credentialsForPersist(config: ServerConfig): {
  username: string;
  password: string;
  deviceToken: string;
  deviceTokenId: string;
} {
  const deviceToken = config.deviceToken?.trim() || '';
  return {
    username: config.username || '',
    password: deviceToken ? '' : (config.password || ''),
    deviceToken,
    deviceTokenId: config.deviceTokenId || '',
  };
}

export function initialServerConfig(): ServerConfig {
  const stored = readStoredConfig();
  if (isNativeApp()) {
    return {
      url: stored.url || DEFAULT_URL,
      username: '',
      password: '',
      deviceToken: '',
      deviceTokenId: '',
      connectionStatus: 'disconnected',
    };
  }

  const username = stored.username || '';
  const password = stored.password || '';
  const shouldReconnect = stored.connectionStatus === 'connected' && Boolean(username.trim() && password);
  return {
    url: stored.url || DEFAULT_URL,
    username,
    password,
    connectionStatus: shouldReconnect ? 'testing' : 'disconnected',
  };
}

export async function loadServerConfig(): Promise<ServerConfig> {
  if (!isNativeApp()) return initialServerConfig();

  const stored = readStoredConfig();
  let username = '';
  let password = '';
  let deviceToken = '';
  let deviceTokenId = '';

  try {
    const secure = await SecureCredentials.load();
    if (secure.found) {
      username = secure.username || '';
      password = secure.password || '';
      deviceToken = secure.deviceToken || '';
      deviceTokenId = secure.deviceTokenId || '';
    } else if (stored.username || stored.password) {
      username = stored.username || '';
      password = stored.password || '';
      await SecureCredentials.save({ username, password });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      url: stored.url || DEFAULT_URL,
      connectionStatus: stored.connectionStatus === 'connected' ? 'connected' : 'disconnected',
    }));
  } catch {
    username = stored.username || '';
    password = stored.password || '';
  }

  const shouldReconnect =
    stored.connectionStatus === 'connected' &&
    hasReconnectCredentials(username, password, deviceToken);

  return {
    url: stored.url || DEFAULT_URL,
    username,
    password: deviceToken ? '' : password,
    deviceToken,
    deviceTokenId,
    connectionStatus: shouldReconnect ? 'testing' : 'disconnected',
  };
}

export function persistServerConfig(config: ServerConfig): Promise<void> {
  persistQueue = persistQueue.catch(() => undefined).then(async () => {
    const connectionStatus = persistedConnectionStatus(config);
    if (!isNativeApp()) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, connectionStatus }));
      return;
    }

    await SecureCredentials.save(credentialsForPersist(config));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: config.url, connectionStatus }));
  });
  return persistQueue;
}

export async function clearServerCredentials(config?: ServerConfig): Promise<void> {
  if (config?.deviceTokenId && config.url) {
    try {
      await revokeDeviceToken(config, config.deviceTokenId);
    } catch {
      /* best effort */
    }
  }
  if (isNativeApp()) await SecureCredentials.clear();
  localStorage.removeItem(STORAGE_KEY);
}
