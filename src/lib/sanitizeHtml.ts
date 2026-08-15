/** Minimal HTML sanitizer for book annotations (aligned with server shared.sanitizeHtml). */

const ALLOWED_TAG_RE =
  /^(b|i|em|strong|p|br|span|div|ul|ol|li|h[1-6]|blockquote|sup|sub|a)$/i;

const SAFE_HREF_RE = /^(https?:\/\/|mailto:|tel:|#)/i;

export function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(String(text || ''));
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || /[\s\x00-\x1f\x7f]/.test(trimmed)) return false;
  return SAFE_HREF_RE.test(trimmed);
}

export function sanitizeHtml(html: string): string {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/javascript:/gi, 'blocked:')
    .replace(/vbscript:/gi, 'blocked:')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<(\/?)(\w+)([^>]*)>/g, (_match, slash: string, tag: string, attrs: string) => {
      const lower = tag.toLowerCase();
      if (!ALLOWED_TAG_RE.test(lower)) return '';
      if (slash) return `</${lower}>`;
      if (lower === 'br') return '<br>';
      if (lower === 'a') {
        const hrefMatch = attrs.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const href = (hrefMatch?.[1] || hrefMatch?.[2] || hrefMatch?.[3] || '').trim();
        if (!isSafeHref(href)) return '';
        const safe = href.replace(/"/g, '&quot;');
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">`;
      }
      return `<${lower}>`;
    });
}
