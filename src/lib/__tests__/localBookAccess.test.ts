import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Book } from '../../types';

vi.mock('../bookStorage', () => ({
  bookFileExists: vi.fn(),
}));

vi.mock('../storageDirectory', () => ({
  isValidStorageDirectory: (d: { uri?: string } | null) => Boolean(d?.uri),
  readStoredStorageDirectory: vi.fn(() => ({ label: 'Saved', uri: 'content://saved-tree' })),
  getDefaultStorageDirectory: vi.fn(async () => ({ label: 'Default', uri: 'downloads://INPXLibraryReader' })),
}));

import { bookFileExists } from '../bookStorage';
import { getDefaultStorageDirectory, readStoredStorageDirectory } from '../storageDirectory';
import { resolveLocalBookFile, verifyDownloadedBooksLocalFiles, clearLocalFileMeta } from '../localBookAccess';

const sampleBook: Book = {
  id: 'b1',
  title: 'Test',
  author: 'Author',
  ext: 'fb2',
  localFileName: 'Author/Series/1-Test.fb2',
};

describe('resolveLocalBookFile', () => {
  const book = sampleBook;

  beforeEach(() => {
    vi.mocked(bookFileExists).mockReset();
  });

  it('finds file in primary storage', async () => {
    vi.mocked(bookFileExists).mockResolvedValueOnce(true);
    const loc = await resolveLocalBookFile(book, { label: 'Primary', uri: 'downloads://INPXLibraryReader' });
    expect(loc?.storageUri).toBe('downloads://INPXLibraryReader');
    expect(loc?.localFileName).toBe(book.localFileName);
  });

  it('uses the storage snapshot saved with the downloaded book', async () => {
    vi.mocked(bookFileExists).mockResolvedValueOnce(true);
    const loc = await resolveLocalBookFile(
      { ...book, storageUri: 'content://download-tree' },
      { label: 'Current', uri: 'content://current-tree' },
    );
    expect(loc?.storageUri).toBe('content://download-tree');
    expect(bookFileExists).toHaveBeenCalledTimes(1);
  });

  it('falls back to default folder when primary misses', async () => {
    vi.mocked(bookFileExists)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const loc = await resolveLocalBookFile(book, { label: 'Wrong', uri: 'content://wrong' });
    expect(loc?.storageUri).toBe('downloads://INPXLibraryReader');
  });

  it('returns null when no storage candidates', async () => {
    vi.mocked(bookFileExists).mockResolvedValue(false);
    vi.mocked(readStoredStorageDirectory).mockReturnValueOnce(null);
    vi.mocked(getDefaultStorageDirectory).mockResolvedValueOnce(null);
    const loc = await resolveLocalBookFile(book, null);
    expect(loc).toBeNull();
  });

  it('returns null when file is missing in all candidate folders', async () => {
    vi.mocked(bookFileExists).mockResolvedValue(false);
    const loc = await resolveLocalBookFile(book, { label: 'Primary', uri: 'downloads://INPXLibraryReader' });
    expect(loc).toBeNull();
  });
});

describe('clearLocalFileMeta', () => {
  it('removes local file fields', () => {
    const cleared = clearLocalFileMeta({
      ...sampleBook,
      storageUri: 'content://tree',
      chaptersPath: '.inpx-reader/b1.json',
    });
    expect(cleared.localFileName).toBeUndefined();
    expect(cleared.storageUri).toBeUndefined();
    expect(cleared.chaptersPath).toBeUndefined();
    expect(cleared.id).toBe(sampleBook.id);
  });
});

describe('verifyDownloadedBooksLocalFiles', () => {
  beforeEach(() => {
    vi.mocked(bookFileExists).mockReset();
  });

  it('clears metadata for books whose files are missing', async () => {
    vi.mocked(bookFileExists).mockResolvedValue(false);
    const books: Book[] = [
      sampleBook,
      { id: 'b2', title: 'Other', author: 'A', ext: 'fb2', localFileName: 'A/S/2.fb2' },
    ];
    const result = await verifyDownloadedBooksLocalFiles(books, {
      label: 'Primary',
      uri: 'downloads://INPXLibraryReader',
    });
    expect(result.changed).toBe(true);
    expect(result.missingBookIds).toEqual(['b1', 'b2']);
    expect(result.books[0].localFileName).toBeUndefined();
    expect(result.books[1].localFileName).toBeUndefined();
  });

  it('keeps books unchanged when files exist', async () => {
    vi.mocked(bookFileExists).mockResolvedValue(true);
    const stored = { ...sampleBook, storageUri: 'downloads://INPXLibraryReader' };
    const result = await verifyDownloadedBooksLocalFiles([stored], {
      label: 'Primary',
      uri: 'downloads://INPXLibraryReader',
    });
    expect(result.changed).toBe(false);
    expect(result.missingBookIds).toEqual([]);
    expect(result.books[0]).toBe(stored);
    expect(result.resolvedDirectory?.uri).toBe('downloads://INPXLibraryReader');
  });

  it('updates storageUri when file found in another folder', async () => {
    vi.mocked(bookFileExists)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const withUri = { ...sampleBook, storageUri: 'content://old-tree' };
    const result = await verifyDownloadedBooksLocalFiles([withUri], {
      label: 'Wrong',
      uri: 'content://wrong',
    });
    expect(result.changed).toBe(true);
    expect(result.books[0].storageUri).toBe('content://wrong');
    expect(result.missingBookIds).toEqual([]);
  });
});
