import { describe, expect, it } from 'vitest';
import {
  downloadFormatFallback,
  getServerDownloadFormats,
  isDownloadFormatOffOnServer,
  normalizeDownloadFormats,
  resolveBookDownloadFormat,
  setServerDownloadFormats,
} from '../downloadFormatPreference';

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

describe('format switched off on the server', () => {
  it('reports only an app-readable format missing from a known server list', () => {
    expect(isDownloadFormatOffOnServer('epub3', ['fb2', 'epub2'])).toBe(true);
    expect(isDownloadFormatOffOnServer('epub3', ['fb2', 'epub3'])).toBe(false);
    expect(isDownloadFormatOffOnServer('epub3', null)).toBe(false); // older server: unknown
    expect(isDownloadFormatOffOnServer('', ['fb2'])).toBe(false);
    expect(isDownloadFormatOffOnServer('kfx', ['fb2'])).toBe(false); // the app keeps the original anyway
  });

  it('keeps the last known list when the server sends nothing', () => {
    setServerDownloadFormats(['FB2', 'epub2']);
    expect(getServerDownloadFormats()).toEqual(['fb2', 'epub2']);
    setServerDownloadFormats(undefined);
    expect(getServerDownloadFormats()).toEqual(['fb2', 'epub2']);
  });

  it('names the fallback for an FB2 book whose formats lack the preference', () => {
    expect(downloadFormatFallback({ ext: 'fb2', downloadFormats: ['fb2', 'epub2'] }, 'epub3')).toBe('epub3');
    expect(downloadFormatFallback({ ext: 'fb2', downloadFormats: ['fb2', 'epub3'] }, 'epub3')).toBeNull();
    expect(downloadFormatFallback({ ext: 'epub', downloadFormats: ['epub'] }, 'epub3')).toBeNull();
    expect(downloadFormatFallback({ ext: 'fb2' }, 'epub3')).toBeNull(); // formats unknown
    expect(downloadFormatFallback({ ext: 'fb2', downloadFormats: ['fb2'] }, '')).toBeNull();
  });
});
