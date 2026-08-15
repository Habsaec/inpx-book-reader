import { describe, expect, it } from 'vitest';
import { isReaderNativeBridgeMethod } from '../readerNative';

describe('isReaderNativeBridgeMethod', () => {
  it('allows iframe TTS and front-light methods', () => {
    expect(isReaderNativeBridgeMethod('speak')).toBe(true);
    expect(isReaderNativeBridgeMethod('getVoices')).toBe(true);
    expect(isReaderNativeBridgeMethod('setBrightness')).toBe(true);
  });

  it('blocks parent-only and prototype methods', () => {
    expect(isReaderNativeBridgeMethod('setOrientationLock')).toBe(false);
    expect(isReaderNativeBridgeMethod('addListener')).toBe(false);
    expect(isReaderNativeBridgeMethod('removeAllListeners')).toBe(false);
    expect(isReaderNativeBridgeMethod('toString')).toBe(false);
    expect(isReaderNativeBridgeMethod('__proto__')).toBe(false);
    expect(isReaderNativeBridgeMethod(null)).toBe(false);
  });
});
