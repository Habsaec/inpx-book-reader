import { describe, expect, it } from 'vitest';
import { extFromFileName } from '../importExternalBook';
import { isAppReaderFormat } from '../bookFormats';

describe('extFromFileName (books opened from other apps)', () => {
  it('opens fb2.zip, a bare zip and fbz in the built-in reader', () => {
    for (const name of ['Толстой - Война и мир.fb2.zip', 'Book.FB2.ZIP', 'Tolstoy_Voina.zip', 'Книга (2).fb2.zip', 'Книга.fbz']) {
      expect(isAppReaderFormat(extFromFileName(name))).toBe(true);
    }
    expect(extFromFileName('Book.fb2.zip')).toBe('fb2.zip');
    expect(extFromFileName('Book.zip')).toBe('fb2.zip');
    expect(extFromFileName('Book.fbz')).toBe('fbz');
  });

  it('keeps other formats as before', () => {
    expect(extFromFileName('Book.epub')).toBe('epub');
    expect(extFromFileName('Book.fb2')).toBe('fb2');
    expect(extFromFileName('Scan.djvu.zip')).toBe('djvu.zip');
    expect(isAppReaderFormat(extFromFileName('Scan.djvu.zip'))).toBe(false);
    expect(extFromFileName('noext')).toBe('fb2');
  });
});
