import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Book } from '../../types';

vi.mock('../bookStorage', () => ({
  bookFileExists: vi.fn(),
  checkBookFileState: vi.fn(),
  migrateBookChaptersPathIfNeeded: vi.fn(async (_dir: unknown, book: Book) => book),
}));

vi.mock('../storageDirectory', () => ({
  isValidStorageDirectory: (d: { uri?: string } | null) => Boolean(d?.uri),
  normalizeStorageDirectory: (d: { label: string; uri?: string } | null | undefined) => d ?? null,
  readStoredStorageDirectory: vi.fn(() => ({ label: 'Saved', uri: 'content://saved-tree' })),
  getDefaultStorageDirectory: vi.fn(async () => ({ label: 'Default', uri: 'downloads://INPXLibraryReader' })),
  isStoragePermissionError: (err: unknown) =>
    /PERMISSION_REVOKED|SecurityException|Permission Denial/i.test(
      err instanceof Error ? err.message : String(err),
    ),
}));

import { checkBookFileState } from '../bookStorage';
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
    vi.mocked(checkBookFileState).mockReset();
  });

  it('finds file in primary storage', async () => {
    vi.mocked(checkBookFileState)
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('exists');
    const loc = await resolveLocalBookFile(book, { label: 'Primary', uri: 'downloads://INPXLibraryReader' });
    expect(loc?.storageUri).toBe('downloads://INPXLibraryReader');
    expect(loc?.localFileName).toBe(book.localFileName);
  });

  it('uses the storage snapshot saved with the downloaded book', async () => {
    vi.mocked(checkBookFileState)
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('exists');
    const loc = await resolveLocalBookFile(
      { ...book, storageUri: 'content://download-tree' },
      { label: 'Current', uri: 'content://current-tree' },
    );
    expect(loc?.storageUri).toBe('content://download-tree');
  });

  it('prefers a newly granted SAF tree over a stale downloads snapshot', async () => {
    vi.mocked(checkBookFileState).mockResolvedValueOnce('exists');
    const loc = await resolveLocalBookFile(
      { ...book, storageUri: 'downloads://INPXLibraryReader' },
      { label: 'Granted folder', uri: 'content://granted-download-tree' },
    );
    expect(loc?.storageUri).toBe('content://granted-download-tree');
    expect(checkBookFileState).toHaveBeenCalledWith(
      { label: 'Granted folder', uri: 'content://granted-download-tree' },
      book.localFileName,
    );
  });

  it('falls back to default folder when primary misses', async () => {
    vi.mocked(checkBookFileState)
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('exists');
    const loc = await resolveLocalBookFile(book, { label: 'Wrong', uri: 'content://wrong' });
    expect(loc?.storageUri).toBe('downloads://INPXLibraryReader');
  });

  it('falls back when book storageUri is revoked', async () => {
    vi.mocked(checkBookFileState)
      .mockRejectedValueOnce(new Error('PERMISSION_REVOKED: доступ к папке отозван'))
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('exists');
    const loc = await resolveLocalBookFile(
      { ...book, storageUri: 'content://revoked-tree' },
      { label: 'Current', uri: 'content://current-tree' },
    );
    expect(loc?.storageUri).toBe('downloads://INPXLibraryReader');
  });

  it('returns null when no storage candidates', async () => {
    vi.mocked(checkBookFileState).mockResolvedValue('missing');
    vi.mocked(readStoredStorageDirectory).mockReturnValueOnce(null);
    vi.mocked(getDefaultStorageDirectory).mockResolvedValueOnce(null);
    const loc = await resolveLocalBookFile(book, null);
    expect(loc).toBeNull();
  });

  it('returns null when file is missing in all candidate folders', async () => {
    vi.mocked(checkBookFileState).mockResolvedValue('missing');
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
    vi.mocked(checkBookFileState).mockReset();
  });

  it('clears metadata for books whose files are missing', async () => {
    vi.mocked(checkBookFileState).mockResolvedValue('missing');
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
    expect(result.changedBooks).toHaveLength(2);
  });

  it('keeps books unchanged when files exist', async () => {
    vi.mocked(readStoredStorageDirectory).mockReturnValueOnce({
      label: 'Primary',
      uri: 'downloads://INPXLibraryReader',
    });
    vi.mocked(checkBookFileState).mockResolvedValue('exists');
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
    vi.mocked(readStoredStorageDirectory).mockReturnValueOnce(null);
    vi.mocked(checkBookFileState).mockResolvedValueOnce('exists');
    const withUri = { ...sampleBook, storageUri: 'downloads://INPXLibraryReader' };
    const result = await verifyDownloadedBooksLocalFiles([withUri], {
      label: 'Granted',
      uri: 'content://wrong',
    });
    expect(result.changed).toBe(true);
    expect(result.books[0].storageUri).toBe('content://wrong');
    expect(result.missingBookIds).toEqual([]);
  });

  it('keeps metadata when the check is inconclusive (unknown)', async () => {
    vi.mocked(checkBookFileState).mockResolvedValue('unknown');
    const stored = { ...sampleBook, storageUri: 'content://tree' };
    const result = await verifyDownloadedBooksLocalFiles([stored], {
      label: 'Primary',
      uri: 'content://primary',
    });
    expect(result.changed).toBe(false);
    expect(result.missingBookIds).toEqual([]);
    expect(result.unknownBookIds).toEqual(['b1']);
    expect(result.books[0]).toBe(stored);
  });

  it('treats a revoked tree on every candidate as unknown, not missing', async () => {
    vi.mocked(checkBookFileState).mockRejectedValue(new Error('PERMISSION_REVOKED: нет доступа'));
    const stored = { ...sampleBook, storageUri: 'content://revoked' };
    const result = await verifyDownloadedBooksLocalFiles([stored], {
      label: 'Primary',
      uri: 'content://primary',
    });
    expect(result.changed).toBe(false);
    expect(result.missingBookIds).toEqual([]);
    expect(result.unknownBookIds).toEqual(['b1']);
    expect(result.books[0].localFileName).toBe(sampleBook.localFileName);
  });
});
