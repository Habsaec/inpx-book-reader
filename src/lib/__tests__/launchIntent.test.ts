import { describe, expect, it } from 'vitest';
import { fileNameFromLaunchUri, findBookByLaunchUri, isLaunchPayload } from '../launchIntent';
import type { Book } from '../../types';

const books: Book[] = [
  {
    id: '1',
    title: 'Test Book',
    author: 'Author',
    ext: 'fb2',
    localFileName: 'Author/Series/Test Book.fb2',
    contentUrl: '',
    coverUrl: '',
  },
  {
    id: '2',
    title: 'Other',
    author: 'Author',
    ext: 'epub',
    localFileName: 'Author/No Series/2-other.epub',
    contentUrl: '',
    coverUrl: '',
  },
];

describe('launchIntent', () => {
  it('accepts widget open targets and rejects unknown ones', () => {
    expect(isLaunchPayload({ action: 'open', target: 'home' })).toBe(true);
    expect(isLaunchPayload({ action: 'open', target: 'settings' })).toBe(false);
    expect(isLaunchPayload({ action: 'open' })).toBe(false);
  });

  it('accepts a widget book page only with a book id', () => {
    expect(isLaunchPayload({ action: 'book', bookId: '1:42', title: 'T' })).toBe(true);
    expect(isLaunchPayload({ action: 'book', bookId: '' })).toBe(false);
    expect(isLaunchPayload({ action: 'continue', bookId: '1:42', startTts: true })).toBe(true);
  });

  it('extracts file name from content uri', () => {
    expect(fileNameFromLaunchUri('content://media/external/file/document/test%20book.fb2')).toBe('test book.fb2');
  });

  it('finds book by exact file name', () => {
    const book = findBookByLaunchUri('content://x/Test%20Book.fb2', books);
    expect(book?.id).toBe('1');
  });

  it('finds book by epub file name', () => {
    const book = findBookByLaunchUri('file:///storage/2-other.epub', books);
    expect(book?.id).toBe('2');
  });

  it('returns null when no match', () => {
    expect(findBookByLaunchUri('content://x/unknown.fb2', books)).toBeNull();
  });

  it('strips uri fragment when extracting file name', () => {
    expect(fileNameFromLaunchUri('content://x/Test%20Book.fb2#page=3')).toBe('test book.fb2');
  });

  it('returns null on ambiguous duplicate file names instead of opening the wrong book', () => {
    const dup: Book[] = [
      { ...books[0], id: 'a', localFileName: 'A1/Series/Test Book.fb2' },
      { ...books[0], id: 'b', localFileName: 'A2/Series/Test Book.fb2' },
    ];
    expect(findBookByLaunchUri('content://ext/downloads/test%20book.fb2', dup)).toBeNull();
  });

  it('prefers full path suffix match when the uri carries the library path', () => {
    const dup: Book[] = [
      { ...books[0], id: 'a', localFileName: 'A1/Series/Test Book.fb2' },
      { ...books[0], id: 'b', localFileName: 'A2/Series/Test Book.fb2' },
    ];
    const book = findBookByLaunchUri('file:///storage/emulated/0/Download/A2/Series/Test%20Book.fb2', dup);
    expect(book?.id).toBe('b');
  });
});
