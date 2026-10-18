/** Chrome 83 cannot resolve color-mix(). Expand the simple cases the server palette uses. */

type Rgba = { r: number; g: number; b: number; a: number };

const MIX_RE = /color-mix\(\s*in\s+srgb\s*,\s*([^,]+?)\s+([\d.]+)%\s*,\s*([^)]+?)\s*\)/gi;

function parseHex(hex: string): Rgba | null {
  const raw = hex.slice(1);
  const full = raw.length === 3 || raw.length === 4
    ? raw.split('').map((ch) => ch + ch).join('')
    : raw;
  if (full.length !== 6 && full.length !== 8) return null;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return null;
  if (full.length === 6) {
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  return { r: (n >> 24) & 255, g: (n >> 16) & 255, b: (n >> 8) & 255, a: (n & 255) / 255 };
}

function parseChannel(token: string): number | null {
  const value = token.trim();
  if (value.endsWith('%')) {
    const pct = Number(value.slice(0, -1));
    return Number.isFinite(pct) ? (pct / 100) * 255 : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseCssColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (value.startsWith('#')) return parseHex(value);
  const m = value.match(/^rgba?\(\s*([^)]+)\)$/);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const r = parseChannel(parts[0]);
  const g = parseChannel(parts[1]);
  const b = parseChannel(parts[2]);
  if (r == null || g == null || b == null) return null;
  let a = 1;
  if (parts[3] != null) {
    const rawA = parts[3].trim();
    a = rawA.endsWith('%') ? Number(rawA.slice(0, -1)) / 100 : Number(rawA);
    if (!Number.isFinite(a)) return null;
  }
  return { r, g, b, a };
}

function mix(first: Rgba, second: Rgba, weight: number): Rgba {
  const w1 = first.a * weight;
  const w2 = second.a * (1 - weight);
  const alpha = w1 + w2;
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (first.r * w1 + second.r * w2) / alpha,
    g: (first.g * w1 + second.g * w2) / alpha,
    b: (first.b * w1 + second.b * w2) / alpha,
    a: alpha,
  };
}

function format(color: Rgba): string {
  const r = Math.round(color.r);
  const g = Math.round(color.g);
  const b = Math.round(color.b);
  const a = Math.round(color.a * 1000) / 1000;
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function flattenColorMix(value: string): string {
  let current = value;
  for (let pass = 0; pass < 4; pass += 1) {
    MIX_RE.lastIndex = 0;
    const next = current.replace(MIX_RE, (full, c1: string, pct: string, c2: string) => {
      const first = parseCssColor(c1);
      const second = parseCssColor(c2);
      const weight = Number(pct) / 100;
      if (!first || !second || !Number.isFinite(weight)) return full;
      return format(mix(first, second, weight));
    });
    if (next === current) break;
    current = next;
  }
  return current;
}

export function colorMixSupported(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    && CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
}

export function cssColorForRuntime(value: string): string {
  return colorMixSupported() ? value : flattenColorMix(value);
}
