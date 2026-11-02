import { registerPlugin } from '@capacitor/core';
import { isAndroid } from './platform';
import { t } from '../i18n';

interface QrScanNative {
  scan(): Promise<{ value?: string }>;
}

const QrScan = registerPlugin<QrScanNative>('QrScan');

/** User dismissed Google Code Scanner without scanning — not a real failure. */
export class QrScanCanceledError extends Error {
  constructor() {
    super('scan canceled');
    this.name = 'QrScanCanceledError';
  }
}

export function isQrScanCanceled(err: unknown): boolean {
  if (err instanceof QrScanCanceledError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /scan\s+cancel+ed/i.test(msg);
}

/**
 * Scan a single QR with the Google Code Scanner UI (Android, Play Services).
 * Returns the raw QR string.
 * Throws {@link QrScanCanceledError} if the user dismisses the scanner.
 */
export async function scanAppPairingQr(): Promise<string> {
  if (!isAndroid()) {
    throw new Error(t('scanAppPairingQr.qrScanningIsAvailableOnly'));
  }

  let value: string | undefined;
  try {
    ({ value } = await QrScan.scan());
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'CANCELED' || isQrScanCanceled(err)) throw new QrScanCanceledError();
    if (code === 'MODULE_INSTALLING') {
      throw new Error(t('scanAppPairingQr.theGoogleScannerModuleIs'));
    }
    if (code === 'UNSUPPORTED') {
      throw new Error(t('scanAppPairingQr.theQrScannerIsUnavailable'));
    }
    throw err;
  }
  const raw = value?.trim();
  if (!raw) {
    throw new Error(t('scanAppPairingQr.theQrCodeWasNot'));
  }
  return raw;
}
