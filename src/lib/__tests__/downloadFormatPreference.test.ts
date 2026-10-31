import { describe, expect, it } from 'vitest';
import { normalizeDownloadFormats, resolveBookDownloadFormat } from '../downloadFormatPreference';

describe('normalizeDownloadFormats', () => {
  it('reads both server shapes', () => {
    expect(normalizeDownloadFormats([{ format: 'EPUB2', label: 'EPUB' }, { format: 'fb2' }])).toEqual(['epub2', 'fb2']);
    expect(normalizeDownloadFormats(['epub3'])).toEqual(['epub3']);
    expect(normalizeDownloadFormats(undefined)).toBeUndefined();
  });
});

describe('resolveBookDownloadFormat', () => {
  const fb2 = { ext: 'fb2', downloadFormats: ['fb2', 'fb2zip', 'epub2', 'epub3'] };

  it('converts FB2 to an EPUB the server offers', () => {
    expect(resolveBookDownloadFormat(fb2, 'epub2')).toEqual({ format: 'epub2', ext: 'epub' });
    expect(resolveBookDownloadFormat(fb2, 'epub3')).toEqual({ format: 'epub3', ext: 'epub' });
  });

  it('keeps the original file otherwise', () => {
    expect(resolveBookDownloadFormat(fb2, '')).toBeNull();
    expect(resolveBookDownloadFormat(fb2, 'kfx')).toBeNull();
    expect(resolveBookDownloadFormat(fb2, 'fb2zip')).toBeNull();
    expect(resolveBookDownloadFormat({ ext: 'fb2', downloadFormats: ['fb2', 'fb2zip'] }, 'epub2')).toBeNull();
    expect(resolveBookDownloadFormat({ ext: 'fb2' }, 'epub2')).toBeNull();
    expect(resolveBookDownloadFormat({ ext: 'epub', downloadFormats: ['epub'] }, 'epub2')).toBeNull();
  });
});
