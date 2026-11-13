import { describe, expect, it } from 'vitest';
import type { Book } from '../../types';
import { homeDownloadedBooks, normalizeHomeDeviceBlocks } from '../homeDeviceBlocks';

const book = (id: string, file = true): Book => ({
  id,
  title: `Book ${id}`,
  author: 'A',
  ext: 'fb2',
  ...(file ? { localFileName: `${id}.fb2` } : {}),
});

describe('homeDeviceBlocks', () => {
  it('is off by default and keeps only real switches', () => {
    expect(normalizeHomeDeviceBlocks(null)).toEqual({ downloaded: false, folders: false });
    expect(normalizeHomeDeviceBlocks({ downloaded: true, folders: 'yes' })).toEqual({ downloaded: true, folders: false });
  });

  it('lists downloaded books with a file, recently opened first, without folder books', () => {
    const books = [book('a'), book('b', false), book('local:f1:x'), book('c'), book('d')];
    expect(homeDownloadedBooks(books, ['d', 'zz', 'b', 'local:f1:x']).map((b) => b.id)).toEqual(['d', 'a', 'c']);
    expect(homeDownloadedBooks(books, [], 2).map((b) => b.id)).toEqual(['a', 'c']);
  });
});
