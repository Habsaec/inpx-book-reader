export type EinkModePref = 'auto' | 'on' | 'off';

export interface DeviceIdentity {
  manufacturer: string;
  brand: string;
  model: string;
}

const EINK_TOKEN_RE =
  /\b(onyx|boox|tolino|boyue|likebook|pocketbook|bigme|meebook|ireader|supernote|energy\s*sistem|inkbook|qbreader)\b/i;

/** Hisense A-series e-ink phones (A5/A7/A9…). */
const HISENSE_EINK_MODEL_RE = /\ba\s*[579]\b|\ba[579]\d*\b/i;

export function parseEinkModePref(raw: string | null | undefined): EinkModePref {
  if (raw === 'on' || raw === 'off' || raw === 'auto') return raw;
  return 'auto';
}

export function detectEinkDevice(device: Partial<DeviceIdentity> | null | undefined): boolean {
  if (!device) return false;
  const haystack = [device.manufacturer, device.brand, device.model]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' ');
  if (!haystack) return false;
  if (EINK_TOKEN_RE.test(haystack)) return true;
  const manufacturer = String(device.manufacturer || '');
  const brand = String(device.brand || '');
  const model = String(device.model || '');
  if (/hisense/i.test(`${manufacturer} ${brand}`) && HISENSE_EINK_MODEL_RE.test(model)) {
    return true;
  }
  return false;
}

export function resolveEinkActive(
  pref: EinkModePref,
  device: Partial<DeviceIdentity> | null | undefined,
): boolean {
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return detectEinkDevice(device);
}

/** Apply / clear root marker used by app + reader CSS. */
export function applyEinkDataset(active: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (active) root.dataset.eink = '1';
  else delete root.dataset.eink;
}
