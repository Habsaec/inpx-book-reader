import { describe, it, expect } from 'vitest';
import { getDebugRequestId, redactDebugData } from '../debugSessionLog';

describe('debugSessionLog', () => {
  it('getDebugRequestId returns prefixed ids', () => {
    const id = getDebugRequestId();
    expect(id).toMatch(/^756f1e-[a-z0-9]+$/i);
  });

  it('redacts sensitive fields and credentials in urls', () => {
    const out = redactDebugData({
      password: 'secret',
      deviceToken: 'abc',
      serverUrl: 'http://user:pass@192.168.1.1:3000',
      bookId: 'b1',
    });
    expect(out.password).toBe('***');
    expect(out.deviceToken).toBe('***');
    expect(out.serverUrl).toBe('http://***@192.168.1.1:3000');
    expect(out.bookId).toBe('b1');
  });
});
