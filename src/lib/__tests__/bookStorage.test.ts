import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fileExistsMock } = vi.hoisted(() => ({
  fileExistsMock: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    fileExists: fileExistsMock,
  }),
}));

import { bookFileExists } from '../bookStorage';

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

  it('returns false when native fileExists call throws', async () => {
    fileExistsMock.mockRejectedValue(new Error('plugin unavailable'));
    await expect(bookFileExists(directory, 'Author/Book.fb2')).resolves.toBe(false);
  });

  it('returns false without calling plugin when uri or path is empty', async () => {
    await expect(bookFileExists({ label: '', uri: '' }, 'Author/Book.fb2')).resolves.toBe(false);
    await expect(bookFileExists(directory, '')).resolves.toBe(false);
    expect(fileExistsMock).not.toHaveBeenCalled();
  });
});
