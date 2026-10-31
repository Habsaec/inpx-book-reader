/**
 * Quick account switching (one e-reader shared by a family, each with a server account).
 *
 * - Saved accounts: non-secret list in localStorage, secrets in the Android Keystore per account.
 * - Downloaded books (the `books` table, files, covers) are shared by everyone on the device.
 * - Personal data (positions, bookmarks, notes, shelves, favorites, sync queue, reader data,
 *   a few settings) belongs to one account: the current account's set lives in the regular
 *   tables, every other account's set is a snapshot in IndexedDB. A switch snapshots the
 *   current set, restores the target's and reloads the app.
 * - `inpx_personal_owner` names the account that owns the live set. Sync never pushes it
 *   under another account (`isPersonalDataOwner`), and logging in as somebody else swaps
 *   the sets first (`ensurePersonalDataOwner`).
 */
import { get, set, del } from 'idb-keyval';
import type { ServerConfig } from '../types';
import { normalizeBaseUrl } from './inpxClient';
import {
  clearPersonalData,
  exportPersonalData,
  freezeLocalWrites,
  importPersonalData,
  initLocalDb,
  isUsingIndexedDbFallback,
  type PersonalDataSnapshot,
} from './localDb';
import { isNativeApp } from './platform';
import {
  activateAccountCredentials,
  deleteAccountCredentials,
  loadAccountCredentials,
  saveAccountCredentials,
} from './secureServerConfig';

export interface SavedAccount {
  /** `username@server` (lower-cased username, server URL at login). */
  key: string;
  username: string;
  url: string;
  autoSwitch?: boolean;
  localSsid?: string;
  localUrl?: string;
  alternateUrls?: string[];
  lastUsedAt: number;
}

const ACCOUNTS_KEY = 'inpx_accounts_v1';
const OWNER_KEY = 'inpx_personal_owner';
const SNAPSHOT_PREFIX = 'inpx_account_snapshot:';

/** localStorage keys that belong to one account (shelf id map, browse history, account prefs). */
const PERSONAL_LS_KEYS = [
  'inpx-shelf-server-ids',
  'inpx_recent_browse_v1',
  'inpx_download_format',
  'inpx_home_layout',
];

interface StoredSnapshot extends PersonalDataSnapshot {
  localStorage?: Record<string, string>;
}

/** Owner of the personal data: the user name (the server URL changes with LAN / remote switching). */
export function personalOwnerFor(config: Pick<ServerConfig, 'username'>): string {
  return String(config.username || '').trim().toLowerCase();
}

export function accountKeyFor(config: Pick<ServerConfig, 'username' | 'url' | 'localUrl'>): string {
  const server = normalizeBaseUrl(config.localUrl || config.url) || normalizeBaseUrl(config.url);
  return `${personalOwnerFor(config)}@${server}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function listSavedAccounts(): SavedAccount[] {
  const list = readJson<SavedAccount[]>(ACCOUNTS_KEY, []);
  return Array.isArray(list) ? list.filter((a) => a && a.key && a.username) : [];
}

function writeSavedAccounts(list: SavedAccount[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event('inpx-accounts'));
}

export function getPersonalOwner(): string {
  try {
    return localStorage.getItem(OWNER_KEY) || '';
  } catch {
    return '';
  }
}

function setPersonalOwner(owner: string): void {
  try {
    localStorage.setItem(OWNER_KEY, owner);
  } catch {
    /* storage unavailable */
  }
}

/**
 * True when the live personal data may be synced under `config`. An unclaimed set (first run,
 * upgrade from a single-account build) is adopted by whoever connects first.
 */
export function isPersonalDataOwner(config: Pick<ServerConfig, 'username'>): boolean {
  const owner = getPersonalOwner();
  const me = personalOwnerFor(config);
  return !owner || !me || owner === me;
}

/** Remembers a connected account (list + Keystore secrets) for the switcher. */
export async function rememberAccount(config: ServerConfig): Promise<void> {
  const owner = personalOwnerFor(config);
  if (!owner || !config.url) return;
  if (!config.deviceToken && !config.password) return;
  const key = accountKeyFor(config);
  await saveAccountCredentials(key, config);
  const entry: SavedAccount = {
    key,
    username: String(config.username || '').trim(),
    url: normalizeBaseUrl(config.url),
    autoSwitch: config.autoSwitch,
    localSsid: config.localSsid,
    localUrl: config.localUrl,
    alternateUrls: config.alternateUrls,
    lastUsedAt: Date.now(),
  };
  writeSavedAccounts([entry, ...listSavedAccounts().filter((a) => a.key !== key)]);
  if (!getPersonalOwner()) setPersonalOwner(owner);
}

/** Forgets a saved account: its secrets and its personal-data snapshot (not the current one's data). */
export async function forgetSavedAccount(account: SavedAccount): Promise<void> {
  writeSavedAccounts(listSavedAccounts().filter((a) => a.key !== account.key));
  await deleteAccountCredentials(account.key).catch(() => undefined);
  const owner = account.username.trim().toLowerCase();
  const stillUsed = listSavedAccounts().some((a) => a.username.trim().toLowerCase() === owner);
  if (!stillUsed && owner !== getPersonalOwner()) await del(`${SNAPSHOT_PREFIX}${owner}`).catch(() => undefined);
}

export async function forgetAccountForConfig(config: ServerConfig): Promise<void> {
  const key = accountKeyFor(config);
  const account = listSavedAccounts().find((a) => a.key === key);
  if (account) await forgetSavedAccount(account);
}

/**
 * Moves the live personal data into the snapshot of `fromOwner` and loads `toOwner`'s snapshot.
 * Local writes stay frozen afterwards: the caller reloads the app.
 */
async function swapPersonalData(fromOwner: string, toOwner: string): Promise<{ restoreLocalStorage: () => void }> {
  await initLocalDb();
  // On the IndexedDB fallback the live set is not the one in SQLite: a swap would store the
  // wrong data as `fromOwner` and drop `toOwner`'s SQLite snapshot without importing it.
  if (isNativeApp() && isUsingIndexedDbFallback()) {
    throw new Error('База приложения недоступна — перезапустите приложение и повторите');
  }
  freezeLocalWrites();
  const current = await exportPersonalData();
  const localPart: Record<string, string> = {};
  for (const key of PERSONAL_LS_KEYS) {
    const value = localStorage.getItem(key);
    if (value != null) localPart[key] = value;
  }
  if (fromOwner) {
    await set(`${SNAPSHOT_PREFIX}${fromOwner}`, { ...current, localStorage: localPart } satisfies StoredSnapshot);
  }
  const target = ((await get(`${SNAPSHOT_PREFIX}${toOwner}`)) ?? null) as StoredSnapshot | null;
  await clearPersonalData();
  await importPersonalData(target);
  await del(`${SNAPSHOT_PREFIX}${toOwner}`);
  // localStorage last and synchronously right before the reload: no timer of the old state runs in between.
  return {
    restoreLocalStorage: () => {
      for (const key of PERSONAL_LS_KEYS) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(target?.localStorage ?? {})) {
        if (PERSONAL_LS_KEYS.includes(key)) localStorage.setItem(key, value);
      }
      setPersonalOwner(toOwner);
    },
  };
}

function reloadApp(): void {
  window.location.reload();
}

/**
 * Switches to a saved account: snapshot → restore → its credentials become active → reload.
 * Throws when the account's secrets are gone (re-login needed).
 */
export async function switchToAccount(account: SavedAccount, current: ServerConfig): Promise<void> {
  const creds = await loadAccountCredentials(account.key);
  if (!creds || (!creds.deviceToken && !creds.password)) {
    throw new Error('Данные входа этого аккаунта не сохранились — войдите заново');
  }
  const target: ServerConfig = {
    url: account.url,
    username: account.username,
    password: creds.password,
    deviceToken: creds.deviceToken,
    deviceTokenId: creds.deviceTokenId,
    connectionStatus: 'testing',
    autoSwitch: account.autoSwitch,
    localSsid: account.localSsid,
    localUrl: account.localUrl,
    alternateUrls: account.alternateUrls,
  };
  const fromOwner = getPersonalOwner() || personalOwnerFor(current);
  const toOwner = personalOwnerFor(target);
  writeSavedAccounts(listSavedAccounts().map((a) => (a.key === account.key ? { ...a, lastUsedAt: Date.now() } : a)));
  const swap = fromOwner === toOwner ? null : await swapPersonalData(fromOwner, toOwner);
  await activateAccountCredentials(target);
  swap?.restoreLocalStorage();
  reloadApp();
}

/**
 * Safety net for «Выйти» → login as somebody else (login form / QR): before anything syncs,
 * the live personal data of the previous owner is swapped out. Returns true when the app reloads.
 */
export async function ensurePersonalDataOwner(config: ServerConfig): Promise<boolean> {
  const me = personalOwnerFor(config);
  const owner = getPersonalOwner();
  if (!me) return false;
  if (!owner) {
    setPersonalOwner(me);
    return false;
  }
  if (owner === me) return false;
  const swap = await swapPersonalData(owner, me);
  await activateAccountCredentials(config);
  swap.restoreLocalStorage();
  reloadApp();
  return true;
}
