export type BookReviewItem = {
  name: string;
  timeLabel: string;
  html: string;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function innerOf(html: string, startTag: string): string {
  const start = html.indexOf(startTag);
  if (start < 0) return '';
  let index = start + startTag.length;
  let depth = 1;
  while (index < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', index);
    const nextClose = html.indexOf('</div>', index);
    if (nextClose < 0) return '';
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      index = nextOpen + 4;
      continue;
    }
    depth -= 1;
    if (depth === 0) return html.slice(start + startTag.length, nextClose);
    index = nextClose + 6;
  }
  return '';
}

/** «12 марта 2024». A raw string that is not a date stays as the server sent it. */
export function formatReviewTime(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  let date: Date | null = null;
  if (/^\d{10}$/.test(value)) date = new Date(Number(value) * 1000);
  else if (/^\d{13}$/.test(value)) date = new Date(Number(value));
  else if (/\d{4}/.test(value)) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) date = new Date(parsed);
  }
  if (!date || Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date).replace(/\s*г\.?$/, '');
}

export function reviewInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const letters = parts.slice(0, 2).map((part) => part[0] || '');
  return letters.join('').toLocaleUpperCase('ru');
}

/** Stable hue so the same name keeps the same avatar color. */
export function reviewAvatarHue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return [28, 152, 200, 262, 330][hash % 5];
}

/**
 * Server review HTML is a list of `flib-review-item` blocks
 * (name, time, text). Anything else is one unstructured fragment.
 */
export function parseBookReviews(html: string): BookReviewItem[] {
  const source = String(html || '');
  if (!source.includes('flib-review-item')) return [];
  const items: BookReviewItem[] = [];
  for (const chunk of source.split('<div class="flib-review-item">').slice(1)) {
    const name = decodeHtml(chunk.match(/<strong>([\s\S]*?)<\/strong>/i)?.[1] || '').trim();
    const timeRaw = decodeHtml(chunk.match(/<span class="muted">([\s\S]*?)<\/span>/i)?.[1] || '').trim();
    const body = innerOf(chunk, '<div class="flib-review-text">').trim();
    if (!name && !body) continue;
    items.push({
      name,
      timeLabel: formatReviewTime(timeRaw),
      html: body,
    });
  }
  return items;
}
