import React from 'react';
import { ServerConfig } from '../types';
import {
  InpxProfile,
  InpxBookItem,
  ServerShelf,
  fetchProfile,
  fetchFavorites,
  fetchBookmarkedBooks,
  fetchLibraryView,
  fetchShelves,
  toggleBookBookmark,
  toggleBookRead,
  toggleFavoriteAuthorApi,
  toggleFavoriteSeriesApi,
  createServerShelf,
  deleteServerShelf,
  fetchShelfBooks,
  addBookToServerShelf,
  removeBookFromServerShelf,
  saveReadingPosition,
  recordReadingHistory,
  fetchReadingPosition,
  fetchReaderBookmarks,
  addReaderBookmarkApi,
  deleteReaderBookmarkApi,
  fetchReaderAnnotations,
  addReaderAnnotationApi,
  deleteReaderAnnotationApi,
  patchReaderAnnotationApi,
  fetchReaderActivitySyncMeta,
  deleteReadingHistoryApi,
  mapServerBook,
  isUnreachableServerError,
} from '../lib/inpxClient';
import { applyServerActivitySyncMeta } from '../lib/readerActivitySync';

export function isServerOnline(config: ServerConfig): boolean {
  return config.connectionStatus === 'connected' && Boolean(config.url);
}

async function loadAllIds(
  config: ServerConfig,
  loader: (page: number) => Promise<{ items: { id: string }[]; total: number }>
): Promise<Set<string>> {
  const ids = new Set<string>();
  let page = 1;
  let total = Infinity;
  while ((page - 1) * 24 < total) {
    const res = await loader(page);
    res.items.forEach((b) => ids.add(b.id));
    total = res.total;
    if (res.items.length === 0) break;
    page++;
  }
  return ids;
}

async function loadReadingProgressMap(config: ServerConfig): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let page = 1;
  let total = Infinity;
  while ((page - 1) * 50 < total) {
    const res = await fetchLibraryView(config, 'continue', page, 50);
    for (const item of res.items) {
      const progress = Math.round(Number(item.readProgress) || 0);
      if (progress > 0) map.set(item.id, progress);
    }
    total = res.total;
    if (res.items.length === 0) break;
    page++;
  }
  return map;
}

export function useInpxServer(
  config: ServerConfig,
  onConnectionLost?: () => void,
) {
  const online = isServerOnline(config);
  const onConnectionLostRef = React.useRef(onConnectionLost);
  onConnectionLostRef.current = onConnectionLost;

  const [profile, setProfile] = React.useState<InpxProfile | null>(null);
  const [bookmarkIds, setBookmarkIds] = React.useState<Set<string>>(() => new Set());
  const [readIds, setReadIds] = React.useState<Set<string>>(() => new Set());
  const [readingProgress, setReadingProgress] = React.useState<Map<string, number>>(() => new Map());
  const [favoriteAuthors, setFavoriteAuthors] = React.useState<string[]>([]);
  const [favoriteSeries, setFavoriteSeries] = React.useState<string[]>([]);
  const [shelves, setShelves] = React.useState<ServerShelf[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [syncStatus, setSyncStatus] = React.useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [lastSynced, setLastSynced] = React.useState<string | null>(null);

  // Request ID для защиты от гонок данных при изменении config во время запроса
  const refreshRequestId = React.useRef(0);

  const refresh = React.useCallback(async () => {
    if (!online) return;
    setLoading(true);
    setError('');
    setSyncStatus('syncing');
    
    const requestId = ++refreshRequestId.current;
    
    try {
      const [prof, favs, shelfList, bmIds, rdIds, progressMap, activityMeta] = await Promise.all([
        fetchProfile(config),
        fetchFavorites(config),
        fetchShelves(config),
        loadAllIds(config, (p) => fetchBookmarkedBooks(config, p, 24)),
        loadAllIds(config, (p) => fetchLibraryView(config, 'read', p, 24)),
        loadReadingProgressMap(config),
        fetchReaderActivitySyncMeta(config),
      ]);
      
      // Обновляем состояние только если это последний запущенный запрос
      if (requestId !== refreshRequestId.current) return;
      
      setProfile(prof);
      setFavoriteAuthors(favs.authors.map((a) => a.name));
      setFavoriteSeries(favs.series.map((s) => s.name));
      setShelves(shelfList);
      setBookmarkIds(bmIds);
      setReadIds(rdIds);
      const mergedProgress = new Map(progressMap);
      prof.recentBooks.forEach((book) => {
        const progress = Math.round(Number(book.readProgress) || 0);
        if (progress > 0) mergedProgress.set(book.id, progress);
      });
      rdIds.forEach((id) => mergedProgress.set(id, 100));
      setReadingProgress(mergedProgress);
      if (activityMeta) applyServerActivitySyncMeta(activityMeta);
      const timeStr = new Date().toLocaleTimeString('ru-RU');
      setLastSynced(timeStr);
      setSyncStatus('success');
    } catch (err: unknown) {
      // Обновляем ошибку только если это актуальный запрос
      if (requestId !== refreshRequestId.current) return;

      if (isUnreachableServerError(err)) {
        onConnectionLostRef.current?.();
      }

      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSyncStatus('error');
    } finally {
      if (requestId === refreshRequestId.current) {
        setLoading(false);
      }
    }
  }, [config, online]);

  React.useEffect(() => {
    if (online) refresh();
    else {
      setProfile(null);
      setBookmarkIds(new Set());
      setReadIds(new Set());
      setReadingProgress(new Map());
      setFavoriteAuthors([]);
      setFavoriteSeries([]);
      setShelves([]);
    }
  }, [online, config.url, config.username, config.password, config.deviceToken, refresh]);

  const toggleBookmark = React.useCallback(async (bookId: string) => {
    if (!online) return false;
    const bookmarked = await toggleBookBookmark(config, bookId);
    setBookmarkIds((prev) => {
      const next = new Set(prev);
      if (bookmarked) next.add(bookId);
      else next.delete(bookId);
      return next;
    });
    setProfile((p) =>
      p
        ? {
            ...p,
            userStats: {
              ...p.userStats,
              bookmarkCount: p.userStats.bookmarkCount + (bookmarked ? 1 : -1),
            },
          }
        : p
    );
    return bookmarked;
  }, [config, online]);

  const toggleRead = React.useCallback(async (bookId: string) => {
    if (!online) return false;
    const read = await toggleBookRead(config, bookId);
    setReadIds((prev) => {
      const next = new Set(prev);
      if (read) next.add(bookId);
      else next.delete(bookId);
      return next;
    });
    return read;
  }, [config, online]);

  const toggleFavoriteAuthor = React.useCallback(async (name: string) => {
    if (!online) return false;
    const favorite = await toggleFavoriteAuthorApi(config, name);
    setFavoriteAuthors((prev) =>
      favorite ? (prev.includes(name) ? prev : [...prev, name]) : prev.filter((a) => a !== name)
    );
    return favorite;
  }, [config, online]);

  const toggleFavoriteSeries = React.useCallback(async (name: string) => {
    if (!online) return false;
    const favorite = await toggleFavoriteSeriesApi(config, name);
    setFavoriteSeries((prev) =>
      favorite ? (prev.includes(name) ? prev : [...prev, name]) : prev.filter((s) => s !== name)
    );
    return favorite;
  }, [config, online]);

  const addShelf = React.useCallback(async (name: string) => {
    if (!online) return null;
    const id = await createServerShelf(config, name);
    await refresh();
    return id;
  }, [config, online, refresh]);

  const removeShelf = React.useCallback(async (shelfId: number) => {
    if (!online) return;
    await deleteServerShelf(config, shelfId);
    setShelves((prev) => prev.filter((s) => s.id !== shelfId));
  }, [config, online]);

  const loadShelfBooks = React.useCallback(
    async (shelfId: number) => {
      if (!online) return [];
      const items = await fetchShelfBooks(config, shelfId);
      return items.map((b) => mapServerBook(b, config));
    },
    [config, online]
  );

  const addToShelf = React.useCallback(async (shelfId: number, bookId: string) => {
    if (!online) return;
    await addBookToServerShelf(config, shelfId, bookId);
    await refresh();
  }, [config, online, refresh]);

  const removeFromShelf = React.useCallback(async (shelfId: number, bookId: string) => {
    if (!online) return;
    await removeBookFromServerShelf(config, shelfId, bookId);
    await refresh();
  }, [config, online, refresh]);

  const syncPosition = React.useCallback(
    async (bookId: string, position: string, progress: number) => {
      if (!online) return;
      const result = await saveReadingPosition(config, bookId, position, progress);
      setReadingProgress((prev) => {
        const next = new Map(prev);
        const rounded = Math.round(progress);
        if (rounded > 0) next.set(bookId, rounded);
        if (result.markedRead) next.set(bookId, 100);
        return next;
      });
      if (result.markedRead) {
        setReadIds((prev) => new Set(prev).add(bookId));
      }
    },
    [config, online]
  );

  const touchReadingHistory = React.useCallback(
    async (bookId: string) => {
      if (!online) return;
      await recordReadingHistory(config, bookId);
    },
    [config, online]
  );

  const loadPosition = React.useCallback(
    async (bookId: string) => {
      if (!online) return null;
      return fetchReadingPosition(config, bookId);
    },
    [config, online]
  );

  const loadReaderData = React.useCallback(
    async (bookId: string) => {
      if (!online) return { bookmarks: [], annotations: [] };
      const [bookmarks, annotations] = await Promise.all([
        fetchReaderBookmarks(config, bookId),
        fetchReaderAnnotations(config, bookId),
      ]);
      return { bookmarks, annotations };
    },
    [config, online]
  );

  const addReaderBookmark = React.useCallback(
    async (bookId: string, position: string, title: string) => {
      if (!online) return null;
      return addReaderBookmarkApi(config, bookId, position, title);
    },
    [config, online]
  );

  const deleteReaderBookmark = React.useCallback(
    async (bookId: string, bmId: number) => {
      if (!online) return false;
      await deleteReaderBookmarkApi(config, bookId, bmId);
      setProfile((p) =>
        p
          ? {
              ...p,
              readerBookmarks: p.readerBookmarks.filter((b) => !(b.bookId === bookId && b.id === bmId)),
              userStats: {
                ...p.userStats,
                readerBookmarksCount: Math.max(0, p.userStats.readerBookmarksCount - 1),
              },
            }
          : p,
      );
      return true;
    },
    [config, online],
  );

  const addAnnotation = React.useCallback(
    async (bookId: string, cfi: string, text: string, note: string, color: string) => {
      if (!online) return null;
      return addReaderAnnotationApi(config, bookId, cfi, text, note, color);
    },
    [config, online]
  );

  const deleteAnnotation = React.useCallback(
    async (bookId: string, aid: number) => {
      if (!online) return false;
      await deleteReaderAnnotationApi(config, bookId, aid);
      setProfile((p) =>
        p
          ? {
              ...p,
              readerAnnotations: p.readerAnnotations.filter((a) => !(a.bookId === bookId && a.id === aid)),
              userStats: {
                ...p.userStats,
                readerAnnotationsCount: Math.max(0, p.userStats.readerAnnotationsCount - 1),
              },
            }
          : p,
      );
      return true;
    },
    [config, online],
  );

  const patchAnnotation = React.useCallback(
    async (bookId: string, aid: number, patch: { note?: string; color?: string }) => {
      if (!online) return false;
      await patchReaderAnnotationApi(config, bookId, aid, patch);
      setProfile((p) =>
        p
          ? {
              ...p,
              readerAnnotations: p.readerAnnotations.map((a) =>
                a.bookId === bookId && a.id === aid
                  ? {
                      ...a,
                      ...(patch.note !== undefined ? { note: patch.note } : {}),
                      ...(patch.color !== undefined ? { color: patch.color } : {}),
                    }
                  : a,
              ),
            }
          : p,
      );
      return true;
    },
    [config, online],
  );

  const removeReadingHistory = React.useCallback(
    async (bookId: string) => {
      if (!online) return false;
      await deleteReadingHistoryApi(config, bookId);
      setProfile((p) =>
        p
          ? {
              ...p,
              recentBooks: p.recentBooks.filter((b) => b.id !== bookId),
              userStats: {
                ...p.userStats,
                readingCount: Math.max(0, p.userStats.readingCount - 1),
              },
            }
          : p,
      );
      setReadingProgress((prev) => {
        const next = new Map(prev);
        next.delete(bookId);
        return next;
      });
      return true;
    },
    [config, online],
  );

  const removeReadBook = React.useCallback(
    async (bookId: string) => {
      if (!online) return false;
      if (!readIds.has(bookId)) return false;
      await toggleBookRead(config, bookId);
      setReadIds((prev) => {
        const next = new Set(prev);
        next.delete(bookId);
        return next;
      });
      setReadingProgress((prev) => {
        const next = new Map(prev);
        if (next.get(bookId) === 100) next.delete(bookId);
        return next;
      });
      setProfile((p) =>
        p
          ? {
              ...p,
              userStats: {
                ...p.userStats,
                readBooksCount: Math.max(0, p.userStats.readBooksCount - 1),
              },
            }
          : p,
      );
      return true;
    },
    [config, online, readIds],
  );

  const fetchSectionBooks = React.useCallback(
    async (section: 'bookmarks' | 'read' | 'continue' | 'recent' | 'recommended', page = 1): Promise<InpxBookItem[]> => {
      if (!online) return [];
      if (section === 'bookmarks') {
        const res = await fetchBookmarkedBooks(config, page, 24);
        return res.items;
      }
      const res = await fetchLibraryView(config, section, page, 24);
      return res.items;
    },
    [config, online]
  );

  return {
    online,
    profile,
    bookmarkIds,
    readIds,
    readingProgress,
    favoriteAuthors,
    favoriteSeries,
    shelves,
    loading,
    error,
    syncStatus,
    lastSynced,
    refresh,
    toggleBookmark,
    toggleRead,
    toggleFavoriteAuthor,
    toggleFavoriteSeries,
    addShelf,
    removeShelf,
    loadShelfBooks,
    addToShelf,
    removeFromShelf,
    syncPosition,
    touchReadingHistory,
    loadPosition,
    loadReaderData,
    addReaderBookmark,
    deleteReaderBookmark,
    addAnnotation,
    deleteAnnotation,
    patchAnnotation,
    removeReadingHistory,
    removeReadBook,
    fetchSectionBooks,
  };
}
