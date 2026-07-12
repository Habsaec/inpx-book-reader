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
import { resolveLocalBookFile } from '../localBookAccess';

describe('resolveLocalBookFile', () => {
  const book: Book = {
    id: 'b1',
    title: 'Test',
    author: 'Author',
    ext: 'fb2',
    localFileName: 'Author/Series/1-Test.fb2',
  };

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
