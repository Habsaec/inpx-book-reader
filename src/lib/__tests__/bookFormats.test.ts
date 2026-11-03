import { describe, expect, it } from 'vitest';
import { bookMimeType, isAppReaderFormat, normalizeBookExt } from '../bookFormats';
import { resolveBookPrimaryAction } from '../bookOpenPolicy';

describe('bookFormats', () => {
  it('lets the built-in reader open Foliate formats, PDF and TXT only', () => {
    for (const ext of ['epub', 'FB2', 'fb2.zip', 'fbz', 'mobi', 'azw3', 'cbz', 'pdf', 'txt', '', undefined]) {
      expect(isAppReaderFormat(ext)).toBe(true);
    }
    for (const ext of ['djvu', 'cbr', 'rtf', 'docx', '.DJVU']) {
      expect(isAppReaderFormat(ext)).toBe(false);
    }
  });

  it('normalizes extensions and picks a MIME type for the open-with intent', () => {
    expect(normalizeBookExt('.PDF')).toBe('pdf');
    expect(normalizeBookExt('djvu.zip')).toBe('djvu');
    expect(bookMimeType('djvu')).toBe('image/vnd.djvu');
    expect(bookMimeType('docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(bookMimeType('xyz')).toBe('application/octet-stream');
  });

  it('a downloaded unreadable book opens in another app, not in the reader', () => {
    expect(resolveBookPrimaryAction({ hasFile: true, readable: false, progress: 40 }).kind).toBe('open-external');
    expect(resolveBookPrimaryAction({ hasFile: false, readable: false }).kind).toBe('download');
    expect(resolveBookPrimaryAction({ hasFile: true, readable: true, progress: 40 }).kind).toBe('continue');
  });
});
