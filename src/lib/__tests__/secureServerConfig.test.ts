import { describe, it, expect } from 'vitest';
import { credentialsForPersist, shouldAutoReconnect } from '../secureServerConfig';
import type { ServerConfig } from '../../types';

describe('secureServerConfig device token', () => {
  it('clears password from keystore payload when device token is set', () => {
    const config: ServerConfig = {
      url: 'http://127.0.0.1:3000',
      username: 'reader',
      password: 'secret-password',
      deviceToken: 'dev-token-abc',
      deviceTokenId: 'id-1',
      connectionStatus: 'connected',
    };
    const payload = credentialsForPersist(config);
    expect(payload.password).toBe('');
    expect(payload.deviceToken).toBe('dev-token-abc');
  });

  it('keeps password when device token is absent', () => {
    const config: ServerConfig = {
      url: 'http://127.0.0.1:3000',
      username: 'reader',
      password: 'secret-password',
      connectionStatus: 'connected',
    };
    const payload = credentialsForPersist(config);
    expect(payload.password).toBe('secret-password');
    expect(payload.deviceToken).toBe('');
  });
});

describe('shouldAutoReconnect', () => {
  it('retries when device token exists even after a failed session', () => {
    expect(
      shouldAutoReconnect({
        url: 'http://192.168.1.10:8080',
        username: 'reader',
        deviceToken: 'tok',
      }),
    ).toBe(true);
  });

  it('retries with username/password when no device token', () => {
    expect(
      shouldAutoReconnect({
        url: 'http://192.168.1.10:8080',
        username: 'reader',
        password: 'secret',
      }),
    ).toBe(true);
  });

  it('does not retry without credentials (logged out)', () => {
    expect(
      shouldAutoReconnect({
        url: 'http://192.168.1.10:8080',
        username: 'reader',
      }),
    ).toBe(false);
  });
});
