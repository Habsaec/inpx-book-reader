import { describe, expect, it } from 'vitest';
import { fileNameFromLaunchUri, findBookByLaunchUri } from '../launchIntent';
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
});
