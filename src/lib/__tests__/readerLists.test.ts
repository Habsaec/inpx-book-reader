import { describe, expect, it } from 'vitest';
import {
  mergeReaderAnnotationLists,
  mergeReaderBookmarkLists,
  readerAnnotationFromApi,
  readerBookmarkFromApi,
  type LocalReaderAnnotationItem,
  type LocalReaderBookmarkItem,
} from '../offlineReaderStore';

describe('readerBookmarkFromApi', () => {
  it('maps server list rows', () => {
    expect(
      readerBookmarkFromApi({
        id: 7,
        bookId: 'b1',
        bookTitle: 'Dune',
        label: 'Chapter 3',
        position: 'epubcfi(/6/4)',
        ext: '.fb2',
      }),
    ).toEqual({
      id: 7,
      bookId: 'b1',
      bookTitle: 'Dune',
      label: 'Chapter 3',
      position: 'epubcfi(/6/4)',
      ext: 'fb2',
    });
  });
});

describe('mergeReaderBookmarkLists', () => {
  const server: LocalReaderBookmarkItem[] = [
    { id: 1, bookId: 'a', bookTitle: 'A', label: 'Server', position: 'p1' },
  ];
  const local: LocalReaderBookmarkItem[] = [
    { id: 1, bookId: 'a', bookTitle: 'A', label: 'Local edit', position: 'p1' },
    { id: 2, bookId: 'b', bookTitle: 'B', label: 'Unsynced', position: 'p2' },
  ];

  it('keeps server items when local is empty', () => {
    expect(mergeReaderBookmarkLists(server, [])).toEqual(server);
  });

  it('keeps local items when server is empty', () => {
    expect(mergeReaderBookmarkLists([], local)).toEqual(local);
  });

  it('lets local overlay matching position and appends unsynced', () => {
    const merged = mergeReaderBookmarkLists(server, local);
    expect(merged).toHaveLength(2);
    expect(merged.find((b) => b.position === 'p1')?.label).toBe('Local edit');
    expect(merged.find((b) => b.bookId === 'b')?.label).toBe('Unsynced');
  });
});

describe('mergeReaderAnnotationLists', () => {
  it('keeps server notes that were never opened on this device', () => {
    const server: LocalReaderAnnotationItem[] = [
      { id: 9, bookId: 'x', bookTitle: 'X', text: 'quote', note: 'from web', cfi: 'c1', color: 'yellow' },
    ];
    expect(mergeReaderAnnotationLists(server, [])).toEqual(server);
  });

  it('maps annotation api rows', () => {
    expect(
      readerAnnotationFromApi({
        id: 3,
        bookId: 'x',
        bookTitle: 'X',
        text: 'q',
        note: 'n',
        cfi: 'c',
        color: 'green',
      }),
    ).toMatchObject({ id: 3, bookId: 'x', color: 'green', cfi: 'c' });
  });
});
