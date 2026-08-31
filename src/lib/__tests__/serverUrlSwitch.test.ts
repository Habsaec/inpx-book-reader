import { describe, expect, it } from 'vitest';
import {
  candidateServerUrls,
  isLocalServerUrl,
  looksLikeHomeLanUrl,
  normalizeSsid,
  seedAutoSwitchFromCurrent,
} from '../serverUrlSwitch';
import type { ServerConfig } from '../../types';

const base: ServerConfig = {
  url: 'http://192.168.10.69:8096',
  connectionStatus: 'disconnected',
  autoSwitch: true,
  localSsid: 'inWlan',
  localUrl: 'http://192.168.10.69:8096',
  alternateUrls: ['https://immich.tailscale.ts.net'],
};

describe('candidateServerUrls', () => {
  it('uses only the active URL when auto-switch is off', () => {
    expect(candidateServerUrls({ ...base, autoSwitch: false }, 'inWlan')).toEqual([
      'http://192.168.10.69:8096',
    ]);
  });

  it('puts the LAN URL first on the home Wi-Fi', () => {
    expect(candidateServerUrls(base, 'inWlan')[0]).toBe('http://192.168.10.69:8096');
  });

  it('tries Tailscale before LAN when not on home Wi-Fi', () => {
    const urls = candidateServerUrls(base, 'CoffeeShop');
    expect(urls[0]).toBe('https://immich.tailscale.ts.net');
    expect(urls).toContain('http://192.168.10.69:8096');
  });

  it('tries LAN first when the current SSID is unknown', () => {
    expect(candidateServerUrls(base, '')[0]).toBe('http://192.168.10.69:8096');
  });
});

describe('normalizeSsid', () => {
  it('strips Android quoted SSIDs', () => {
    expect(normalizeSsid('"inWlan"')).toBe('inWlan');
  });
});

describe('looksLikeHomeLanUrl', () => {
  it('accepts RFC1918 LAN addresses', () => {
    expect(looksLikeHomeLanUrl('http://192.168.10.69:3000')).toBe(true);
    expect(looksLikeHomeLanUrl('10.0.0.5:3000')).toBe(true);
  });

  it('rejects Tailscale CGNAT and MagicDNS', () => {
    expect(looksLikeHomeLanUrl('http://100.64.1.2:3000')).toBe(false);
    expect(looksLikeHomeLanUrl('https://server.tailxxxxx.ts.net')).toBe(false);
  });
});

describe('isLocalServerUrl', () => {
  it('treats a LAN IP as local', () => {
    expect(isLocalServerUrl('http://192.168.10.69:3000')).toBe(true);
  });

  it('treats Tailscale as external', () => {
    expect(isLocalServerUrl('https://library.tailxxxxx.ts.net')).toBe(false);
    expect(isLocalServerUrl('http://100.64.1.2:3000')).toBe(false);
  });

  it('treats the configured local slot as local even if the host is a name', () => {
    expect(isLocalServerUrl('http://nas:3000', 'http://nas:3000')).toBe(true);
  });
});

describe('seedAutoSwitchFromCurrent', () => {
  it('puts a LAN URL into the home slot', () => {
    const patch = seedAutoSwitchFromCurrent({
      url: 'http://192.168.1.10:3000',
      connectionStatus: 'connected',
    });
    expect(patch.autoSwitch).toBe(true);
    expect(patch.localUrl).toBe('http://192.168.1.10:3000');
    expect(patch.alternateUrls).toBeUndefined();
  });

  it('puts a Tailscale URL into the away slot', () => {
    const patch = seedAutoSwitchFromCurrent({
      url: 'https://library.tailxxxxx.ts.net',
      connectionStatus: 'connected',
    });
    expect(patch.alternateUrls).toEqual(['https://library.tailxxxxx.ts.net']);
    expect(patch.localUrl).toBeUndefined();
  });
});
