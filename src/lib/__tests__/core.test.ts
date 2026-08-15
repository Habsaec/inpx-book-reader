import { describe, it, expect } from 'vitest';
import { isInsecureRemoteHttp, insecureHttpWarning } from '../serverUrl';
import { statusLabel } from '../downloadQueue';
import { resolveIsDark } from '../serverTheme';
import { authHeader } from '../inpxClient';
import type { ServerConfig } from '../../types';

describe('serverUrl', () => {
  it('flags external HTTP', () => {
    expect(isInsecureRemoteHttp('http://example.com:3000')).toBe(true);
    expect(isInsecureRemoteHttp('https://example.com')).toBe(false);
    expect(isInsecureRemoteHttp('http://192.168.1.5:3000')).toBe(false);
    expect(isInsecureRemoteHttp('http://127.0.0.1:3000')).toBe(false);
    expect(isInsecureRemoteHttp('http://10.0.0.8:3000')).toBe(false);
    expect(isInsecureRemoteHttp('http://172.16.4.2:3000')).toBe(false);
    expect(isInsecureRemoteHttp('http://100.64.1.2:3000')).toBe(false);
    expect(isInsecureRemoteHttp('http://library.local:3000')).toBe(false);
    expect(isInsecureRemoteHttp('http://[::1]:3000')).toBe(false);
    expect(isInsecureRemoteHttp('http://172.32.0.1:3000')).toBe(true);
    expect(isInsecureRemoteHttp('http://8.8.8.8:3000')).toBe(true);
  });

  it('returns warning text for insecure remote HTTP', () => {
    expect(insecureHttpWarning('http://library.example.com')).toContain('HTTP');
  });
});

describe('downloadQueue', () => {
  it('maps status labels', () => {
    expect(statusLabel('queued')).toBe('В очереди');
    expect(statusLabel('saved')).toBe('Сохранено');
  });
});

describe('serverTheme', () => {
  it('resolves dark/light modes', () => {
    expect(resolveIsDark('dark')).toBe(true);
    expect(resolveIsDark('light')).toBe(false);
  });
});

describe('authHeader', () => {
  const base: ServerConfig = {
    url: 'http://127.0.0.1:3000',
    username: 'user',
    password: 'pass',
    connectionStatus: 'connected',
  };

  it('uses bearer device token when password is absent', () => {
    expect(authHeader({ ...base, password: '', deviceToken: 'abc123' })).toEqual({
      Authorization: 'Bearer abc123',
    });
  });

  it('prefers basic auth when password is present', () => {
    const header = authHeader({ ...base, deviceToken: 'abc123' });
    expect(header.Authorization?.startsWith('Basic ')).toBe(true);
  });

  it('falls back to basic auth', () => {
    const header = authHeader(base);
    expect(header.Authorization?.startsWith('Basic ')).toBe(true);
  });

  it('returns empty without credentials', () => {
    expect(authHeader({ url: base.url, connectionStatus: 'disconnected' })).toEqual({});
  });
});
