import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { isAndroid } from './platform';

/**
 * Scan a single QR with the Google Code Scanner UI (Android).
 * Returns the raw QR string.
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

  const { barcodes } = await BarcodeScanner.scan({
    formats: [BarcodeFormat.QrCode],
  });
  const raw = barcodes[0]?.rawValue?.trim();
  if (!raw) {
    throw new Error('QR-код не распознан');
  }
  return raw;
}
