import type React from 'react';

/**
 * A small patterned tile per genre group (catalog → genres), the same motifs as the web genre list
 * (`genreSwatch` in the server's `shared.js` / `.genre-swatch` in styles.css): the motif and hue come
 * from a stable hash of the group name, so a group keeps its look. CSS gradients only — no images, no
 * color-mix() (Chrome 83 WebViews).
 */
export function genrePatternHash(name: string): number {
  let h = 5381;
  for (const ch of String(name || '')) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return h;
}

export function genrePatternStyle(name: string): React.CSSProperties {
  const h = genrePatternHash(name);
  const hue = h % 360;
  const c = `hsla(${hue}, 45%, 55%, 0.6)`;
  const base = `hsla(${hue}, 40%, 50%, 0.16)`;
  const motifs: Array<[string, string]> = [
    [`repeating-linear-gradient(45deg, ${c} 0 3px, transparent 3px 7px)`, 'auto'],
    [`radial-gradient(${c} 1.4px, transparent 1.7px)`, '6px 6px'],
    [`linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, '6px 6px, 6px 6px'],
    [`radial-gradient(circle at 50% 0, transparent 3px, ${c} 3.5px 4.5px, transparent 5px)`, '8px 6px'],
    [`linear-gradient(135deg, ${c} 25%, transparent 25%), linear-gradient(225deg, ${c} 25%, transparent 25%)`, '8px 8px, 8px 8px'],
    [`conic-gradient(${c} 25%, transparent 0 50%, ${c} 0 75%, transparent 0)`, '8px 8px'],
    [`repeating-radial-gradient(circle at 30% 30%, ${c} 0 1.2px, transparent 1.2px 4px)`, 'auto'],
    [`repeating-linear-gradient(45deg, ${c} 0 1px, transparent 1px 5px), repeating-linear-gradient(-45deg, ${c} 0 1px, transparent 1px 5px)`, 'auto'],
  ];
  const [image, size] = motifs[h % motifs.length];
  return { backgroundColor: base, backgroundImage: image, backgroundSize: size };
}
