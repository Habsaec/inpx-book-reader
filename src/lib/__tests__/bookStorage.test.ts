import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  fileExistsMock,
  getStorageFilePathMock,
  copyStorageFileToBookCacheMock,
  isNativePlatformMock,
} = vi.hoisted(() => ({
  fileExistsMock: vi.fn(),
  getStorageFilePathMock: vi.fn(),
  copyStorageFileToBookCacheMock: vi.fn(),
  isNativePlatformMock: vi.fn(() => true),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatformMock(),
    convertFileSrc: (path: string) => `https://localhost/_capacitor_file_${path}`,
    getPlatform: () => 'android',
  },
  registerPlugin: () => ({
    fileExists: fileExistsMock,
    getStorageFilePath: getStorageFilePathMock,
    copyStorageFileToBookCache: copyStorageFileToBookCacheMock,
  }),
}));

import {
  bookFileExists,
  bookStorageRelativePath,
  checkBookFileState,
  resolveStorageFileUrl,
  sanitizeFileName,
} from '../bookStorage';

describe('sanitizeFileName', () => {
  it('blocks path traversal segments', () => {
    expect(sanitizeFileName('..')).toBe('_');
    expect(sanitizeFileName('.')).toBe('_');
    expect(sanitizeFileName('...')).toBe('_');
    expect(sanitizeFileName('a/b')).toBe('a_b');
    expect(sanitizeFileName('Кодекс #05')).toBe('Кодекс _05');
    expect(sanitizeFileName('Нормальный')).toBe('Нормальный');
  });

  it('never produces .. in book storage paths', () => {
    const path = bookStorageRelativePath({
      id: '1',
      title: '../evil',
      author: '..',
      series: '.',
      ext: 'fb2',
    });
    expect(path.split('/')).not.toContain('..');
    expect(path.split('/')).not.toContain('.');
    expect(path).toBe('_/_/.._evil.1.fb2');
  });

  it('strips backslashes and control chars (vfat/native safety)', () => {
    expect(sanitizeFileName('a\\b')).toBe('a_b');
    expect(sanitizeFileName('a\nb\rc')).toBe('a_b_c');
    expect(sanitizeFileName('a\0b')).toBe('a_b');
    expect(sanitizeFileName('a\x7fb')).toBe('a_b');
  });

  it('strips trailing dots and spaces (vfat silently strips them on disk)', () => {
    expect(sanitizeFileName('Название.')).toBe('Название');
    expect(sanitizeFileName('Название... ')).toBe('Название');
    expect(sanitizeFileName('.')).toBe('_');
  });

  it('caps filename component length for vfat/exFAT limits', () => {
    const path = bookStorageRelativePath({
      id: 'b'.repeat(300),
      title: 'x'.repeat(400),
      author: 'a',
      series: 's',
      ext: 'fb2',
    });
    const fileName = path.split('/').pop()!;
    expect(fileName.length).toBeLessThanOrEqual(240);
  });
});

describe('bookFileExists', () => {
  const directory = { label: 'Downloads', uri: 'content://tree' };

  beforeEach(() => {
    fileExistsMock.mockReset();
  });

  it('returns true when native plugin reports file exists', async () => {
    fileExistsMock.mockResolvedValue({ exists: true });
    await expect(bookFileExists(directory, 'Author/Book.fb2')).resolves.toBe(true);
  });

  it('returns false when native plugin reports file missing', async () => {
    fileExistsMock.mockResolvedValue({ exists: false });
    await expect(bookFileExists(directory, 'Author/Book.fb2')).resolves.toBe(false);
  });

  it('rethrows permission errors from native plugin', async () => {
    fileExistsMock.mockRejectedValue(new Error('PERMISSION_REVOKED: доступ к папке отозван'));
    await expect(bookFileExists(directory, 'Author/Book.fb2')).rejects.toThrow(/PERMISSION_REVOKED/);
  });

  it('returns false when native fileExists call throws generic error', async () => {
    fileExistsMock.mockRejectedValue(new Error('plugin unavailable'));
    await expect(bookFileExists(directory, 'Author/Book.fb2')).resolves.toBe(false);
  });

  it('reports unknown when native fileExists throws a transient error', async () => {
    fileExistsMock.mockRejectedValue(new Error('plugin unavailable'));
    await expect(checkBookFileState(directory, 'Author/Book.fb2')).resolves.toBe('unknown');
  });

  it('returns false without calling plugin when uri or path is empty', async () => {
    await expect(bookFileExists({ label: '', uri: '' }, 'Author/Book.fb2')).resolves.toBe(false);
    await expect(bookFileExists(directory, '')).resolves.toBe(false);
    expect(fileExistsMock).not.toHaveBeenCalled();
  });
});

describe('resolveStorageFileUrl', () => {
  const directory = { label: 'Downloads', uri: 'content://tree' };

  beforeEach(() => {
    getStorageFilePathMock.mockReset();
    copyStorageFileToBookCacheMock.mockReset();
    isNativePlatformMock.mockReturnValue(true);
  });

  it('uses the downloads disk path when native reports one', async () => {
    getStorageFilePathMock.mockResolvedValue({ absolutePath: '/sdcard/book.fb2' });
    await expect(resolveStorageFileUrl(directory, 'Author/Book.fb2')).resolves.toBe(
      'https://localhost/_capacitor_file_/sdcard/book.fb2',
    );
    expect(copyStorageFileToBookCacheMock).not.toHaveBeenCalled();
  });

  it('streams SAF files into book-cache when there is no disk path', async () => {
    getStorageFilePathMock.mockResolvedValue({ absolutePath: null });
    copyStorageFileToBookCacheMock.mockResolvedValue({
      absolutePath: '/data/user/0/ru.inpx.bookreader/files/book-cache/abc.fb2',
    });
    await expect(resolveStorageFileUrl(directory, 'Author/Book.fb2')).resolves.toBe(
      'https://localhost/_capacitor_file_/data/user/0/ru.inpx.bookreader/files/book-cache/abc.fb2',
    );
  });

  it('skips the disk path when preferCache is set (file-URL 404 fallback)', async () => {
    copyStorageFileToBookCacheMock.mockResolvedValue({
      absolutePath: '/data/data/app/files/book-cache/xyz.fb2',
    });
    await expect(
      resolveStorageFileUrl(directory, 'Author/Book.fb2', { preferCache: true }),
    ).resolves.toBe('https://localhost/_capacitor_file_/data/data/app/files/book-cache/xyz.fb2');
    expect(getStorageFilePathMock).not.toHaveBeenCalled();
  });

  it('rethrows a revoked SAF grant instead of returning null', async () => {
    getStorageFilePathMock.mockResolvedValue({ absolutePath: null });
    copyStorageFileToBookCacheMock.mockRejectedValue(
      new Error('PERMISSION_REVOKED: доступ к папке отозван'),
    );
    await expect(resolveStorageFileUrl(directory, 'Author/Book.fb2')).rejects.toThrow(
      /PERMISSION_REVOKED/,
    );
  });
});
