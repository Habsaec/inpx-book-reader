import type { ServerConfig } from '../types';
import { isPrivateOrLocalHost } from './serverUrl';
import { normalizeBaseUrl } from './inpxClient';

export function normalizeSsid(value = ''): string {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

/** Home Wi-Fi LAN (192.168/10/172.16–31). Tailscale 100.x is not home LAN. */
export function looksLikeHomeLanUrl(raw: string): boolean {
  const url = normalizeBaseUrl(raw);
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return false;
    return isPrivateOrLocalHost(host);
  } catch {
    return false;
  }
}

/** True when the active server URL is the home LAN (or the configured local slot). */
export function isLocalServerUrl(url: string, localUrl?: string): boolean {
  const current = normalizeBaseUrl(url);
  if (!current) return false;
  const local = normalizeBaseUrl(localUrl || '');
  if (local && current === local) return true;
  return looksLikeHomeLanUrl(current);
}

/** Fill home/away slots from the active URL when auto-switch is turned on. */
export function seedAutoSwitchFromCurrent(config: ServerConfig): Partial<ServerConfig> {
  const current = normalizeBaseUrl(config.url);
  const local = normalizeBaseUrl(config.localUrl || '');
  const away = uniqueNormalizedUrls(config.alternateUrls || [])[0] || '';
  const next: Partial<ServerConfig> = { autoSwitch: true };
  if (!current) return next;
  if (looksLikeHomeLanUrl(current)) {
    if (!local) next.localUrl = current;
  } else if (!away) {
    next.alternateUrls = [current];
  }
  return next;
}

export function uniqueNormalizedUrls(urls: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    const url = normalizeBaseUrl(String(raw || ''));
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

/** Ordered URLs to try when auto-switch is on. Matching home SSID puts the LAN URL first. */
export function candidateServerUrls(
  config: ServerConfig,
  ssid?: string | null,
  transport?: string | null,
): string[] {
  const current = normalizeBaseUrl(config.url);
  if (!config.autoSwitch) return current ? [current] : [];

  const local = normalizeBaseUrl(config.localUrl || '');
  const alts = uniqueNormalizedUrls(config.alternateUrls || []);
  const homeSsid = normalizeSsid(config.localSsid);
  const currentSsid = normalizeSsid(ssid || '');
  const onHomeWifi = Boolean(homeSsid && currentSsid && homeSsid === currentSsid);
  // Cellular has no SSID. Treating that as "unknown Wi-Fi" kept the dead LAN address first
  // and the connected-state shortcut never probed the external URL.
  const leftWifi = transport === 'cellular' || transport === 'none';

  if (!leftWifi && onHomeWifi && local) {
    return uniqueNormalizedUrls([local, current, ...alts]);
  }
  if (leftWifi || (homeSsid && currentSsid && !onHomeWifi)) {
    return uniqueNormalizedUrls([...alts, current, local]);
  }
  return uniqueNormalizedUrls([local, ...alts, current]);
}

/**
 * Probe every candidate at once. An earlier URL wins when it answers;
 * a later one is used only after every earlier probe has failed.
 */
export function firstReachableUrl(
  urls: string[],
  probe: (url: string) => Promise<boolean>,
): Promise<string | null> {
  if (urls.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    let pending = urls.length;
    let settled = false;
    const failed = new Set<number>();
    const reachable = new Map<number, string>();
    const finish = (url: string | null) => {
      if (settled) return;
      settled = true;
      resolve(url);
    };
    const consider = () => {
      for (let i = 0; i < urls.length; i++) {
        const url = reachable.get(i);
        if (url) {
          finish(url);
          return;
        }
        if (!failed.has(i)) return;
      }
      if (pending === 0) finish(null);
    };
    urls.forEach((url, index) => {
      probe(url).then(
        (alive) => {
          pending -= 1;
          if (alive) reachable.set(index, url);
          else failed.add(index);
          consider();
        },
        () => {
          pending -= 1;
          failed.add(index);
          consider();
        },
      );
    });
  });
}
