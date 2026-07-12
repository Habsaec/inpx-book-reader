import { describe, it, expect } from 'vitest';
import { credentialsForPersist } from '../secureServerConfig';
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
