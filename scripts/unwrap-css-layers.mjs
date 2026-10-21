/**
 * Android 11 system WebView is Chrome 83. It drops every `@layer` block,
 * and Tailwind 4 puts utilities inside `@layer`, so the shell gets no
 * `position` / `flex` / `overflow` and the page paints as a blank field.
 * Unwrap layers in source order. Later unlayered rules in index.css still win.
 */

function skipString(css, i) {
  const quote = css[i];
  let j = i + 1;
  while (j < css.length) {
    if (css[j] === '\\') {
      j += 2;
      continue;
    }
    if (css[j] === quote) return j + 1;
    j += 1;
  }
  return css.length;
}

function matchBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      i = skipString(css, i) - 1;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return css.length - 1;
}

export function unwrapCssLayers(css) {
  let out = '';
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      const end = skipString(css, i);
      out += css.slice(i, end);
      i = end - 1;
      continue;
    }
    if (!css.startsWith('@layer', i)) {
      out += ch;
      continue;
    }
    const prev = i === 0 ? '' : css[i - 1];
    if (prev && /[-\w]/.test(prev)) {
      out += ch;
      continue;
    }
    let j = i + '@layer'.length;
    while (j < css.length && /\s/.test(css[j])) j += 1;
    if (css[j] === '{') {
      const end = matchBrace(css, j);
      out += unwrapCssLayers(css.slice(j + 1, end));
      i = end;
      continue;
    }
    let k = j;
    while (k < css.length && css[k] !== '{' && css[k] !== ';') k += 1;
    if (css[k] === ';') {
      i = k;
      continue;
    }
    if (css[k] !== '{') {
      out += css.slice(i);
      break;
    }
    const end = matchBrace(css, k);
    out += unwrapCssLayers(css.slice(k + 1, end));
    i = end;
  }
  return out;
}

const LOGICAL_LONGHANDS = [
  ['margin-block-start', 'margin-top'],
  ['margin-block-end', 'margin-bottom'],
  ['margin-inline-start', 'margin-left'],
  ['margin-inline-end', 'margin-right'],
  ['padding-block-start', 'padding-top'],
  ['padding-block-end', 'padding-bottom'],
  ['padding-inline-start', 'padding-left'],
  ['padding-inline-end', 'padding-right'],
  ['inset-block-start', 'top'],
  ['inset-block-end', 'bottom'],
  ['inset-inline-start', 'left'],
  ['inset-inline-end', 'right'],
];

const LOGICAL_SHORTHANDS = [
  ['padding-inline', 'padding-left', 'padding-right'],
  ['padding-block', 'padding-top', 'padding-bottom'],
  ['margin-inline', 'margin-left', 'margin-right'],
  ['margin-block', 'margin-top', 'margin-bottom'],
  ['inset-inline', 'left', 'right'],
  ['inset-block', 'top', 'bottom'],
];

function splitCssList(raw) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of String(raw).trim()) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) {
      if (current) parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts;
}
export function physicalizeLogicalCss(css) {
  let out = css;
  for (const [from, to] of LOGICAL_LONGHANDS) {
    out = out.replace(new RegExp(`${from}\\s*:`, 'g'), `${to}:`);
  }
  for (const [prop, start, end] of LOGICAL_SHORTHANDS) {
    out = out.replace(new RegExp(`${prop}\\s*:\\s*([^;}{]+)`, 'g'), (_, raw) => {
      const parts = splitCssList(raw);
      if (parts.length <= 1) return `${start}: ${parts[0]}; ${end}: ${parts[0]}`;
      return `${start}: ${parts[0]}; ${end}: ${parts[1]}`;
    });
  }
  return out;
}

/** Flex `gap` is recognized but not applied until Chrome 84. */
export function addFlexGapFallback(css) {
  const extra = [];
  const re = /\.((?:gap-(?:x-|y-)?)(?:\\.[\d]|[\w-])+)\{gap:([^}]+)\}/g;
  let match = re.exec(css);
  while (match) {
    const sel = `.${match[1]}`;
    const value = match[2].trim();
    const row = `html[data-flex-gap="0"] .flex${sel}>*+*,html[data-flex-gap="0"] .inline-flex${sel}>*+*`;
    if (match[1].startsWith('gap-y-')) {
      extra.push(`${row}{margin-top:${value}}`);
    } else if (match[1].startsWith('gap-x-')) {
      extra.push(`${row}{margin-left:${value}}`);
    } else {
      extra.push(`${row}{margin-left:${value}}`);
      extra.push(`html[data-flex-gap="0"] .flex-col${sel}>*+*{margin-left:0;margin-top:${value}}`);
    }
    match = re.exec(css);
  }
  return extra.length ? `${css}${extra.join('')}` : css;
}
