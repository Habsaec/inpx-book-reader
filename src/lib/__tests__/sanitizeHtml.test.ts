import { describe, expect, it } from 'vitest';
import { looksLikeHtml, sanitizeHtml } from '../sanitizeHtml';

describe('sanitizeHtml', () => {
  it('detects html fragments', () => {
    expect(looksLikeHtml('<p>hello</p>')).toBe(true);
    expect(looksLikeHtml('plain text')).toBe(false);
  });

  it('keeps allowed tags and strips scripts', () => {
    const html = sanitizeHtml('<p>ok</p><script>alert(1)</script><b>bold</b>');
    expect(html).toContain('<p>ok</p>');
    expect(html).toContain('<b>bold</b>');
    expect(html).not.toContain('script');
    expect(html).not.toContain('alert');
  });

  it('allows safe links only', () => {
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toContain('https://example.com');
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript');
    expect(sanitizeHtml('<a href="data:text/html,hi">x</a>')).not.toContain('data:');
    expect(sanitizeHtml('<a href="//evil.com">x</a>')).not.toContain('evil.com');
    expect(sanitizeHtml('<a href="vbscript:msg">x</a>')).not.toContain('vbscript');
  });

  it('strips event handlers and disallowed tags', () => {
    const html = sanitizeHtml('<p onclick="alert(1)">ok</p><iframe src="https://evil"></iframe><img src=x onerror=alert(1)>');
    expect(html).toContain('<p>ok</p>');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('iframe');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<img');
  });
});
