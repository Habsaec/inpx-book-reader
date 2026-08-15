import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { isAndroid } from './platform';

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
 * Scan a single QR with the Google Code Scanner UI (Android).
 * Returns the raw QR string.
 * Throws {@link QrScanCanceledError} if the user dismisses the scanner.
 */
export async function scanAppPairingQr(): Promise<string> {
  if (!isAndroid()) {
    throw new Error('Сканирование QR доступно только в Android-приложении');
  }

  const supported = await BarcodeScanner.isSupported();
  if (!supported.supported) {
    throw new Error('Сканер QR недоступен на этом устройстве');
  }

  const module = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!module.available) {
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    throw new Error('Устанавливается модуль сканера Google. Повторите сканирование через несколько секунд.');
  }

  let barcodes;
  try {
    ({ barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.QrCode],
    }));
  } catch (err) {
    if (isQrScanCanceled(err)) throw new QrScanCanceledError();
    throw err;
  }
  const raw = barcodes[0]?.rawValue?.trim();
  if (!raw) {
    throw new Error('QR-код не распознан');
  }
  return raw;
}
