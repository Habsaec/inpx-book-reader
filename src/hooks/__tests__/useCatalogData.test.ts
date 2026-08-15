// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '../../lib/inpxClient';

const fetchRecentBooksMock = vi.fn();

vi.mock('../../lib/inpxClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/inpxClient')>();
  return {
    ...actual,
    fetchRecentBooks: (...args: unknown[]) => fetchRecentBooksMock(...args),
  };
});

import { useCatalogData } from '../useCatalogData';

const serverConfig = {
  url: 'http://192.168.1.10:8080',
  username: 'user',
  password: 'pass',
  connectionStatus: 'connected' as const,
};

describe('useCatalogData auth errors', () => {
  beforeEach(() => {
    fetchRecentBooksMock.mockReset();
  });

  it('calls onAuthExpired when catalog fetch returns 401', async () => {
    const onAuthExpired = vi.fn();
    fetchRecentBooksMock.mockRejectedValue(new ApiError('Сессия устройства устарела', 401));

    const { result } = renderHook(() =>
      useCatalogData({
        serverConfig,
        isServerConnected: true,
        subTab: 'books',
        debouncedSearch: '',
        searchInput: '',
        catalogSort: 'title',
        entitySort: 'name',
        selectedAuthor: null,
        selectedSeries: null,
        selectedSubgenre: null,
        onAuthExpired,
      }),
    );

    await waitFor(() => {
      expect(onAuthExpired).toHaveBeenCalled();
      expect(result.current.error).toMatch(/устарела/i);
    });
  });
});
