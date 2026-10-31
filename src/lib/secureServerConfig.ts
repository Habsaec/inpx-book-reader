import { registerPlugin } from '@capacitor/core';
import { ServerConfig } from '../types';
import { isNativeApp } from './platform';
import { revokeDeviceToken } from './inpxClient';

const STORAGE_KEY = 'inpx_server_config';
/** No address until the user enters one — a loopback placeholder means nothing on a phone. */
const DEFAULT_URL = '';

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
  /** Saved accounts for quick switching (separate Keystore key; `clear` keeps them). */
  saveAccount(options: {
    key: string;
    username: string;
    password: string;
    deviceToken?: string;
    deviceTokenId?: string;
  }): Promise<void>;
  loadAccount(options: { key: string }): Promise<{
    found: boolean;
    username?: string;
    password?: string;
    deviceToken?: string;
    deviceTokenId?: string;
  }>;
  deleteAccount(options: { key: string }): Promise<void>;
}

interface StoredServerConfig {
  url?: string;
  username?: string;
  password?: string;
  connectionStatus?: ServerConfig['connectionStatus'];
  autoSwitch?: boolean;
  localSsid?: string;
  localUrl?: string;
  alternateUrls?: string[];
}

const SecureCredentials = registerPlugin<SecureCredentialsPlugin>('SecureCredentials');
let persistQueue = Promise.resolve();
/** Bumped on forget/clear so in-flight persist of old credentials is dropped. */
let credentialsEpoch = 0;
/** Set by an account switch: nothing may overwrite the new account's credentials before the reload. */
let credentialsLocked = false;

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

/**
 * Auto-reconnect on boot/resume when credentials exist.
 * Last live status must not block retries: temporary server downtime used to
 * persist `disconnected` and skip the next launch probe forever.
 */
export function shouldAutoReconnect(options: {
  url?: string;
  username?: string;
  password?: string;
  deviceToken?: string;
}): boolean {
  const url = String(options.url || '').trim();
  if (!url) return false;
  return hasReconnectCredentials(
    options.username || '',
    options.password || '',
    options.deviceToken || '',
  );
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

function switchFieldsFromStored(stored: StoredServerConfig): Pick<ServerConfig, 'autoSwitch' | 'localSsid' | 'localUrl' | 'alternateUrls'> {
  return {
    autoSwitch: Boolean(stored.autoSwitch),
    localSsid: stored.localSsid || '',
    localUrl: stored.localUrl || '',
    alternateUrls: Array.isArray(stored.alternateUrls)
      ? stored.alternateUrls.map((u) => String(u || '').trim()).filter(Boolean)
      : [],
  };
}

export function initialServerConfig(): ServerConfig {
  const stored = readStoredConfig();
  if (isNativeApp()) {
    return {
      url: stored.url || DEFAULT_URL,
      username: stored.username || '',
      password: '',
      deviceToken: '',
      deviceTokenId: '',
      connectionStatus: 'disconnected',
      ...switchFieldsFromStored(stored),
    };
  }

  const username = stored.username || '';
  const password = stored.password || '';
  const shouldReconnect = shouldAutoReconnect({
    url: stored.url || DEFAULT_URL,
    username,
    password,
  });
  return {
    url: stored.url || DEFAULT_URL,
    username,
    password,
    connectionStatus: shouldReconnect ? 'testing' : 'disconnected',
    ...switchFieldsFromStored(stored),
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
    let secure: Awaited<ReturnType<typeof SecureCredentials.load>> | null = null;
    let loadError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        secure = await SecureCredentials.load();
        loadError = null;
        break;
      } catch (e) {
        loadError = e;
        await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
      }
    }

    if (secure?.found) {
      username = secure.username || '';
      password = secure.password || '';
      deviceToken = secure.deviceToken || '';
      deviceTokenId = secure.deviceTokenId || '';
    } else if (!loadError && (stored.username || stored.password)) {
      // Only migrate plaintext leftovers when Keystore load succeeded with found=false.
      // On loadError, never overwrite ciphertext (would wipe deviceToken-only sessions).
      username = stored.username || '';
      password = stored.password || '';
      await SecureCredentials.save({ username, password });
    } else if (loadError) {
      console.warn('[secureServerConfig] keystore load failed', loadError);
      username = stored.username || '';
    }

    // Keep username (not secrets) so a keystore flake does not look like a wiped install.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      url: stored.url || DEFAULT_URL,
      username: username || stored.username || '',
      connectionStatus: stored.connectionStatus === 'connected' ? 'connected' : 'disconnected',
      ...switchFieldsFromStored(stored),
    }));
  } catch {
    username = stored.username || '';
    password = stored.password || '';
    // Даже при сбое миграции не оставляем plaintext-пароль в localStorage.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        url: stored.url || DEFAULT_URL,
        username,
        connectionStatus: stored.connectionStatus === 'connected' ? 'connected' : 'disconnected',
        ...switchFieldsFromStored(stored),
      }));
    } catch {
      /* localStorage недоступен — ничего не делаем */
    }
  }

  const shouldReconnect = shouldAutoReconnect({
    url: stored.url || DEFAULT_URL,
    username,
    password: deviceToken ? '' : password,
    deviceToken,
  });

  return {
    url: stored.url || DEFAULT_URL,
    username,
    password: deviceToken ? '' : password,
    deviceToken,
    deviceTokenId,
    connectionStatus: shouldReconnect ? 'testing' : 'disconnected',
    ...switchFieldsFromStored(stored),
  };
}

function publicStoredConfig(
  config: ServerConfig,
  connectionStatus: ServerConfig['connectionStatus'],
): StoredServerConfig {
  return {
    url: config.url,
    username: config.username || '',
    connectionStatus,
    ...switchFieldsFromStored(config),
  };
}

export function persistServerConfig(config: ServerConfig): Promise<void> {
  const epoch = credentialsEpoch;
  const wiped = !config.username && !config.password && !config.deviceToken;
  persistQueue = persistQueue.catch(() => undefined).then(async () => {
    if (epoch !== credentialsEpoch || credentialsLocked) return;
    const connectionStatus = wiped ? 'disconnected' : persistedConnectionStatus(config);
    const publicConfig = publicStoredConfig(config, connectionStatus);
    if (wiped) {
      if (isNativeApp()) await SecureCredentials.clear();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(publicConfig));
      return;
    }
    if (!isNativeApp()) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, connectionStatus }));
      return;
    }

    await SecureCredentials.save(credentialsForPersist(config));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(publicConfig));
  });
  return persistQueue;
}

export async function clearServerCredentials(config?: ServerConfig): Promise<void> {
  credentialsEpoch += 1;
  const epoch = credentialsEpoch;
  persistQueue = persistQueue.catch(() => undefined).then(async () => {
    if (epoch !== credentialsEpoch) return;
    if (config?.deviceTokenId && config.url) {
      try {
        await revokeDeviceToken(config, config.deviceTokenId);
      } catch {
        /* best effort */
      }
    }
    if (isNativeApp()) await SecureCredentials.clear();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        publicStoredConfig(
          {
            url: config?.url || DEFAULT_URL,
            username: '',
            connectionStatus: 'disconnected',
            ...switchFieldsFromStored(config || {}),
          },
          'disconnected',
        ),
      ),
    );
  });
  return persistQueue;
}

/**
 * Account switch: makes `config` the active account on disk and blocks every later persist
 * (the old account's React state still runs until the page reloads).
 */
export async function activateAccountCredentials(config: ServerConfig): Promise<void> {
  credentialsEpoch += 1;
  credentialsLocked = true;
  await persistQueue.catch(() => undefined);
  const connectionStatus: ServerConfig['connectionStatus'] = 'connected';
  if (isNativeApp()) {
    await SecureCredentials.save(credentialsForPersist(config));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(publicStoredConfig(config, connectionStatus)));
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, connectionStatus }));
}

const DEV_ACCOUNT_SECRETS_KEY = 'inpx_account_secrets_dev';

function readDevAccountSecrets(): Record<string, ReturnType<typeof credentialsForPersist>> {
  try {
    return JSON.parse(localStorage.getItem(DEV_ACCOUNT_SECRETS_KEY) || '{}');
  } catch {
    return {};
  }
}

/** Secrets of a saved account (Android Keystore; plain localStorage only in the dev browser). */
export async function saveAccountCredentials(key: string, config: ServerConfig): Promise<void> {
  const creds = credentialsForPersist(config);
  if (isNativeApp()) {
    await SecureCredentials.saveAccount({ key, ...creds });
    return;
  }
  localStorage.setItem(DEV_ACCOUNT_SECRETS_KEY, JSON.stringify({ ...readDevAccountSecrets(), [key]: creds }));
}

export async function loadAccountCredentials(key: string): Promise<ReturnType<typeof credentialsForPersist> | null> {
  if (isNativeApp()) {
    const res = await SecureCredentials.loadAccount({ key });
    if (!res.found) return null;
    return {
      username: res.username || '',
      password: res.password || '',
      deviceToken: res.deviceToken || '',
      deviceTokenId: res.deviceTokenId || '',
    };
  }
  return readDevAccountSecrets()[key] ?? null;
}

export async function deleteAccountCredentials(key: string): Promise<void> {
  if (isNativeApp()) {
    await SecureCredentials.deleteAccount({ key });
    return;
  }
  const all = readDevAccountSecrets();
  delete all[key];
  localStorage.setItem(DEV_ACCOUNT_SECRETS_KEY, JSON.stringify(all));
}
