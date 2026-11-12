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
  toggleWantToReadApi,
  toggleBookRead,
  ensureBookReadState,
  toggleFavoriteAuthorApi,
  setAuthorNotRecommendedApi,
  toggleFavoriteSeriesApi,
  createServerShelf,
  deleteServerShelf,
  deleteSmartShelf,
  fetchSmartShelves,
  fetchShelfBooks,
  type ServerSmartShelf,
  addBookToServerShelf,
  addBooksToServerShelf,
  removeBookFromServerShelf,
  recordReadingHistory,
  fetchReadingPosition,
  fetchReaderBookmarks,
  addReaderBookmarkApi,
  deleteReaderBookmarkApi,
  patchReaderBookmarkApi,
  fetchReaderAnnotations,
  addReaderAnnotationApi,
  deleteReaderAnnotationApi,
  patchReaderAnnotationApi,
  fetchReaderActivitySyncMeta,
  deleteReadingHistoryApi,
  mapServerBook,
  isUnreachableServerError,
  isAuthError,
  saveUserPreferences,
  setShelfOnHomeApi,
} from '../lib/inpxClient';
import { applyServerActivitySyncMeta } from '../lib/readerActivitySync';
import { sameSeriesName } from '../lib/seriesLabel';
import { setHideRead } from '../lib/hideReadPreference';
import { ensurePersonalDataOwner, isPersonalDataOwner, rememberAccount } from '../lib/accounts';
import { setDownloadFormat, setServerDownloadFormats } from '../lib/downloadFormatPreference';
import { getHomeLayout, setHomeLayout, toggleHomeSection } from '../lib/homeLayout';
import { APP_SETTING_KEYS, getHomeRecentMode, setAppSettingRaw } from '../lib/appSettings';
import { dropQueuedToggleReadOps, processSyncQueue } from '../lib/syncQueueProcessor';
import { toLocalBookId } from '../lib/bookRef';
import { activateServerBookAliases } from '../lib/serverBookAliases';
import { intlLocale } from '../i18n';

export function isServerOnline(config: ServerConfig): boolean {
  return config.connectionStatus === 'connected' && Boolean(config.url);
}

/**
 * Rows asked per request for the «all ids» dumps. Servers before 2.14 cap `/api/library/*` at 24
 * and answer 24 whatever is asked, so the loops below count what actually came back.
 */
const IDS_PAGE_SIZE = 500;
const IDS_MAX_PAGES = 2000;

async function loadAllPages<T>(
  loader: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
  onItem: (item: T) => void,
): Promise<void> {
  let loaded = 0;
  for (let page = 1; page <= IDS_MAX_PAGES; page += 1) {
    const res = await loader(page, IDS_PAGE_SIZE);
    res.items.forEach(onItem);
    loaded += res.items.length;
    if (res.items.length === 0 || loaded >= (Number(res.total) || 0)) break;
  }
}

async function loadAllIds(
  loader: (page: number, pageSize: number) => Promise<{ items: { id: string }[]; total: number }>
): Promise<Set<string>> {
  const ids = new Set<string>();
  await loadAllPages(loader, (b) => ids.add(toLocalBookId(b.id)));
  return ids;
}

async function loadReadingProgressMap(config: ServerConfig): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  await loadAllPages(
    (page, pageSize) => fetchLibraryView(config, 'continue', page, pageSize),
    (item) => {
      const progress = Math.round(Number(item.readProgress) || 0);
      if (progress > 0) map.set(toLocalBookId(item.id), progress);
    },
  );
  return map;
}

export function useInpxServer(
  config: ServerConfig,
  onConnectionLost?: () => void,
  onAuthExpired?: () => void,
) {
  const online = isServerOnline(config);
  // Before any per-book request of this render: book paths are mapped through these aliases.
  activateServerBookAliases(config.url);
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
  /** «Хочу прочитать»; stays empty on servers without `/api/library/want`. */
  const [wantIds, setWantIds] = React.useState<Set<string>>(() => new Set());
  /** True only after a successful bookmark/read id load. Empty sets before that must not filter lists. */
  const [collectionsReady, setCollectionsReady] = React.useState(false);
  const [readingProgress, setReadingProgress] = React.useState<Map<string, number>>(() => new Map());
  const [favoriteAuthors, setFavoriteAuthors] = React.useState<string[]>([]);
  const [favoriteSeries, setFavoriteSeries] = React.useState<string[]>([]);
  /** «Не рекомендовать» authors; null = the server has no such feature (button hidden). */
  const [notRecommendedAuthors, setNotRecommendedAuthors] = React.useState<string[] | null>(null);
  const [favoriteAuthorItems, setFavoriteAuthorItems] = React.useState<FavoriteAuthorItem[]>([]);
  const [favoriteSeriesItems, setFavoriteSeriesItems] = React.useState<FavoriteSeriesItem[]>([]);
  const [shelves, setShelves] = React.useState<ServerShelf[]>([]);
  const [smartShelves, setSmartShelves] = React.useState<ServerSmartShelf[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [syncStatus, setSyncStatus] = React.useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [lastSynced, setLastSynced] = React.useState<string | null>(null);

  // Request ID для защиты от гонок данных при изменении config во время запроса
  const refreshRequestId = React.useRef(0);
  /** Newer shelf-list fetch wins over an older in-flight refresh. */
  const shelfListGen = React.useRef(0);
  const lastShelfFetchAt = React.useRef(0);
  const shelfMembershipRef = React.useRef('');
  /** Everything last put into `shelves` / `smartShelves`: an unchanged poll must not re-render the app. */
  const shelfDataRef = React.useRef('');
  /** Bumped on bookmark/read toggles so slow-path dumps don't clobber optimistic UI. */
  const collectionsMutationEpoch = React.useRef(0);

  const readIdsRef = React.useRef(readIds);
  readIdsRef.current = readIds;

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
      // Another account's personal data is still on the device («Выйти» → new login): swap before any sync.
      if (!isPersonalDataOwner(config) && await ensurePersonalDataOwner(config)) return;
      void rememberAccount(config).catch(() => undefined);
      await processSyncQueue(config);
      if (!isCurrent()) return;
      const shelfGen = ++shelfListGen.current;
      lastShelfFetchAt.current = Date.now();
      const [profileRes, favs, shelfList, smartShelfList, activityMeta] = await Promise.all([
        fetchProfile(config),
        fetchFavorites(config),
        fetchShelves(config),
        fetchSmartShelves(config),
        fetchReaderActivitySyncMeta(config),
      ]);
      if (!isCurrent()) return;

      prof = profileRes;
      setProfile(prof);
      // «Скрыть прочитанное»: account switch from the server (undefined on older servers → not sent).
      setHideRead(typeof prof.user?.hideRead === 'boolean' ? prof.user.hideRead : null);
      // «Формат скачивания»: same account preference as the web profile (older servers: keep the cached one).
      if (typeof prof.user?.downloadFormat === 'string') setDownloadFormat(prof.user.downloadFormat);
      // Formats the server offers now (an admin may switch EPUB off) — the app warns instead of silently saving FB2.
      setServerDownloadFormats(prof.user?.availableDownloadFormats);
      // «Главная страница» of the account (older servers: keep the local layout).
      if (prof.user?.homeLayout !== undefined) {
        setHomeLayout(prof.user.homeLayout);
        // The old local «Новинки: Скрыть» becomes the shared hidden «Новинки» block once.
        if (getHomeRecentMode() === 'off') {
          const next = toggleHomeSection(getHomeLayout(), 'novinki', false);
          setHomeLayout(next);
          setAppSettingRaw(APP_SETTING_KEYS.homeRecent, 'on');
          window.dispatchEvent(new Event('inpx-settings'));
          void saveUserPreferences(config, { homeLayout: next }).catch(() => undefined);
        }
      }
      setFavoriteAuthorItems(favs.authors);
      setFavoriteSeriesItems(favs.series);
      setFavoriteAuthors(favs.authors.map((a) => a.name));
      setFavoriteSeries(favs.series.map((s) => s.name));
      setNotRecommendedAuthors(favs.notRecommendedAuthors);
      if (shelfGen === shelfListGen.current) {
        shelfMembershipRef.current = `${shelfList.map((s) => `${s.id}\0${s.name}\0${s.onHome ? 1 : 0}`).join('|')}#${smartShelfList.map((s) => `${s.id}\0${s.name}\0${s.onHome ? 1 : 0}`).join('|')}`;
        shelfDataRef.current = JSON.stringify([shelfList, smartShelfList]);
        setShelves(shelfList);
        setSmartShelves(smartShelfList);
      }

      const quickProgress = new Map<string, number>();
      prof.recentBooks.forEach((book) => {
        const progress = Math.round(Number(book.readProgress) || 0);
        if (progress > 0) quickProgress.set(book.id, progress);
      });
      // Add to the known map: replacing it dropped the progress of every older book until the
      // slow id dump below finished (and for good when that dump was skipped).
      setReadingProgress((prev) => {
        if (quickProgress.size === 0) return prev;
        const next = new Map(prev);
        quickProgress.forEach((pct, id) => next.set(id, pct));
        return next;
      });

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
      const [bmIds, rdIds, progressMap, wtIds] = await Promise.all([
        loadAllIds((p, size) => fetchBookmarkedBooks(config, p, size)),
        loadAllIds((p, size) => fetchLibraryView(config, 'read', p, size)),
        loadReadingProgressMap(config),
        // Older servers have no «Хочу прочитать»: a 404 here must not fail the whole sync.
        loadAllIds((p, size) => fetchLibraryView(config, 'want', p, size)).catch(() => null),
      ]);
      if (!isCurrent()) return;

      if (collectionsEpoch === collectionsMutationEpoch.current) {
        setBookmarkIds(bmIds);
        setReadIds(rdIds);
        if (wtIds) setWantIds(wtIds);
        setCollectionsReady(true);
      }
      // Progress is independent of the bookmark / read toggles that make the id sets stale.
      const mergedProgress = new Map(progressMap);
      prof.recentBooks.forEach((book) => {
        const progress = Math.round(Number(book.readProgress) || 0);
        if (progress > 0) mergedProgress.set(book.id, progress);
      });
      if (collectionsEpoch === collectionsMutationEpoch.current) {
        rdIds.forEach((id) => {
          if (!mergedProgress.has(id)) mergedProgress.set(id, 100);
        });
      }
      setReadingProgress(mergedProgress);
      setLastSynced(new Date().toLocaleTimeString(intlLocale()));
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
      setLastSynced(new Date().toLocaleTimeString(intlLocale()));
    }
  }, [config, online]);

  // URL switches between LAN and external addresses of the same library. Only a new login clears ids.
  const accountKey = `${config.username}\0${config.deviceToken}`;
  const accountKeyRef = React.useRef(accountKey);
  React.useEffect(() => {
    if (accountKeyRef.current === accountKey) return;
    accountKeyRef.current = accountKey;
    setBookmarkIds(new Set());
    setReadIds(new Set());
    setWantIds(new Set());
    setCollectionsReady(false);
    setReadingProgress(new Map());
    setLastSynced(null);
  }, [accountKey]);

  React.useEffect(() => {
    if (online) void refresh();
    else {
      setProfile(null);
      setReadingProgress(new Map());
      setFavoriteAuthors([]);
      setFavoriteSeries([]);
      setNotRecommendedAuthors(null);
      setFavoriteAuthorItems([]);
      setFavoriteSeriesItems([]);
      setShelves([]);
      setSmartShelves([]);
      setLastSynced(null);
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
              bookmarkCount: Math.max(0, p.userStats.bookmarkCount + (bookmarked ? 1 : -1)),
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
    if (read) dropWantLocally(bookId);
    return read;
  }, [config, online]);

  /**
   * Set the read mark to a wanted state. A blind toggle went the wrong way whenever the local
   * `readIds` did not match the server (right after start they are still empty).
   */
  const setRead = React.useCallback(async (bookId: string, read: boolean) => {
    if (!online) return !read;
    collectionsMutationEpoch.current += 1;
    await withAuthGuard(() => ensureBookReadState(config, bookId, read));
    void dropQueuedToggleReadOps(bookId).catch(() => {});
    const changed = readIdsRef.current.has(bookId) !== read;
    setReadIds((prev) => {
      if (prev.has(bookId) === read) return prev;
      const next = new Set(prev);
      if (read) next.add(bookId);
      else next.delete(bookId);
      return next;
    });
    setProfile((p) =>
      p && changed
        ? {
            ...p,
            userStats: {
              ...p.userStats,
              readBooksCount: Math.max(0, p.userStats.readBooksCount + (read ? 1 : -1)),
            },
          }
        : p,
    );
    if (read) dropWantLocally(bookId);
    return read;
  }, [config, online, withAuthGuard]);

  /** Server drops «Хочу прочитать» on open / mark-read; mirror it locally. */
  function dropWantLocally(bookId: string) {
    setWantIds((prev) => {
      if (!prev.has(bookId)) return prev;
      const next = new Set(prev);
      next.delete(bookId);
      return next;
    });
  }

  const toggleWant = React.useCallback(async (bookId: string) => {
    if (!online) return false;
    collectionsMutationEpoch.current += 1;
    const want = await withAuthGuard(() => toggleWantToReadApi(config, bookId));
    setWantIds((prev) => {
      const next = new Set(prev);
      if (want) next.add(bookId);
      else next.delete(bookId);
      return next;
    });
    setProfile((p) =>
      p
        ? {
            ...p,
            userStats: {
              ...p.userStats,
              wantCount: Math.max(0, (p.userStats.wantCount ?? 0) + (want ? 1 : -1)),
            },
          }
        : p
    );
    return want;
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

  const setAuthorNotRecommended = React.useCallback(async (name: string, on: boolean) => {
    if (!online) return !on;
    const excluded = await withAuthGuard(() => setAuthorNotRecommendedApi(config, name, on));
    const key = name.toLowerCase();
    setNotRecommendedAuthors((prev) => {
      const rest = (prev ?? []).filter((a) => a.toLowerCase() !== key);
      return excluded ? [...rest, name] : rest;
    });
    return excluded;
  }, [config, online]);

  const toggleFavoriteSeries = React.useCallback(async (name: string) => {
    if (!online) return false;
    const favorite = await withAuthGuard(() => toggleFavoriteSeriesApi(config, name));
    // `name` may be the book spelling («Адвокат империи») while the list holds catalog keys.
    setFavoriteSeries((prev) =>
      favorite
        ? (prev.some((s) => sameSeriesName(s, name)) ? prev : [...prev, name])
        : prev.filter((s) => !sameSeriesName(s, name))
    );
    setFavoriteSeriesItems((prev) => {
      if (!favorite) return prev.filter((s) => !sameSeriesName(s.name, name));
      if (prev.some((s) => sameSeriesName(s.name, name))) return prev;
      return [...prev, { name, displayName: name }];
    });
    return favorite;
  }, [config, online]);

  const addShelf = React.useCallback(async (name: string) => {
    if (!online) return null;
    const id = await withAuthGuard(() => createServerShelf(config, name));
    shelfListGen.current += 1;
    shelfDataRef.current = '';
    setShelves((prev) => {
      if (prev.some((s) => s.id === id)) return prev;
      return [...prev, { id, name, bookCount: 0, previewBookIds: [] }];
    });
    return id;
  }, [config, online]);

  const removeShelf = React.useCallback(async (shelfId: number) => {
    if (!online) return;
    // No refreshRequestId bump here: it orphaned a refresh in flight, which then never cleared
    // `loading`. shelfListGen below already keeps an older shelf list from coming back.
    await withAuthGuard(() => deleteServerShelf(config, shelfId));
    shelfListGen.current += 1;
    shelfDataRef.current = '';
    setShelves((prev) => prev.filter((s) => s.id !== shelfId));
  }, [config, online]);

  const removeSmartShelf = React.useCallback(async (shelfId: number) => {
    if (!online) return;
    await withAuthGuard(() => deleteSmartShelf(config, shelfId));
    shelfListGen.current += 1;
    shelfDataRef.current = '';
    setSmartShelves((prev) => prev.filter((s) => s.id !== shelfId));
  }, [config, online]);

  /** Pin / unpin on the home page; optimistic, reverted when the server refuses. */
  const setShelfOnHome = React.useCallback(async (kind: 'shelf' | 'smart', shelfId: number, on: boolean) => {
    if (!online) return false;
    const apply = (value: boolean) => {
      shelfListGen.current += 1;
      shelfDataRef.current = '';
      if (kind === 'smart') setSmartShelves((prev) => prev.map((s) => (s.id === shelfId ? { ...s, onHome: value } : s)));
      else setShelves((prev) => prev.map((s) => (s.id === shelfId ? { ...s, onHome: value } : s)));
    };
    apply(on);
    try {
      apply(await withAuthGuard(() => setShelfOnHomeApi(config, kind, shelfId, on)));
      return true;
    } catch (err) {
      apply(!on);
      throw err;
    }
  }, [config, online, withAuthGuard]);

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
    shelfDataRef.current = '';
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
    shelfDataRef.current = '';
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

  /** Several books onto a shelf (multi-select) → number of added entries. */
  const addBooksToShelf = React.useCallback(async (shelfId: number, bookIds: string[]) => {
    if (!online) return 0;
    const added = await withAuthGuard(() => addBooksToServerShelf(config, shelfId, bookIds));
    shelfDataRef.current = '';
    setShelves((prev) =>
      prev.map((s) => {
        if (s.id !== shelfId) return s;
        const preview = s.previewBookIds || [];
        return {
          ...s,
          bookCount: (s.bookCount ?? 0) + added,
          previewBookIds: [...bookIds.filter((id) => !preview.includes(id)), ...preview].slice(0, 4),
        };
      }),
    );
    return added;
  }, [config, online, withAuthGuard]);

  const touchReadingHistory = React.useCallback(
    async (bookId: string) => {
      if (!online) return;
      await withAuthGuard(() => recordReadingHistory(config, bookId));
      dropWantLocally(bookId);
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

  const patchReaderBookmark = React.useCallback(
    async (bookId: string, bmId: number, title: string) => {
      if (!online) return false;
      await withAuthGuard(() => patchReaderBookmarkApi(config, bookId, bmId, title));
      setProfile((p) =>
        p
          ? {
              ...p,
              readerBookmarks: p.readerBookmarks.map((b) =>
                b.bookId === bookId && b.id === bmId ? { ...b, label: title } : b,
              ),
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

  /** Shelves only — a deletion on the website should drop the row without a full profile reload. */
  const refreshShelves = React.useCallback(async (): Promise<boolean> => {
    if (!online) return false;
    const now = Date.now();
    if (now - lastShelfFetchAt.current < 1500) return false;
    lastShelfFetchAt.current = now;
    const gen = ++shelfListGen.current;
    try {
      const [shelfList, smartShelfList] = await withAuthGuard(() => Promise.all([
        fetchShelves(config),
        fetchSmartShelves(config),
      ]));
      if (gen !== shelfListGen.current) return false;
      const membership = `${shelfList.map((s) => `${s.id}\0${s.name}\0${s.onHome ? 1 : 0}`).join('|')}#${smartShelfList.map((s) => `${s.id}\0${s.name}\0${s.onHome ? 1 : 0}`).join('|')}`;
      const changed = membership !== shelfMembershipRef.current;
      shelfMembershipRef.current = membership;
      const data = JSON.stringify([shelfList, smartShelfList]);
      if (data !== shelfDataRef.current) {
        shelfDataRef.current = data;
        setShelves(shelfList);
        setSmartShelves(smartShelfList);
      }
      return changed;
    } catch {
      if (gen === shelfListGen.current) lastShelfFetchAt.current = 0;
      return false;
    }
  }, [config, online, withAuthGuard]);

  const fetchSectionBooks = React.useCallback(
    async (section: 'bookmarks' | 'read' | 'continue' | 'recent' | 'recommended' | 'want' | 'following', page = 1): Promise<InpxBookItem[]> => {
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
    wantIds,
    collectionsReady,
    readingProgress,
    favoriteAuthors,
    favoriteSeries,
    notRecommendedAuthors,
    favoriteAuthorItems,
    favoriteSeriesItems,
    shelves,
    smartShelves,
    loading,
    error,
    syncStatus,
    lastSynced,
    refresh,
    refreshShelves,
    toggleBookmark,
    toggleRead,
    setRead,
    toggleWant,
    toggleFavoriteAuthor,
    setAuthorNotRecommended,
    toggleFavoriteSeries,
    addShelf,
    removeShelf,
    removeSmartShelf,
    setShelfOnHome,
    loadShelfBooks,
    addToShelf,
    addBooksToShelf,
    removeFromShelf,
    touchReadingHistory,
    loadPosition,
    loadReaderData,
    addReaderBookmark,
    deleteReaderBookmark,
    patchReaderBookmark,
    addAnnotation,
    deleteAnnotation,
    patchAnnotation,
    removeReadingHistory,
    removeReadBook,
    fetchSectionBooks,
  };
}
