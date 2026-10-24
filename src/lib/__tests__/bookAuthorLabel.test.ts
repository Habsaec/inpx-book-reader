import { describe, expect, it } from 'vitest';
import { bookAuthorLabel } from '../importExternalBook';

describe('bookAuthorLabel', () => {
  it('hides a folder name stored as the author of a folder book', () => {
    expect(bookAuthorLabel({ id: 'local:abc', author: 'Book', localFileName: 'Book/Melnik.txt' })).toBe('');
  });

  it('hides the old «Импорт» placeholder', () => {
    expect(bookAuthorLabel({ id: 'local:import:1', author: 'Импорт', localFileName: 'Imports/x.fb2' })).toBe('');
  });

  it('keeps a real author of a folder book', () => {
    expect(bookAuthorLabel({ id: 'local:abc', author: 'Модезитт Лиланд', localFileName: 'Book/Bashni.fb2.zip' }))
      .toBe('Модезитт Лиланд');
  });

  it('never touches catalog books', () => {
    expect(bookAuthorLabel({ id: '8:813834', author: 'Book', localFileName: 'Book/x.fb2' })).toBe('Book');
  });
});
