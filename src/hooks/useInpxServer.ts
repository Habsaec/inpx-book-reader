import React from 'react';
import { ServerConfig } from '../types';
import {
  InpxProfile,
  InpxBookItem,
  ServerShelf,
  FavoriteAuthorItem,
  FavoriteSeriesItem,
  fetchProfile,
  fetchFavorites,
  fetchBookmarkedBooks,
  fetchLibraryView,
  fetchShelves,
  toggleBookBookmark,
  toggleBookRead,
  ensureBookReadState,
  toggleFavoriteAuthorApi,
  toggleFavoriteSeriesApi,
  createServerShelf,
  deleteServerShelf,
  fetchShelfBooks,
  addBookToServerShelf,
  removeBookFromServerShelf,
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
  isAuthError,
} from '../lib/inpxClient';
import { applyServerActivitySyncMeta } from '../lib/readerActivitySync';
import { dropQueuedToggleReadOps } from '../lib/syncQueueProcessor';

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
  onAuthExpired?: () => void,
) {
  const online = isServerOnline(config);
  const onConnectionLostRef = React.useRef(onConnectionLost);
  onConnectionLostRef.current = onConnectionLost;
  const onAuthExpiredRef = React.useRef(onAuthExpired);
  onAuthExpiredRef.current = onAuthExpired;

  const withAuthGuard = React.useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    return fn().catch((e: unknown) => {
      if (isAuthError(e)) onAuthExpiredRef.current?.();
      else if (isUnreachableServerError(e)) onConnectionLostRef.current?.();
      throw e;
    });
  }, []);

  const [profile, setProfile] = React.useState<InpxProfile | null>(null);
  const [bookmarkIds, setBookmarkIds] = React.useState<Set<string>>(() => new Set());
  const [readIds, setReadIds] = React.useState<Set<string>>(() => new Set());
  const [readingProgress, setReadingProgress] = React.useState<Map<string, number>>(() => new Map());
  const [favoriteAuthors, setFavoriteAuthors] = React.useState<string[]>([]);
  const [favoriteSeries, setFavoriteSeries] = React.useState<string[]>([]);
  const [favoriteAuthorItems, setFavoriteAuthorItems] = React.useState<FavoriteAuthorItem[]>([]);
  const [favoriteSeriesItems, setFavoriteSeriesItems] = React.useState<FavoriteSeriesItem[]>([]);
  const [shelves, setShelves] = React.useState<ServerShelf[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [syncStatus, setSyncStatus] = React.useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [lastSynced, setLastSynced] = React.useState<string | null>(null);

  // Request ID для защиты от гонок данных при изменении config во время запроса
  const refreshRequestId = React.useRef(0);
  /** Bumped on bookmark/read toggles so slow-path dumps don't clobber optimistic UI. */
  const collectionsMutationEpoch = React.useRef(0);

  const refresh = React.useCallback(async () => {
    if (!online) return;
    setLoading(true);
    setError('');
    setSyncStatus('syncing');

    const requestId = ++refreshRequestId.current;
    const isCurrent = () => requestId === refreshRequestId.current;

    /** Fast path: unlock Home/UI — profile + favs + shelves (no paginated ID dumps). */
    let prof: InpxProfile;
    try {
      const [profileRes, favs, shelfList, activityMeta] = await Promise.all([
        fetchProfile(config),
        fetchFavorites(config),
        fetchShelves(config),
        fetchReaderActivitySyncMeta(config),
      ]);
      if (!isCurrent()) return;

      prof = profileRes;
      setProfile(prof);
      setFavoriteAuthorItems(favs.authors);
      setFavoriteSeriesItems(favs.series);
      setFavoriteAuthors(favs.authors.map((a) => a.name));
      setFavoriteSeries(favs.series.map((s) => s.name));
      setShelves(shelfList);

      const quickProgress = new Map<string, number>();
      prof.recentBooks.forEach((book) => {
        const progress = Math.round(Number(book.readProgress) || 0);
        if (progress > 0) quickProgress.set(book.id, progress);
      });
      setReadingProgress(quickProgress);

      if (activityMeta) applyServerActivitySyncMeta(activityMeta);
      setLoading(false);
    } catch (err: unknown) {
      if (!isCurrent()) return;
      if (isAuthError(err)) {
        onAuthExpiredRef.current?.();
      } else if (isUnreachableServerError(err)) {
        onConnectionLostRef.current?.();
      }
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSyncStatus('error');
      setLoading(false);
      return;
    }

    /** Slow path: full bookmark/read/progress ID maps (can be many pages). */
    const collectionsEpoch = collectionsMutationEpoch.current;
    try {
      const [bmIds, rdIds, progressMap] = await Promise.all([
        loadAllIds(config, (p) => fetchBookmarkedBooks(config, p, 24)),
        loadAllIds(config, (p) => fetchLibraryView(config, 'read', p, 24)),
        loadReadingProgressMap(config),
      ]);
      if (!isCurrent()) return;

      if (collectionsEpoch === collectionsMutationEpoch.current) {
        setBookmarkIds(bmIds);
        setReadIds(rdIds);
        const mergedProgress = new Map(progressMap);
        prof.recentBooks.forEach((book) => {
          const progress = Math.round(Number(book.readProgress) || 0);
          if (progress > 0) mergedProgress.set(book.id, progress);
        });
        rdIds.forEach((id) => {
          if (!mergedProgress.has(id)) mergedProgress.set(id, 100);
        });
        setReadingProgress(mergedProgress);
      }
      setLastSynced(new Date().toLocaleTimeString('ru-RU'));
      setSyncStatus('success');
    } catch (err: unknown) {
      if (!isCurrent()) return;
      if (isAuthError(err)) {
        onAuthExpiredRef.current?.();
      } else if (isUnreachableServerError(err)) {
        onConnectionLostRef.current?.();
      }
      // Keep fast-path profile; only mark sync soft-failed.
      setSyncStatus('error');
      setLastSynced(new Date().toLocaleTimeString('ru-RU'));
    }
  }, [config, online]);

  React.useEffect(() => {
    if (online) void refresh();
    else {
      setProfile(null);
      setBookmarkIds(new Set());
      setReadIds(new Set());
      setReadingProgress(new Map());
      setFavoriteAuthors([]);
      setFavoriteSeries([]);
      setFavoriteAuthorItems([]);
      setFavoriteSeriesItems([]);
      setShelves([]);
    }
    return () => {
      refreshRequestId.current += 1;
    };
  }, [online, config.url, config.username, config.password, config.deviceToken, refresh]);

  const toggleBookmark = React.useCallback(async (bookId: string) => {
    if (!online) return false;
    collectionsMutationEpoch.current += 1;
    const bookmarked = await withAuthGuard(() => toggleBookBookmark(config, bookId));
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
    collectionsMutationEpoch.current += 1;
    const read = await withAuthGuard(() => toggleBookRead(config, bookId));
    void dropQueuedToggleReadOps(bookId).catch(() => {});
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
    const favorite = await withAuthGuard(() => toggleFavoriteAuthorApi(config, name));
    setFavoriteAuthors((prev) =>
      favorite ? (prev.includes(name) ? prev : [...prev, name]) : prev.filter((a) => a !== name)
    );
    setFavoriteAuthorItems((prev) => {
      if (!favorite) return prev.filter((a) => a.name !== name);
      if (prev.some((a) => a.name === name)) return prev;
      return [...prev, { name, displayName: name }];
    });
    return favorite;
  }, [config, online]);

  const toggleFavoriteSeries = React.useCallback(async (name: string) => {
    if (!online) return false;
    const favorite = await withAuthGuard(() => toggleFavoriteSeriesApi(config, name));
    setFavoriteSeries((prev) =>
      favorite ? (prev.includes(name) ? prev : [...prev, name]) : prev.filter((s) => s !== name)
    );
    setFavoriteSeriesItems((prev) => {
      if (!favorite) return prev.filter((s) => s.name !== name);
      if (prev.some((s) => s.name === name)) return prev;
      return [...prev, { name, displayName: name }];
    });
    return favorite;
  }, [config, online]);

  const addShelf = React.useCallback(async (name: string) => {
    if (!online) return null;
    const id = await withAuthGuard(() => createServerShelf(config, name));
    setShelves((prev) => {
      if (prev.some((s) => s.id === id)) return prev;
      return [...prev, { id, name, bookCount: 0, previewBookIds: [] }];
    });
    return id;
  }, [config, online]);

  const removeShelf = React.useCallback(async (shelfId: number) => {
    if (!online) return;
    refreshRequestId.current += 1;
    await withAuthGuard(() => deleteServerShelf(config, shelfId));
    setShelves((prev) => prev.filter((s) => s.id !== shelfId));
  }, [config, online]);

  const loadShelfBooks = React.useCallback(
    async (shelfId: number) => {
      if (!online) return [];
      const items = await withAuthGuard(() => fetchShelfBooks(config, shelfId));
      return items.map((b) => mapServerBook(b, config));
    },
    [config, online]
  );

  const removeFromShelf = React.useCallback(async (shelfId: number, bookId: string) => {
    if (!online) return;
    await withAuthGuard(() => removeBookFromServerShelf(config, shelfId, bookId));
    setShelves((prev) =>
      prev.map((s) => {
        if (s.id !== shelfId) return s;
        const nextCount = Math.max(0, (s.bookCount ?? 1) - 1);
        const preview = (s.previewBookIds || []).filter((id) => id !== bookId);
        return { ...s, bookCount: nextCount, previewBookIds: preview };
      }),
    );
  }, [config, online]);

  const addToShelf = React.useCallback(async (shelfId: number, bookId: string) => {
    if (!online) return;
    await withAuthGuard(() => addBookToServerShelf(config, shelfId, bookId));
    setShelves((prev) =>
      prev.map((s) => {
        if (s.id !== shelfId) return s;
        const preview = s.previewBookIds || [];
        const already = preview.includes(bookId);
        const nextPreview = [bookId, ...preview.filter((id) => id !== bookId)].slice(0, 4);
        return {
          ...s,
          bookCount: already ? s.bookCount : (s.bookCount ?? 0) + 1,
          previewBookIds: nextPreview,
        };
      }),
    );
  }, [config, online]);

  const touchReadingHistory = React.useCallback(
    async (bookId: string) => {
      if (!online) return;
      await withAuthGuard(() => recordReadingHistory(config, bookId));
    },
    [config, online, withAuthGuard],
  );

  const loadPosition = React.useCallback(
    async (bookId: string) => {
      if (!online) return null;
      return withAuthGuard(() => fetchReadingPosition(config, bookId));
    },
    [config, online, withAuthGuard],
  );

  const loadReaderData = React.useCallback(
    async (bookId: string) => {
      if (!online) return { bookmarks: [], annotations: [] };
      return withAuthGuard(async () => {
        const [bookmarks, annotations] = await Promise.all([
          fetchReaderBookmarks(config, bookId),
          fetchReaderAnnotations(config, bookId),
        ]);
        return { bookmarks, annotations };
      });
    },
    [config, online, withAuthGuard],
  );

  const addReaderBookmark = React.useCallback(
    async (bookId: string, position: string, title: string) => {
      if (!online) return null;
      return withAuthGuard(() => addReaderBookmarkApi(config, bookId, position, title));
    },
    [config, online, withAuthGuard],
  );

  const deleteReaderBookmark = React.useCallback(
    async (bookId: string, bmId: number) => {
      if (!online) return false;
      await withAuthGuard(() => deleteReaderBookmarkApi(config, bookId, bmId));
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
    [config, online, withAuthGuard],
  );

  const addAnnotation = React.useCallback(
    async (bookId: string, cfi: string, text: string, note: string, color: string) => {
      if (!online) return null;
      return withAuthGuard(() => addReaderAnnotationApi(config, bookId, cfi, text, note, color));
    },
    [config, online, withAuthGuard],
  );

  const deleteAnnotation = React.useCallback(
    async (bookId: string, aid: number) => {
      if (!online) return false;
      await withAuthGuard(() => deleteReaderAnnotationApi(config, bookId, aid));
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
    [config, online, withAuthGuard],
  );

  const patchAnnotation = React.useCallback(
    async (bookId: string, aid: number, patch: { note?: string; color?: string }) => {
      if (!online) return false;
      await withAuthGuard(() => patchReaderAnnotationApi(config, bookId, aid, patch));
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
    [config, online, withAuthGuard],
  );

  const removeReadingHistory = React.useCallback(
    async (bookId: string) => {
      if (!online) return false;
      await withAuthGuard(() => deleteReadingHistoryApi(config, bookId));
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
    [config, online, withAuthGuard],
  );

  const removeReadBook = React.useCallback(
    async (bookId: string) => {
      if (!online) return false;
      // Do not gate on readIds — the set can lag soft refresh while local UI already unmarked.
      await withAuthGuard(() => ensureBookReadState(config, bookId, false));
      void dropQueuedToggleReadOps(bookId).catch(() => {});
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
    [config, online, withAuthGuard],
  );

  const fetchSectionBooks = React.useCallback(
    async (section: 'bookmarks' | 'read' | 'continue' | 'recent' | 'recommended', page = 1): Promise<InpxBookItem[]> => {
      if (!online) return [];
      return withAuthGuard(async () => {
        if (section === 'bookmarks') {
          const res = await fetchBookmarkedBooks(config, page, 24);
          return res.items;
        }
        const res = await fetchLibraryView(config, section, page, 24);
        return res.items;
      });
    },
    [config, online, withAuthGuard],
  );

  return {
    online,
    profile,
    bookmarkIds,
    readIds,
    readingProgress,
    favoriteAuthors,
    favoriteSeries,
    favoriteAuthorItems,
    favoriteSeriesItems,
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
