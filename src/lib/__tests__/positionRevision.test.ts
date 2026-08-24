import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetOfflineReaderCacheForTests,
  readOfflineReaderData,
  writeOfflineReaderData,
} from '../offlineReaderStore';
import type { OfflineReaderData } from '../offlineReaderStore';
import {
  acceptPendingPositionRevision,
  completePendingPositionRestore,
  declinePendingPositionRevision,
} from '../../../public/inpx-reader/reader-shared/pending-position-revision.js';

vi.mock('../inpxClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../inpxClient')>();
  return {
    ...actual,
    addReaderAnnotationApi: vi.fn(),
    addReaderBookmarkApi: vi.fn(),
    deleteReaderAnnotationApi: vi.fn(),
    deleteReaderBookmarkApi: vi.fn(),
    fetchReaderAnnotations: vi.fn(),
    fetchReaderBookmarks: vi.fn(),
    fetchReadingPosition: vi.fn(),
    fetchReaderBookSyncMeta: vi.fn(),
    fetchReaderActivitySyncMeta: vi.fn(),
    saveReadingPosition: vi.fn(),
  };
});

import {
  fetchReaderAnnotations,
  fetchReaderBookmarks,
  fetchReadingPosition,
  fetchReaderBookSyncMeta,
  ReadingPositionConflictError,
  saveReadingPosition,
} from '../inpxClient';
import type { ServerReadingPosition } from '../inpxClient';
import {
  finalizeReadingPositionSync,
  pullServerPositionIfAhead,
  syncOfflineReaderForBook,
  syncPositionOnBookOpen,
} from '../offlineSync';
import type { ServerConfig } from '../../types';

const config: ServerConfig = {
  url: 'http://test/',
  username: 'u',
  password: 'p',
  connectionStatus: 'connected',
};

function localPosition(overrides: Partial<OfflineReaderData> = {}): OfflineReaderData {
  return {
    positionVersion: 4,
    serverRevision: 2,
    baseRevision: 2,
    positionDirty: false,
    position: 'epubcfi(/6/4)',
    progress: 20,
    fraction: 0.2,
    bookmarks: [],
    annotations: [],
    ...overrides,
  };
}

function serverPosition(overrides: Partial<ServerReadingPosition> = {}): ServerReadingPosition {
  return {
    positionVersion: 4,
    revision: 3,
    position: 'epubcfi(/6/10)',
    progress: 60,
    fraction: 0.6,
    updatedAt: '2026-07-12T12:00:00.000Z',
    ...overrides,
  };
}

describe('revision/CAS position sync', () => {
  beforeEach(() => {
    __resetOfflineReaderCacheForTests();
    vi.mocked(fetchReadingPosition).mockReset();
    vi.mocked(fetchReaderBookSyncMeta).mockReset();
    vi.mocked(saveReadingPosition).mockReset();
    vi.mocked(fetchReaderBookmarks).mockReset();
    vi.mocked(fetchReaderAnnotations).mockReset();
    vi.mocked(fetchReaderBookmarks).mockResolvedValue([]);
    vi.mocked(fetchReaderAnnotations).mockResolvedValue([]);
    vi.mocked(fetchReaderBookSyncMeta).mockResolvedValue(null);
  });

  it('prompts for a newer differing server revision when local is clean but meaningful', async () => {
    writeOfflineReaderData('book-1', localPosition());
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      sectionIndex: 2,
      textOffset: 4321,
      textQuote: 'Exact server words',
      textSectionLength: 12000,
      paginatorPage: 7,
      paginatorPages: 18,
    }));

    expect(await syncPositionOnBookOpen(config, 'book-1')).toBe('pending');
    expect(readOfflineReaderData('book-1')).toMatchObject({
      fraction: 0.2,
      serverRevision: 3,
      baseRevision: 2,
      positionDirty: false,
      pendingCrossDevicePrompt: true,
      serverSectionIndex: 2,
      serverTextOffset: 4321,
      serverTextQuote: 'Exact server words',
      serverTextSectionLength: 12000,
      serverPaginatorPage: 7,
      serverPaginatorPages: 18,
    });
  });

  it('defers a different newer server revision on open when local is dirty', async () => {
    writeOfflineReaderData('book-1', localPosition({ positionDirty: true }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      sectionIndex: 6,
      textOffset: 2345,
      textQuote: 'Pending exact words',
      textSectionLength: 15000,
    }));

    expect(await syncPositionOnBookOpen(config, 'book-1')).toBe('pending');
    expect(readOfflineReaderData('book-1')).toMatchObject({
      position: 'epubcfi(/6/4)',
      fraction: 0.2,
      serverRevision: 3,
      baseRevision: 2,
      positionDirty: true,
      pendingCrossDevicePrompt: true,
      serverPosition: 'epubcfi(/6/10)',
      serverSectionIndex: 6,
      serverTextOffset: 2345,
      serverTextQuote: 'Pending exact words',
      serverTextSectionLength: 15000,
    });
  });

  it('decline adopts the revision without moving and suppresses the same revision on reopen', async () => {
    const declined = declinePendingPositionRevision(localPosition({
      serverRevision: 3,
      baseRevision: 2,
      positionDirty: true,
      pendingCrossDevicePrompt: false,
    }));
    writeOfflineReaderData('book-1', declined);
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition());

    expect(await syncPositionOnBookOpen(config, 'book-1')).toBe('noop');
    expect(await finalizeReadingPositionSync(config, 'book-1')).toBe('noop');
    expect(saveReadingPosition).not.toHaveBeenCalled();
    expect(readOfflineReaderData('book-1')).toMatchObject({
      position: 'epubcfi(/6/4)',
      fraction: 0.2,
      serverRevision: 3,
      baseRevision: 3,
      positionDirty: false,
      dismissedServerRevision: 3,
    });
  });

  it('accepts a pending server snapshot as the new clean base', () => {
    const accepted = acceptPendingPositionRevision(localPosition({
      serverRevision: 5,
      baseRevision: 2,
      positionDirty: true,
      dismissedServerRevision: 3,
    }));

    expect(accepted).toMatchObject({
      positionVersion: 4,
      serverRevision: 5,
      baseRevision: 5,
      positionDirty: false,
      dismissedServerRevision: null,
    });
  });

  it('keeps a failed accepted restore pending and retryable', () => {
    const pending = localPosition({
      serverRevision: 5,
      baseRevision: 2,
      positionDirty: true,
      pendingCrossDevicePrompt: true,
    });

    expect(completePendingPositionRestore(pending, false)).toBe(false);
    expect(pending).toMatchObject({
      positionVersion: 4,
      serverRevision: 5,
      baseRevision: 2,
      positionDirty: true,
      pendingCrossDevicePrompt: true,
    });
  });

  it('treats a fraction delta above 1e-5 as a real dirty-position conflict', async () => {
    writeOfflineReaderData('book-1', localPosition({
      positionDirty: true,
      position: '',
      fraction: 0.2,
      progress: 20,
    }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      position: '',
      revision: 3,
      fraction: 0.20002,
      progress: 20.002,
    }));

    expect(await syncPositionOnBookOpen(config, 'book-1')).toBe('pending');
    expect(readOfflineReaderData('book-1')).toMatchObject({
      baseRevision: 2,
      serverRevision: 3,
      positionDirty: true,
      pendingCrossDevicePrompt: true,
    });
  });

  it('CAS-pushes against baseRevision and advances both revisions on success', async () => {
    writeOfflineReaderData('book-1', localPosition({
      positionDirty: true,
      position: 'epubcfi(/6/8)',
      progress: 40,
      fraction: 0.4,
    }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      revision: 2,
      position: 'epubcfi(/6/4)',
      progress: 20,
      fraction: 0.2,
    }));
    vi.mocked(saveReadingPosition).mockResolvedValue({
      positionVersion: 4,
      revision: 3,
      updatedAt: '2026-07-12T12:00:00.000Z',
    });

    expect(await finalizeReadingPositionSync(config, 'book-1')).toBe('pushed');
    expect(saveReadingPosition).toHaveBeenCalledWith(
      config,
      'book-1',
      'epubcfi(/6/8)',
      40,
      0.4,
      undefined,
      expect.any(Object),
      2,
      undefined,
    );
    expect(readOfflineReaderData('book-1')).toMatchObject({
      serverRevision: 3,
      baseRevision: 3,
      positionDirty: false,
    });
  });

  it('stores HTTP 409 current revision without advancing the CAS base', async () => {
    writeOfflineReaderData('book-1', localPosition({
      positionDirty: true,
      position: 'epubcfi(/6/8)',
      progress: 40,
      fraction: 0.4,
    }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      revision: 2,
      position: 'epubcfi(/6/4)',
      progress: 20,
      fraction: 0.2,
    }));
    vi.mocked(saveReadingPosition).mockRejectedValue(new ReadingPositionConflictError(
      serverPosition({ revision: 3 }),
    ));

    const result = await finalizeReadingPositionSync(config, 'book-1');
    expect(result).toBe('conflict');
    expect(readOfflineReaderData('book-1')).toMatchObject({
      position: 'epubcfi(/6/8)',
      serverRevision: 3,
      baseRevision: 2,
      positionDirty: true,
      pendingCrossDevicePrompt: true,
    });
  });

  it('pulls a newer revision in background only when local is clean', async () => {
    writeOfflineReaderData('book-1', localPosition());
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition());

    expect(await pullServerPositionIfAhead(config, 'book-1')).toBe(true);
    expect(readOfflineReaderData('book-1')).toMatchObject({
      serverRevision: 3,
      baseRevision: 3,
      positionDirty: false,
      fraction: 0.6,
    });
  });

  it('preserves baseRevision when full sync observes a conflicting revision', async () => {
    writeOfflineReaderData('book-1', localPosition({
      positionDirty: true,
      position: 'epubcfi(/6/8)',
      progress: 40,
      fraction: 0.4,
    }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition());

    await syncOfflineReaderForBook(config, 'book-1');

    expect(saveReadingPosition).not.toHaveBeenCalled();
    expect(readOfflineReaderData('book-1')).toMatchObject({
      position: 'epubcfi(/6/8)',
      serverRevision: 3,
      baseRevision: 2,
      positionDirty: true,
      pendingCrossDevicePrompt: true,
    });
  });

  it('retains an in-reader relocate that happens while full sync is saving', async () => {
    writeOfflineReaderData('book-1', localPosition({
      positionDirty: true,
      position: 'epubcfi(/6/8)',
      progress: 40,
      fraction: 0.4,
      positionChangedAt: '2026-07-12T10:00:00.000Z',
    }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      revision: 2,
      position: 'epubcfi(/6/4)',
      progress: 20,
      fraction: 0.2,
    }));
    let resolveSave!: (value: {
      positionVersion: number;
      revision: number;
      updatedAt: string;
    }) => void;
    vi.mocked(saveReadingPosition).mockReturnValue(new Promise((resolve) => {
      resolveSave = resolve;
    }));

    const syncing = syncOfflineReaderForBook(config, 'book-1');
    await vi.waitFor(() => expect(saveReadingPosition).toHaveBeenCalledOnce());
    writeOfflineReaderData('book-1', {
      ...readOfflineReaderData('book-1'),
      position: 'epubcfi(/6/12)',
      progress: 70,
      fraction: 0.7,
      positionDirty: true,
      positionChangedAt: '2099-01-01T00:00:00.000Z',
    });
    resolveSave({
      positionVersion: 4,
      revision: 3,
      updatedAt: '2026-07-12T12:00:00.000Z',
    });
    await syncing;

    expect(readOfflineReaderData('book-1')).toMatchObject({
      position: 'epubcfi(/6/12)',
      fraction: 0.7,
      serverRevision: 3,
      baseRevision: 3,
      positionDirty: true,
    });
  });

  it('does not pull server position while a cross-device prompt is still pending', async () => {
    writeOfflineReaderData('book-1', localPosition({
      pendingCrossDevicePrompt: true,
      position: 'epubcfi(/6/4)',
      progress: 20,
      fraction: 0.2,
    }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition());

    await syncOfflineReaderForBook(config, 'book-1');

    expect(saveReadingPosition).not.toHaveBeenCalled();
    expect(readOfflineReaderData('book-1')).toMatchObject({
      position: 'epubcfi(/6/4)',
      fraction: 0.2,
      progress: 20,
      pendingCrossDevicePrompt: true,
      baseRevision: 2,
      positionDirty: false,
    });
  });

  it('pushes on close when pendingCrossDevicePrompt is set but local reading is dirty', async () => {
    writeOfflineReaderData('book-1', localPosition({
      positionDirty: true,
      pendingCrossDevicePrompt: true,
      position: 'epubcfi(/6/8)',
      progress: 40,
      fraction: 0.4,
    }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({ revision: 2 }));
    vi.mocked(saveReadingPosition).mockResolvedValue({
      positionVersion: 4,
      revision: 3,
      updatedAt: '2026-07-12T12:00:00.000Z',
    });

    expect(await finalizeReadingPositionSync(config, 'book-1')).toBe('pushed');
    expect(saveReadingPosition).toHaveBeenCalled();
    expect(readOfflineReaderData('book-1')).toMatchObject({
      positionDirty: false,
      pendingCrossDevicePrompt: false,
      baseRevision: 3,
    });
  });

  it('keeps meaningful local position when server snapshot is empty at the same revision', async () => {
    writeOfflineReaderData('book-1', localPosition({
      position: 'epubcfi(/6/4)',
      progress: 20,
      fraction: 0.2,
      baseRevision: 0,
      serverRevision: 0,
    }));
    vi.mocked(fetchReadingPosition).mockResolvedValue(serverPosition({
      revision: 0,
      position: '',
      progress: 0,
      fraction: 0,
      sectionIndex: null,
      textOffset: null,
    }));

    expect(await syncPositionOnBookOpen(config, 'book-1')).toBe('noop');
    expect(readOfflineReaderData('book-1')).toMatchObject({
      fraction: 0.2,
      progress: 20,
    });
  });
});
