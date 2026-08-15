import { describe, it, expect, vi, beforeEach } from 'vitest';

const { checkAccessMock } = vi.hoisted(() => ({
  checkAccessMock: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: (name: string) => {
    if (name === 'BookStorage') {
      return {
        checkAccess: checkAccessMock,
        getPersistedDownloadsTree: vi.fn(async () => ({ uri: null })),
      };
    }
    return {};
  },
}));

vi.mock('../platform', () => ({
  isAndroid: () => true,
}));

import {
  checkStorageAccess,
  isStoragePermissionError,
  normalizeStorageDirectory,
  STORAGE_PERMISSION_REVOKED_MSG,
} from '../storageDirectory';

describe('checkStorageAccess', () => {
  beforeEach(() => {
    checkAccessMock.mockReset();
  });

  it('returns ok for downloads:// virtual URI without native probe', async () => {
    const result = await checkStorageAccess({
      label: 'Downloads',
      uri: 'downloads://INPXLibraryReader',
    });
    expect(result).toEqual({ ok: true });
    expect(checkAccessMock).not.toHaveBeenCalled();
  });

  it('probes native checkAccess for content:// SAF trees', async () => {
    checkAccessMock.mockResolvedValue({ ok: true });
    const uri = 'content://com.android.externalstorage.documents/tree/primary%3ADownload';
    const result = await checkStorageAccess({ label: 'Folder', uri });
    expect(result).toEqual({ ok: true });
    expect(checkAccessMock).toHaveBeenCalledWith({ treeUri: uri });
  });

  it('returns REVOKED when native probe fails', async () => {
    checkAccessMock.mockResolvedValue({ ok: false, code: 'REVOKED' });
    const result = await checkStorageAccess({
      label: 'Folder',
      uri: 'content://revoked-tree',
    });
    expect(result).toEqual({ ok: false, code: 'REVOKED' });
  });

  it('returns REVOKED when native plugin throws', async () => {
    checkAccessMock.mockRejectedValue(new Error('SecurityException'));
    const result = await checkStorageAccess({
      label: 'Folder',
      uri: 'content://revoked-tree',
    });
    expect(result).toEqual({ ok: false, code: 'REVOKED' });
  });
});

describe('normalizeStorageDirectory', () => {
  it('preserves a persisted SAF grant for the default Downloads folder', () => {
    const directory = {
      label: 'INPXLibraryReader',
      uri: 'content://com.android.externalstorage.documents/tree/primary%3ADownload%2FINPXLibraryReader',
    };
    expect(normalizeStorageDirectory(directory)).toEqual(directory);
  });
});

describe('isStoragePermissionError', () => {
  it('detects PERMISSION_REVOKED from native layer', () => {
    expect(isStoragePermissionError(new Error('PERMISSION_REVOKED: access denied'))).toBe(true);
    expect(isStoragePermissionError(new Error(STORAGE_PERMISSION_REVOKED_MSG))).toBe(true);
    expect(isStoragePermissionError(new Error('SecurityException'))).toBe(true);
    expect(isStoragePermissionError(new Error('Permission Denial: reading ...'))).toBe(true);
    expect(isStoragePermissionError(new Error('File not found'))).toBe(false);
  });
});
