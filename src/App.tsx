/**
 * INPX Book Reader — главное приложение.
 *
 * 📱 Только Android (Capacitor APK).
 * 🚫 server.ts не улучшать — только для dev в браузере.
 *
 * @see AGENTS.md — контекст проекта и ограничения
 */

import React from 'react';
import MobileFrame from './components/MobileFrame';
import ProfileScreen from './components/ProfileScreen';
import HomeTab from './components/HomeTab';
import MyBooksTab from './components/MyBooksTab';
import NextInSeriesSheet from './components/NextInSeriesSheet';
import OnboardingFlow from './components/OnboardingFlow';
import BookActionsSheet, { type BookActionsTarget } from './components/BookActionsSheet';
import BookDetailsSheet from './components/catalog/BookDetailsSheet';
import DownloadQueueSheet from './components/DownloadQueueSheet';
import { CATALOG_BROWSE_ROOT } from './components/catalog/catalogTypes';
import AppShell, { type AppTab } from './components/AppShell';
import type { LibrarySeg } from './components/mybooks/LibraryCollections';
import { MissingLocalBookFallback } from './components/MissingLocalBookFallback';
import { isFolderLocalBookId } from './lib/importExternalBook';
import { BRAND_LOCKUP_SRC } from './lib/brand';
import { useInpxServer } from './hooks/useInpxServer';
import { useAppBackButton } from './hooks/useAppBackButton';
import { useAndroidLaunch } from './hooks/useAndroidLaunch';
import { useServerBranding } from './hooks/useServerBranding';
import { useServerConnection } from './hooks/useServerConnection';
import { useEinkMode } from './hooks/useEinkMode';
import { useLocalLibrary } from './hooks/useLocalLibrary';
import { useDownloadPipeline } from './hooks/useDownloadPipeline';
import { useAppSync } from './hooks/useAppSync';
import { useBookActions } from './hooks/useBookActions';
import { readPersistedShelfIdMap, setShelfRemapHandler } from './lib/syncQueueProcessor';
import { useLocalBookFileVerification } from './hooks/useLocalBookFileVerification';
import {
  ensureStorageDirectory,
  isValidStorageDirectory,
  normalizeStorageDirectory,
  readStoredStorageDirectory,
  writeStoredStorageDirectory,
  type StorageDirectory,
} from './lib/storageDirectory';
import { isAndroid, isNativeApp } from './lib/platform';
import { theme } from './lib/appTheme';
import { BookListSkeleton } from './ui/Skeleton';
import TabScreenPanel from './ui/TabScreenPanel';
import { syncAndroidStatusBar } from './lib/androidChrome';
import {
  type AppAppearance,
  type AppColorSource,
  applyAccentVars,
  applyAppThemeMode,
  applyServerPaletteVars,
  clearAccentVars,
  fetchServerUiTheme,
  readCachedServerUiTheme,
  parseAppAppearance,
  parseAppColorSource,
  resolveIsDark,
} from './lib/serverTheme';
import { fetchSystemPalettes, type SystemPalettes } from './lib/systemTheme';
import { applyCoverFallbackStyle } from './lib/coverFallbackStyle';
import { APP_SETTING_KEYS, getAppSettingString, setAppSettingRaw } from './lib/appSettings';
import { maybeAutoCheckAppUpdate } from './lib/appUpdate';
import { App as CapApp } from '@capacitor/app';
import { resolveNextInSeries, type NextInSeriesResult } from './lib/seriesNavigation';
import {
  FOLLOWING_WIDGET_MAX_BOOKS,
  isFollowingWidgetPlaced,
  syncContinueReadingWidget,
  syncFollowingWidget,
} from './lib/continueWidget';
import { useSnackbar } from './ui/Snackbar';
import {
  authHeader,
  bookContentUrl,
  coverUrl,
  displayCoverUrl,
  fetchLibraryView,
  fetchReaderActivitySyncMeta,
  mapServerBook,
  saveUserPreferences,
  type UiShelf,
} from './lib/inpxClient';
import { recentRemovedOnServer, withoutFinishedReading } from './lib/localReadingProgress';
import { clearOfflineReadingHistory } from './lib/offlineReaderStore';
import { warmCoverCache } from './lib/coverCache';
import { isBookDownloadInFlight, resolveBookPrimaryAction } from './lib/bookOpenPolicy';
import type { Book, Shelf } from './types';

import FoliateReader from './components/FoliateReader';
import { getHomeLayout, orderShelves, reorderShelfGroup, setHomeLayout, shelfOrderKey, useHomeLayout } from './lib/homeLayout';

const CatalogTab = React.lazy(() => import('./components/CatalogTab'));

function sameNames(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

function mergeLocalShelves(
  local: Shelf[],
  server: Array<{ id: number; name: string; previewBookIds?: string[] }>,
): Shelf[] {
  const used = new Set<string>();
  const next: Shelf[] = [];
  for (const shelf of server) {
    const id = String(shelf.id);
    const existing = local.find((item) => item.id === id);
    if (existing) {
      used.add(existing.id);
      next.push({
        id,
        name: shelf.name,
        bookIds: existing.bookIds,
      });
      continue;
    }
    next.push({ id, name: shelf.name, bookIds: [...(shelf.previewBookIds || [])] });
  }
  for (const item of local) {
    if (!used.has(item.id) && item.id.startsWith('shelf_')) next.push(item);
  }
  return next;
}

function shelvesEqual(a: Shelf[], b: Shelf[]): boolean {
  return a.length === b.length && a.every((shelf, i) => {
    const other = b[i];
    return other
      && shelf.id === other.id
      && shelf.name === other.name
      && shelf.bookIds.join('\0') === other.bookIds.join('\0');
  });
}

export default function App() {
  const snackbar = useSnackbar();
  const [activeTab, setActiveTab] = React.useState<AppTab>('home');
  const [nextSeriesResult, setNextSeriesResult] = React.useState<NextInSeriesResult | null>(null);
  const [readerNextInSeries, setReaderNextInSeries] = React.useState<{
    bookId: string;
    title: string;
  } | null>(null);
  const readerNextBookRef = React.useRef<Book | null>(null);
  const nextSeriesDismissedRef = React.useRef<Set<string>>(new Set());
  const nextSeriesGenRef = React.useRef(0);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [actionsTarget, setActionsTarget] = React.useState<BookActionsTarget | null>(null);
  const [queueSheetOpen, setQueueSheetOpen] = React.useState(false);
  const openSavedBookRef = React.useRef<(book: Book) => void>(() => {});

  const library = useLocalLibrary();
  const {
    ready: libraryReady,
    books: downloadedBooks,
    setBooks: setDownloadedBooks,
    progressList,
    setProgressList,
    setBookmarks,
    setHighlights,
    shelves: localShelves,
    setShelves,
    favoriteAuthors,
    setFavoriteAuthors,
    favoriteSeries,
    setFavoriteSeries,
    bootError,
    retryBoot,
  } = library;

  const [catalogSubTab, setCatalogSubTab] = React.useState<'books' | 'authors' | 'series' | 'genres'>(CATALOG_BROWSE_ROOT);
  const [catalogSelectedAuthor, setCatalogSelectedAuthor] = React.useState<string | null>(null);
  const [catalogSelectedSeries, setCatalogSelectedSeries] = React.useState<string | null>(null);
  const [catalogSelectedSubgenre, setCatalogSelectedSubgenre] = React.useState<{ parent: string; name: string } | null>(null);
  const [catalogReturnTo, setCatalogReturnTo] = React.useState<AppTab | null>(null);
  /** Home search → catalog results. Applied even if CatalogTab mounts after the nav epoch bump. */
  const [catalogPendingSearch, setCatalogPendingSearch] = React.useState<string | null>(null);
  /** Bumped on external catalog deep-links so CatalogTab resets search. */
  const [catalogNavEpoch, setCatalogNavEpoch] = React.useState(0);
  /** Bumped on Home tab re-tap — close «Показать всё» lists. */
  const [homeRootEpoch, setHomeRootEpoch] = React.useState(0);
  /** Bumped on Library tab re-tap — close overlays / shelf / back to root segment. */
  const [libraryRootEpoch, setLibraryRootEpoch] = React.useState(0);
  /** Bumped on Profile tab re-tap — back to the settings section list. */
  const [profileRootEpoch, setProfileRootEpoch] = React.useState(0);
  /** Profile stat tile → open this «Мои книги» collection. */
  const [libraryOpenRequest, setLibraryOpenRequest] = React.useState<{ seg: LibrarySeg; n: number } | null>(null);
  /** Bumped when the header status icon opens connection settings. */
  const [connectionFocusEpoch, setConnectionFocusEpoch] = React.useState(0);
  /** Bumped by «Обновить» in the new-version snackbar — scroll Profile to the update block. */
  const [updateFocusEpoch, setUpdateFocusEpoch] = React.useState(0);
  const readerOriginTabRef = React.useRef<AppTab>('home');

  const { resetExitPrompt } = useAppBackButton(() => snackbar.show('Ещё раз для выхода', undefined, 'default', 4000));
  // Смена вкладки между двумя Back отменяет окно «ещё раз для выхода».
  React.useEffect(() => {
    resetExitPrompt();
  }, [activeTab, resetExitPrompt]);

  const clearCatalogDrilldown = React.useCallback(() => {
    setCatalogSelectedAuthor(null);
    setCatalogSelectedSeries(null);
    setCatalogSelectedSubgenre(null);
  }, []);

  const handleNavigateToCatalog = React.useCallback((
    subTab: 'books' | 'authors' | 'series' | 'genres',
    author: string | null = null,
    series: string | null = null,
    returnTo: AppTab | null = null,
  ) => {
    setCatalogPendingSearch(null);
    setActiveTab('catalog');
    setCatalogSubTab(subTab);
    setCatalogSelectedAuthor(author);
    setCatalogSelectedSeries(series);
    setCatalogSelectedSubgenre(null);
    // Returning to "catalog" while already there is a no-op trap — only cross-tab returns.
    setCatalogReturnTo(returnTo && returnTo !== 'catalog' ? returnTo : null);
    setCatalogNavEpoch((n) => n + 1);
  }, []);

  const handleOpenCatalogRoot = React.useCallback(() => {
    setCatalogPendingSearch(null);
    setCatalogReturnTo(null);
    clearCatalogDrilldown();
    setCatalogSubTab(CATALOG_BROWSE_ROOT);
    setCatalogNavEpoch((n) => n + 1);
    setActiveTab('catalog');
  }, [clearCatalogDrilldown]);

  const handleCompleteCatalogReturn = React.useCallback(() => {
    const target = catalogReturnTo ?? 'home';
    setCatalogPendingSearch(null);
    setCatalogReturnTo(null);
    clearCatalogDrilldown();
    setCatalogSubTab(CATALOG_BROWSE_ROOT);
    setCatalogNavEpoch((n) => n + 1);
    setActiveTab(target);
  }, [catalogReturnTo, clearCatalogDrilldown]);

  const handleHomeSearchSubmit = React.useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    setCatalogPendingSearch(q);
    clearCatalogDrilldown();
    setCatalogSubTab('books');
    setCatalogReturnTo(activeTab === 'catalog' ? null : activeTab);
    setCatalogNavEpoch((n) => n + 1);
    setActiveTab('catalog');
  }, [activeTab, clearCatalogDrilldown]);

  /** Read-aloud widget: start read-aloud in this book once the reader shows it. */
  const [ttsAutostart, setTtsAutostart] = React.useState<{ bookId: string; token: number } | null>(null);

  const handleTabChange = React.useCallback((tab: AppTab) => {
    // Leaving Catalog abandons drill-down/return stack so re-entry is a clean root.
    if (tab !== 'catalog') {
      setCatalogPendingSearch(null);
      setCatalogReturnTo(null);
      clearCatalogDrilldown();
      setCatalogSubTab(CATALOG_BROWSE_ROOT);
    } else {
      setCatalogReturnTo(null);
    }

    // Re-tap active tab → pop nested UI back to that tab's root (like system Back peel).
    if (tab === activeTab) {
      if (tab === 'home') {
        setHomeRootEpoch((n) => n + 1);
      } else if (tab === 'library') {
        setLibraryRootEpoch((n) => n + 1);
      } else if (tab === 'profile') {
        setProfileRootEpoch((n) => n + 1);
      } else if (tab === 'catalog') {
        setCatalogPendingSearch(null);
        setCatalogReturnTo(null);
        clearCatalogDrilldown();
        setCatalogSubTab(CATALOG_BROWSE_ROOT);
        setCatalogNavEpoch((n) => n + 1);
      }
    }

    setActiveTab(tab);
  }, [activeTab, clearCatalogDrilldown]);

  const handleOpenConnectionSettings = React.useCallback(() => {
    handleTabChange('profile');
    setConnectionFocusEpoch((n) => n + 1);
  }, [handleTabChange]);

  const [appearance, setAppearance] = React.useState<AppAppearance>(
    () => parseAppAppearance(getAppSettingString(APP_SETTING_KEYS.theme)),
  );
  const [colorSource, setColorSource] = React.useState<AppColorSource>(
    () => parseAppColorSource(getAppSettingString(APP_SETTING_KEYS.themeColor)),
  );
  const [serverUiTheme, setServerUiTheme] = React.useState<Awaited<ReturnType<typeof fetchServerUiTheme>>>(null);
  const [storageDirectory, setStorageDirectoryState] = React.useState<StorageDirectory | null>(null);
  const [storageDirectoryReady, setStorageDirectoryReady] = React.useState(() => !isAndroid());

  const setStorageDirectory = React.useCallback((directory: StorageDirectory | null) => {
    const normalized = directory ? normalizeStorageDirectory(directory) ?? directory : null;
    setStorageDirectoryState(normalized);
  }, []);

  const {
    serverConfig,
    serverConfigReady,
    connectionError,
    setConnectionError,
    markServerDisconnected,
    markAuthExpired,
    handleServerConfigChange,
    handleTestConnection,
    applyPairingLogin,
    isVerifyingConnection,
  } = useServerConnection();

  const inpxServer = useInpxServer(serverConfig, markServerDisconnected, markAuthExpired);
  const isOnline = inpxServer.online;
  const canReadOnline = isOnline;

  React.useEffect(() => {
    setShelfRemapHandler((localId, serverId) => {
      setShelves((prev) => prev.map((shelf) => (
        shelf.id === localId ? { ...shelf, id: serverId } : shelf
      )));
    });
    return () => setShelfRemapHandler(null);
  }, [setShelves]);

  React.useEffect(() => {
    if (!libraryReady) return;
    const map = readPersistedShelfIdMap();
    if (map.size === 0) return;
    setShelves((prev) => {
      let changed = false;
      const next = prev.map((shelf) => {
        const serverId = map.get(shelf.id);
        if (serverId == null) return shelf;
        changed = true;
        return { ...shelf, id: String(serverId) };
      });
      return changed ? next : prev;
    });
  }, [libraryReady, setShelves]);

  React.useEffect(() => {
    if (!bootError) return;
    snackbar.show(
      'Не удалось открыть локальную библиотеку',
      { label: 'Повторить', onClick: retryBoot },
      'error',
    );
  }, [bootError, retryBoot, snackbar]);

  React.useEffect(() => {
    if (!isOnline || !inpxServer.lastSynced) return;
    setFavoriteAuthors((prev) => (
      sameNames(prev, inpxServer.favoriteAuthors) ? prev : inpxServer.favoriteAuthors
    ));
    setFavoriteSeries((prev) => (
      sameNames(prev, inpxServer.favoriteSeries) ? prev : inpxServer.favoriteSeries
    ));
    setShelves((prev) => {
      const next = mergeLocalShelves(prev, inpxServer.shelves);
      return shelvesEqual(prev, next) ? prev : next;
    });
  }, [
    isOnline,
    inpxServer.lastSynced,
    inpxServer.favoriteAuthors,
    inpxServer.favoriteSeries,
    inpxServer.shelves,
    setFavoriteAuthors,
    setFavoriteSeries,
    setShelves,
  ]);

  const [homeShelvesEpoch, setHomeShelvesEpoch] = React.useState(0);
  React.useEffect(() => {
    if (!isOnline) return;
    if (activeTab !== 'home' && activeTab !== 'library') return;
    let timer = 0;
    const pull = () => {
      if (document.visibilityState === 'hidden') return;
      void inpxServer.refreshShelves().then((updated) => {
        if (updated) setHomeShelvesEpoch((n) => n + 1);
      });
    };
    document.addEventListener('visibilitychange', pull);
    window.addEventListener('focus', pull);
    pull();
    timer = window.setInterval(pull, 8000);
    return () => {
      document.removeEventListener('visibilitychange', pull);
      window.removeEventListener('focus', pull);
      window.clearInterval(timer);
    };
  }, [isOnline, activeTab, inpxServer.refreshShelves]);
  const { siteName, logoSrc } = useServerBranding(serverConfig);

  const appBootReady = serverConfigReady && libraryReady && storageDirectoryReady;

  React.useEffect(() => {
    if (appBootReady) {
      (window as Window & { __INPX_APP_READY__?: boolean }).__INPX_APP_READY__ = true;
    }
  }, [appBootReady]);

  React.useEffect(() => {
    if (!libraryReady) return;
    const read = () => {
      setAppearance(parseAppAppearance(getAppSettingString(APP_SETTING_KEYS.theme)));
      setColorSource(parseAppColorSource(getAppSettingString(APP_SETTING_KEYS.themeColor)));
    };
    read();
    // Settings restored from a backup.
    window.addEventListener('inpx-settings', read);
    return () => window.removeEventListener('inpx-settings', read);
  }, [libraryReady]);

  React.useEffect(() => {
    if (!libraryReady) return;
    setAppSettingRaw(APP_SETTING_KEYS.themeColor, colorSource);
    setAppSettingRaw(APP_SETTING_KEYS.theme, appearance);
  }, [appearance, colorSource, libraryReady]);

  React.useEffect(() => {
    if (!libraryReady) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!isAndroid()) {
          setStorageDirectoryReady(true);
          return;
        }
        const stored = normalizeStorageDirectory(readStoredStorageDirectory());
        const resolved = normalizeStorageDirectory(await ensureStorageDirectory(stored));
        if (cancelled) return;
        if (resolved) {
          setStorageDirectory(resolved);
          writeStoredStorageDirectory(resolved);
        }
      } catch (err) {
        console.warn('[App] storage directory init failed:', err);
      } finally {
        if (!cancelled) setStorageDirectoryReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [libraryReady]);

  React.useLayoutEffect(() => {
    if (!libraryReady) return;
    setServerUiTheme((prev) => prev ?? readCachedServerUiTheme());
  }, [libraryReady]);

  React.useEffect(() => {
    let cancelled = false;
    void fetchServerUiTheme(serverConfig)
      .then((theme) => {
        if (cancelled) return;
        setServerUiTheme((prev) => theme ?? prev ?? readCachedServerUiTheme());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [serverConfig.connectionStatus, serverConfig.url]);

  // The site's placeholder cover (image, title colour…) follows the library like its branding.
  React.useEffect(() => {
    applyCoverFallbackStyle(serverUiTheme?.coverFallback ?? null);
  }, [serverUiTheme]);

  React.useEffect(() => {
    if (!libraryReady || !storageDirectoryReady) return;
    if (isValidStorageDirectory(storageDirectory)) {
      writeStoredStorageDirectory(storageDirectory);
    }
  }, [libraryReady, storageDirectoryReady, storageDirectory]);

  const downloadedCoverIds = React.useMemo(
    () =>
      downloadedBooks
        .filter((b) => Boolean(b.localFileName?.trim()))
        .map((b) => b.id)
        .filter(Boolean),
    [downloadedBooks],
  );

  // Prefill IndexedDB cover cache for on-device books (offline covers after first warm).
  React.useEffect(() => {
    if (!libraryReady || !storageDirectoryReady || !downloadedCoverIds.length) return;
    let cancelled = false;
    void warmCoverCache({
      bookIds: downloadedCoverIds,
      localBooks: downloadedBooks.filter((b) => b.localFileName?.trim()),
      directory: storageDirectory,
      config: isOnline ? serverConfig : null,
      concurrency: 2,
      shouldContinue: () => !cancelled,
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
    // serverConfig object identity changes often — only reconnect / url matter for fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional narrow deps
  }, [
    libraryReady,
    storageDirectoryReady,
    storageDirectory?.uri,
    isOnline,
    serverConfig.connectionStatus,
    serverConfig.url,
    downloadedCoverIds,
  ]);

  const profile = isOnline ? inpxServer.profile : null;
  // Never block Home on connection check — local recent is ready after library boot.
  // inpxServer.loading clears after fast profile fetch; heavy ID maps run in background.
  const profileLoading = isOnline ? inpxServer.loading : false;
  const profileError = isOnline ? inpxServer.error : '';
  const activeFavoriteAuthors = isOnline ? inpxServer.favoriteAuthors : favoriteAuthors;
  const activeFavoriteSeries = isOnline ? inpxServer.favoriteSeries : favoriteSeries;

  const [systemPalettes, setSystemPalettes] = React.useState<SystemPalettes | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void fetchSystemPalettes().then((p) => {
      if (!cancelled) setSystemPalettes(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [autoThemeTick, setAutoThemeTick] = React.useState(0);
  const isAppDark = React.useMemo(
    () => resolveIsDark(appearance),
    [appearance, autoThemeTick],
  );

  React.useEffect(() => {
    if (appearance !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setAutoThemeTick((t) => t + 1);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [appearance]);

  const {
    pref: einkModePref,
    setPref: setEinkModePref,
    active: einkActive,
    detected: einkDetected,
  } = useEinkMode(libraryReady);

  React.useLayoutEffect(() => {
    clearAccentVars();
    if (einkActive) {
      // E-ink palette comes from html[data-eink="1"] CSS; keep stored color theme intact.
      document.documentElement.dataset.theme = 'light';
      void syncAndroidStatusBar(false, { eink: true });
      return;
    }
    applyAppThemeMode(isAppDark);
    // «Сервер» takes the library's whole palette (as on the web); «Система» lends only the
    // Material You accent; «Приложение» keeps index.css as is.
    let statusBarBg: string | undefined;
    if (colorSource === 'library') {
      const palette = isAppDark ? serverUiTheme?.paletteDark : serverUiTheme?.paletteLight;
      if (palette) statusBarBg = applyServerPaletteVars(palette, isAppDark) || undefined;
    } else if (colorSource === 'system' && systemPalettes) {
      applyAccentVars(isAppDark ? systemPalettes.dark : systemPalettes.light, isAppDark);
    }
    void syncAndroidStatusBar(isAppDark, { eink: false, bg: statusBarBg });
  }, [isAppDark, appearance, colorSource, serverUiTheme, einkActive, systemPalettes]);

  const { enqueueDownload, downloadingId, queuedBookIds } = useDownloadPipeline({
    serverConfig,
    storageDirectory,
    canReadOnline,
    setDownloadedBooks,
    onAuthExpired: markAuthExpired,
    onOpenSaved: (book) => openSavedBookRef.current(book),
  });

  const bookActions = useBookActions({
    downloadedBooks,
    setDownloadedBooks,
    progressList,
    setProgressList,
    setBookmarks,
    setHighlights,
    setShelves,
    setFavoriteAuthors,
    setFavoriteSeries,
    storageDirectory,
    onStorageDirectoryResolved: setStorageDirectory,
    serverConfig,
    canReadOnline,
    isOnline,
    inpxServer,
    profile,
    onAuthExpired: markAuthExpired,
    onConnectionLost: markServerDisconnected,
  });

  const {
    activeReader,
    closeReader,
    downloadPromptBook,
    setDownloadPromptBook,
    openBookDetails,
    downloadPromptError,
    setDownloadPromptError,
    downloadedBookIdsWithFile,
    downloadedBooksWithFile,
    readingProgressByBookId,
    localRecentReading,
    localReaderAnnotations,
    localReaderBookmarks,
    bumpReaderLocal,
    handleOpenBookCard,
    handleContinueBook,
    handleOpenBookAtPosition,
    handleRemoveBook,
    handleRemoveReadingHistory,
    handleRemoveBooks,
    handleAddShelf,
    handleAddBookToShelf,
    handleAddBooksToShelf,
    handleToggleFavoriteAuthor,
    handleToggleFavoriteSeries,
    handleToggleBookBookmark,
    handleToggleWant,
    handleToggleReadStatus,
    handleRemoveBookFromShelf,
    handleRemoveShelfConfirmed,
    handleRemoveReaderAnnotation,
    handleUpdateReaderAnnotation,
    handleRemoveReaderBookmark,
    handleUpdateReaderBookmark,
    registerDownloadedBook,
  } = bookActions;

  const handleConsumePendingSearch = React.useCallback(() => {
    setCatalogPendingSearch(null);
  }, []);

  useAndroidLaunch({
    ready: serverConfigReady && libraryReady && storageDirectoryReady,
    serverConfig,
    storageDirectory,
    localRecentReading,
    downloadedBooks,
    onContinueBook: handleContinueBook,
    onOpenBook: handleOpenBookCard,
    onRegisterImportedBook: registerDownloadedBook,
    onTabChange: handleTabChange,
    // Widget taps that lead elsewhere leave an open book first.
    onOpenScreen: (tab) => {
      if (activeReaderRef.current) void handleCloseReader();
      handleTabChange(tab);
    },
    onOpenBookDetails: (book) => {
      if (activeReaderRef.current) void handleCloseReader();
      openBookDetailsExclusive({
        id: book.id,
        title: book.title,
        author: book.author,
        ext: book.ext || 'fb2',
        coverUrl: displayCoverUrl(serverConfig, book.id),
        contentUrl: bookContentUrl(serverConfig, book.id),
      });
    },
    onRequestTtsAutostart: (bookId) => setTtsAutostart({ bookId, token: Date.now() }),
  });

  const handleDownloadBookFromUi = React.useCallback(
    async (book: Parameters<typeof enqueueDownload>[0]) => {
      setDownloadPromptError(null);
      try {
        await enqueueDownload(book);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Не удалось скачать книгу';
        setDownloadPromptError(msg);
        snackbar.show(msg, undefined, 'error');
        throw err;
      }
    },
    [enqueueDownload, setDownloadPromptError, snackbar],
  );

  const handleBookPrimaryAction = React.useCallback((book: Book) => {
    setActionsTarget(null);
    setQueueSheetOpen(false);
    setDownloadPromptBook(null);
    setDownloadPromptError(null);
    const hasFile = downloadedBookIdsWithFile.includes(book.id);
    const isDownloading = isBookDownloadInFlight(book.id, downloadingId, queuedBookIds);
    const progress = readingProgressByBookId[book.id] ?? book.readProgress ?? 0;
    const action = resolveBookPrimaryAction({
      hasFile,
      isDownloading,
      progress,
      isRead: inpxServer.readIds?.has(book.id),
    });
    if (action.kind === 'downloading') return;
    if (action.kind === 'download') {
      if (!canReadOnline) {
        snackbar.show('Нет связи — скачивание недоступно', undefined, 'error');
        return;
      }
      void handleDownloadBookFromUi(book).catch(() => {});
      return;
    }
    void handleContinueBook(book);
  }, [
    canReadOnline,
    downloadedBookIdsWithFile,
    downloadingId,
    handleContinueBook,
    handleDownloadBookFromUi,
    inpxServer.readIds,
    queuedBookIds,
    readingProgressByBookId,
    setDownloadPromptBook,
    setDownloadPromptError,
    snackbar,
  ]);
  openSavedBookRef.current = handleBookPrimaryAction;

  const openQueueSheet = React.useCallback(() => {
    setActionsTarget(null);
    setDownloadPromptBook(null);
    setDownloadPromptError(null);
    setQueueSheetOpen(true);
  }, [setDownloadPromptBook, setDownloadPromptError]);

  const openBookDetailsExclusive = React.useCallback((book: Book) => {
    setActionsTarget(null);
    setQueueSheetOpen(false);
    openBookDetails(book);
  }, [openBookDetails]);

  const openBookActions = React.useCallback((
    book: Book,
    context?: { shelfId?: number | string; shelfName?: string; fromDetails?: boolean; fromReading?: boolean },
  ) => {
    // From the book page the sheet opens on top of it; closing returns to the page.
    if (!context?.fromDetails) {
      setDownloadPromptBook(null);
      setDownloadPromptError(null);
    }
    setQueueSheetOpen(false);
    setActionsTarget({
      book,
      shelfId: context?.shelfId,
      shelfName: context?.shelfName,
      fromDetails: context?.fromDetails,
      fromReading: context?.fromReading,
    });
  }, [setDownloadPromptBook, setDownloadPromptError]);

  const handleHomeSearchBook = React.useCallback((row: {
    id: string;
    title: string;
    authors?: string;
    authorsDisplay?: string;
  }) => {
    handleBookPrimaryAction({
      id: row.id,
      title: row.title,
      author: row.authorsDisplay || row.authors || '',
      ext: 'fb2',
      coverUrl: displayCoverUrl(serverConfig, row.id),
      contentUrl: bookContentUrl(serverConfig, row.id),
    });
  }, [handleBookPrimaryAction, serverConfig]);

  const bookMarkedRead = (bookId: string) => {
    const pct = readingProgressByBookId[bookId] ?? 0;
    if (isOnline) return Boolean(inpxServer.readIds?.has(bookId));
    if (pct >= 99) return true;
    if (pct > 0) return false;
    return Boolean(inpxServer.readIds?.has(bookId));
  };

  const uiShelves = React.useMemo(() => {
    const localPending = localShelves
      .filter((shelf) => shelf.id.startsWith('shelf_'))
      .map((shelf) => ({
        id: shelf.id,
        name: shelf.name,
        bookCount: shelf.bookIds.length,
        previewBookIds: shelf.bookIds.slice(0, 4),
      }));
    if (!isOnline) {
      return localShelves.map((shelf) => ({
        id: shelf.id,
        name: shelf.name,
        bookCount: shelf.bookIds.length,
        previewBookIds: shelf.bookIds.slice(0, 4),
      }));
    }
    const serverIds = new Set(inpxServer.shelves.map((shelf) => String(shelf.id)));
    return [
      ...inpxServer.shelves,
      ...localPending.filter((shelf) => !serverIds.has(String(shelf.id))),
    ];
  }, [isOnline, inpxServer.shelves, localShelves]);

  const homeLayout = useHomeLayout();
  /** In the account order (drag in «Мои книги», `homeLayout.shelfOrder`, shared with the web). */
  const libraryShelves = React.useMemo(() => {
    const ordered = <T extends { id: number | string; kind?: 'shelf' | 'smart' }>(list: T[]) =>
      orderShelves(list.map((shelf) => ({ key: shelfOrderKey(shelf), shelf })), homeLayout.shelfOrder).map((x) => x.shelf);
    const regular = ordered(uiShelves.map((shelf) => ({ ...shelf, kind: 'shelf' as const })));
    if (!isOnline) return regular;
    const smart = inpxServer.smartShelves.map((shelf) => ({
      id: shelf.id,
      name: shelf.name,
      kind: 'smart' as const,
      bookCount: shelf.bookCount,
      previewBookIds: shelf.previewBookIds,
      onHome: shelf.onHome,
    }));
    return [...regular, ...ordered(smart)];
  }, [isOnline, uiShelves, inpxServer.smartShelves, homeLayout.shelfOrder]);

  /** Drag in a shelves list: new order of one kind → `homeLayout.shelfOrder` (the home page follows it). */
  const handleReorderShelves = React.useCallback(
    (groupKeys: string[]) => {
      const current = getHomeLayout();
      // The mixed order of both kinds (as on the server), not «regular, then smart» of the grouped lists.
      const allKeys = orderShelves(
        libraryShelves.filter((s) => typeof s.id === 'number').map((s) => ({ key: shelfOrderKey(s) })),
        current.shelfOrder,
      ).map((x) => x.key);
      const next = reorderShelfGroup(current, allKeys, groupKeys);
      if (next === current) return;
      setHomeLayout(next);
      void saveUserPreferences(serverConfig, { homeLayout: next }).catch(() => {
        setHomeLayout(current);
        snackbar.show('Не удалось сохранить порядок полок на сервере', undefined, 'error');
      });
    },
    [libraryShelves, serverConfig, snackbar],
  );

  /** Pin / unpin a shelf on the home page (Мои книги, home shelf header). */
  const handleSetShelfOnHome = React.useCallback(
    async (kind: 'shelf' | 'smart', shelfId: number, on: boolean) => {
      try {
        await inpxServer.setShelfOnHome(kind, shelfId, on);
        setHomeShelvesEpoch((n) => n + 1);
        snackbar.show(on ? 'Полка будет на главной' : 'Полка убрана с главной');
      } catch {
        snackbar.show('Не удалось изменить полку на сервере', undefined, 'error');
      }
    },
    [inpxServer.setShelfOnHome, snackbar],
  );
  const handleToggleShelfHome = React.useCallback(
    (shelf: UiShelf) => {
      if (typeof shelf.id !== 'number') return;
      void handleSetShelfOnHome(shelf.kind === 'smart' ? 'smart' : 'shelf', shelf.id, !shelf.onHome);
    },
    [handleSetShelfOnHome],
  );

  const handleAddBookToShelfFromUi = React.useCallback(
    async (bookId: string, shelfId: number | string) => {
      const added = await handleAddBookToShelf(bookId, String(shelfId));
      if (added) snackbar.show('Добавлено на полку', undefined, 'success');
    },
    [handleAddBookToShelf, snackbar],
  );

  useLocalBookFileVerification({
    enabled: libraryReady && storageDirectoryReady,
    downloadedBooks,
    setDownloadedBooks,
    storageDirectory,
    onStorageDirectoryResolved: setStorageDirectory,
    activeTab,
    canDownloadOnline: canReadOnline,
    onPromptRedownload: (book) => {
      void handleDownloadBookFromUi(book).catch(() => {});
    },
  });

  const handleOpenAuthorFromBook = React.useCallback(
    (name: string) => {
      setDownloadPromptBook(null);
      if (activeTab === 'catalog') {
        // Stay inside catalog stack — same as CatalogTab.openAuthorPage (+ epoch clears filters).
        setCatalogSelectedAuthor(name);
        setCatalogSelectedSeries(null);
        setCatalogSelectedSubgenre(null);
        setCatalogNavEpoch((n) => n + 1);
        return;
      }
      handleNavigateToCatalog(CATALOG_BROWSE_ROOT, name, null, activeTab);
    },
    [activeTab, handleNavigateToCatalog, setDownloadPromptBook],
  );

  const handleOpenGenreFromBook = React.useCallback(
    (code: string) => {
      const genre = code.trim();
      if (!genre) return;
      setDownloadPromptBook(null);
      setCatalogPendingSearch(null);
      setCatalogSelectedAuthor(null);
      setCatalogSelectedSeries(null);
      setCatalogSelectedSubgenre({ parent: '', name: genre });
      setCatalogSubTab(CATALOG_BROWSE_ROOT);
      setCatalogReturnTo(activeTab !== 'catalog' ? activeTab : null);
      setCatalogNavEpoch((n) => n + 1);
      setActiveTab('catalog');
    },
    [activeTab, setDownloadPromptBook],
  );

  const handleOpenSeriesFromBook = React.useCallback(
    (name: string) => {
      setDownloadPromptBook(null);
      if (activeTab === 'catalog') {
        // Match CatalogTab.openSeriesPage: keep author + reset filters via epoch.
        setCatalogSelectedSeries(name);
        setCatalogSelectedSubgenre(null);
        setCatalogNavEpoch((n) => n + 1);
        return;
      }
      handleNavigateToCatalog(CATALOG_BROWSE_ROOT, null, name, activeTab);
    },
    [activeTab, handleNavigateToCatalog, setDownloadPromptBook],
  );

  const handleOpenAuthorFromProfile = React.useCallback(
    (name: string) => handleNavigateToCatalog(CATALOG_BROWSE_ROOT, name, null, 'library'),
    [handleNavigateToCatalog],
  );

  const handleOpenSeriesFromProfile = React.useCallback(
    (name: string) => handleNavigateToCatalog(CATALOG_BROWSE_ROOT, null, name, 'library'),
    [handleNavigateToCatalog],
  );

  const activeReaderRef = React.useRef(activeReader);
  activeReaderRef.current = activeReader;

  // Opening the reader must not leave competing overlays/back-handlers alive.
  React.useEffect(() => {
    if (!activeReader) return;
    nextSeriesGenRef.current += 1;
    readerOriginTabRef.current = activeTab;
    setDownloadPromptBook(null);
    setDownloadPromptError(null);
    setActionsTarget(null);
    setNextSeriesResult(null);
    // Capture the tab at open time only (not on later tab changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeTab intentionally read once per open
  }, [activeReader, setDownloadPromptBook, setDownloadPromptError]);

  const resolvedReaderFile = React.useMemo(() => {
    if (!activeReader) return null;
    const embedded = activeReader.localFile;
    if (embedded?.storageUri?.trim() && embedded?.localFileName?.trim()) {
      return { storageUri: embedded.storageUri, localFileName: embedded.localFileName };
    }
    const book = downloadedBooks.find((b) => b.id === activeReader.bookId);
    if (book?.localFileName?.trim() && storageDirectory?.uri) {
      return { storageUri: storageDirectory.uri, localFileName: book.localFileName };
    }
    return null;
  }, [activeReader, downloadedBooks, storageDirectory?.uri]);

  const { requestSyncAfterClose, setClosingBookId } = useAppSync({
    canReadOnline,
    serverConfig,
    connectionStatus: serverConfig.connectionStatus,
    downloadedBooksWithFile,
    inpxServer,
    activeReaderRef,
    onReaderStoreSynced: bumpReaderLocal,
    onAuthExpired: markAuthExpired,
  });

  const handleCloseReader = React.useCallback(async () => {
    const closingId = activeReaderRef.current?.bookId ?? null;
    if (closingId) setClosingBookId(closingId);
    try {
      const closed = await closeReader();
      setClosingBookId(null);
      if (closed && isOnline) {
        requestSyncAfterClose();
      }
      if (!closed || !isOnline) return;
      const { bookId, progress } = closed;
      if (nextSeriesDismissedRef.current.has(bookId)) return;
      const markedRead = progress >= 99;
      if (!markedRead) return;
      const seriesGen = ++nextSeriesGenRef.current;
      try {
        const readIds = new Set(inpxServer.readIds ?? []);
        readIds.add(bookId);
        const next = await resolveNextInSeries(serverConfig, bookId, readIds, {
          treatCurrentAsRead: true,
        });
        if (seriesGen !== nextSeriesGenRef.current) return;
        if (activeReaderRef.current) return;
        if (next) setNextSeriesResult(next);
      } catch {
        /* ignore */
      }
    } finally {
      setClosingBookId(null);
    }
  }, [closeReader, inpxServer.readIds, isOnline, requestSyncAfterClose, serverConfig, setClosingBookId]);

  const handleNextSeriesContinue = React.useCallback(
    (book: Book) => {
      void handleContinueBook(book);
    },
    [handleContinueBook],
  );

  React.useEffect(() => {
    const hero = withoutFinishedReading(localRecentReading, inpxServer.readIds, readingProgressByBookId)[0];
    const onDisk = hero
      ? downloadedBooksWithFile.some((b) => b.id === hero.id && Boolean(b.localFileName?.trim()))
      : false;
    void syncContinueReadingWidget(
      hero && onDisk
        ? {
            id: hero.id,
            title: hero.title,
            author: hero.authorsDisplay,
            progress: hero.readProgress,
            rating: hero.rating,
          }
        : null,
    );
  }, [localRecentReading, downloadedBooksWithFile, inpxServer.readIds, readingProgressByBookId]);

  // Web «Убрать» from «Читаю» deletes the server history row, but a downloaded book with local
  // progress kept coming back here. When the server history changes, hide those books locally.
  const reconciledHistoryRevRef = React.useRef<string | null>(null);
  const localRecentReadingRef = React.useRef(localRecentReading);
  localRecentReadingRef.current = localRecentReading;
  const readIdsRef = React.useRef(inpxServer.readIds);
  readIdsRef.current = inpxServer.readIds;
  // Runs when the profile reloads (start, return to the app, server activity change).
  React.useEffect(() => {
    if (!isOnline || !inpxServer.profile) return;
    let cancelled = false;
    void (async () => {
      try {
        const meta = await fetchReaderActivitySyncMeta(serverConfig);
        const rev = meta?.readingHistoryRev || null;
        if (cancelled || !rev || rev === reconciledHistoryRevRef.current) return;
        const candidates = recentRemovedOnServer(localRecentReadingRef.current, new Set(), rev, readIdsRef.current);
        if (candidates.length > 0) {
          const serverIds = new Set<string>();
          for (let page = 1; page <= 20; page += 1) {
            const res = await fetchLibraryView(serverConfig, 'continue', page, 24);
            for (const item of res.items) serverIds.add(String(item.id));
            if (res.items.length < 24 || serverIds.size >= (res.total || 0)) break;
          }
          if (cancelled) return;
          const removed = recentRemovedOnServer(localRecentReadingRef.current, serverIds, rev, readIdsRef.current);
          for (const id of removed) clearOfflineReadingHistory(id);
          if (removed.length > 0) bumpReaderLocal();
        }
        reconciledHistoryRevRef.current = rev;
      } catch {
        /* next profile refresh retries */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline, inpxServer.profile, serverConfig, bumpReaderLocal]);

  // «Новое у любимых» widget: only when one is placed; on start, on return to the app and when read marks change.
  const readCount = inpxServer.readIds?.size ?? 0;
  React.useEffect(() => {
    if (!isOnline || !isAndroid()) return;
    let cancelled = false;
    const refresh = async () => {
      if (cancelled || !(await isFollowingWidgetPlaced())) return;
      try {
        const res = await fetchLibraryView(serverConfig, 'following', 1, FOLLOWING_WIDGET_MAX_BOOKS);
        const items = (res.items || []).map((item) => mapServerBook(item, serverConfig));
        await warmCoverCache({
          bookIds: items.map((b) => b.id),
          config: serverConfig,
          shouldContinue: () => !cancelled,
        });
        if (cancelled) return;
        await syncFollowingWidget(items.map((b) => ({ id: b.id, title: b.title, author: b.author, ext: b.ext })));
      } catch {
        /* older server (404) or offline: keep the widget's last covers */
      }
    };
    const timer = window.setTimeout(() => void refresh(), 3000);
    const resume = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refresh();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void resume.then((h) => h.remove()).catch(() => {});
    };
  }, [isOnline, serverConfig, readCount]);

  React.useEffect(() => {
    if (!activeReader || !isOnline) {
      setReaderNextInSeries(null);
      readerNextBookRef.current = null;
      return;
    }
    let cancelled = false;
    const bookId = activeReader.bookId;
    void resolveNextInSeries(serverConfig, bookId, inpxServer.readIds ?? [])
      .then((next) => {
        if (cancelled) return;
        if (next?.next?.id) {
          readerNextBookRef.current = next.next;
          setReaderNextInSeries({ bookId: next.next.id, title: next.next.title || '' });
        } else {
          readerNextBookRef.current = null;
          setReaderNextInSeries(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          readerNextBookRef.current = null;
          setReaderNextInSeries(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeReader, inpxServer.readIds, isOnline, serverConfig]);

  const handleOpenNextInSeriesFromReader = React.useCallback(
    (bookId: string) => {
      const next = readerNextBookRef.current;
      if (!next || next.id !== bookId) return;
      void (async () => {
        try {
          const closingId = activeReaderRef.current?.bookId;
          // Cancel close-path NextInSeriesSheet — we already know the target volume.
          nextSeriesGenRef.current += 1;
          setNextSeriesResult(null);
          if (closingId) nextSeriesDismissedRef.current.add(closingId);
          await handleCloseReader();
          await handleContinueBook(next);
        } catch {
          snackbar.show('Не удалось открыть следующую книгу серии', undefined, 'error');
        }
      })();
    },
    [handleCloseReader, handleContinueBook],
  );

  const completeOnboarding = React.useCallback(() => {
    setAppSettingRaw(APP_SETTING_KEYS.onboardingDone, '1');
    setShowOnboarding(false);
  }, []);

  /** Decide once at boot — never while the user types in the wizard. */
  const onboardingDecidedRef = React.useRef(false);

  React.useEffect(() => {
    if (!serverConfigReady || !libraryReady || !storageDirectoryReady) return;
    if (onboardingDecidedRef.current) return;
    onboardingDecidedRef.current = true;

    const done = getAppSettingString(APP_SETTING_KEYS.onboardingDone) === '1';
    if (done) {
      setShowOnboarding(false);
      return;
    }

    // Returning install: credentials already loaded from secure store / already connected.
    // Do NOT treat live form edits or momentary isOnline as "done".
    const returningUser =
      serverConfig.connectionStatus === 'connected' ||
      Boolean(serverConfig.deviceToken?.trim()) ||
      Boolean(serverConfig.username?.trim() && serverConfig.password);

    if (returningUser) {
      setAppSettingRaw(APP_SETTING_KEYS.onboardingDone, '1');
      setShowOnboarding(false);
      return;
    }

    setShowOnboarding(true);
    // Intentionally only when boot readiness flips — not on username/password keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot gate
  }, [serverConfigReady, libraryReady, storageDirectoryReady]);

  const snackbarShowRef = React.useRef(snackbar.show);
  snackbarShowRef.current = snackbar.show;
  const openAppUpdateRef = React.useRef(() => {});
  openAppUpdateRef.current = () => {
    handleTabChange('profile');
    setUpdateFocusEpoch((n) => n + 1);
  };

  React.useEffect(() => {
    if (!isNativeApp()) return;
    if (!serverConfigReady || !libraryReady || !storageDirectoryReady) return;
    if (showOnboarding) return;
    if (getAppSettingString(APP_SETTING_KEYS.onboardingDone) !== '1') return;

    const run = () => {
      void maybeAutoCheckAppUpdate()
        .then(({ result, prompt }) => {
          if (!result || !prompt || activeReaderRef.current) return;
          setAppSettingRaw(APP_SETTING_KEYS.appUpdatePrompted, result.latestVersion);
          snackbarShowRef.current(`Доступна версия v${result.latestVersion}`, {
            label: 'Обновить',
            onClick: () => openAppUpdateRef.current(),
          });
        })
        .catch(() => {
          /* сеть/GitHub — молча, ручная проверка остаётся в настройках */
        });
    };
    run();
    let handle: { remove: () => Promise<void> } | undefined;
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) run();
    }).then((h) => {
      handle = h;
    });
    return () => {
      void handle?.remove();
    };
  }, [serverConfigReady, libraryReady, storageDirectoryReady, showOnboarding]);

  return (
    <MobileFrame>
      {!serverConfigReady || !libraryReady || !storageDirectoryReady ? (
        <div
          className={`flex-1 flex flex-col items-center justify-center gap-4 ${theme.bg} ${theme.text}`}
        >
          <img
            src={BRAND_LOCKUP_SRC}
            alt="INPX Reader"
            className="h-10 w-auto max-w-[14rem] object-contain"
          />
        </div>
      ) : showOnboarding ? (
        <TabScreenPanel active>
        <OnboardingFlow
          serverConfig={serverConfig}
          onChangeServerConfig={handleServerConfigChange}
          onTestConnection={handleTestConnection}
          onPairingLogin={applyPairingLogin}
          connectionError={connectionError}
          storageDirectory={storageDirectory}
          onChangeStorageDirectory={setStorageDirectory}
          onComplete={completeOnboarding}
        />
        </TabScreenPanel>
      ) : (
        <>
        {/* Keep shell mounted under the reader so catalog drill-down/search survive close. */}
        <div
          className={activeReader ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}
          aria-hidden={activeReader ? true : undefined}
        >
        <AppShell
          activeTab={activeTab}
          onTabChange={handleTabChange}
          siteName={siteName}
          logoSrc={logoSrc}
          isOnline={isOnline}
          isVerifyingConnection={isVerifyingConnection}
          onOpenConnectionSettings={handleOpenConnectionSettings}
          onOpenQueue={openQueueSheet}
          serverConfig={serverConfig}
          onSearchSubmit={handleHomeSearchSubmit}
          onSearchAuthor={(name) => handleNavigateToCatalog(CATALOG_BROWSE_ROOT, name, null, activeTab === 'catalog' ? null : activeTab)}
          onSearchSeries={(name) => handleNavigateToCatalog(CATALOG_BROWSE_ROOT, null, name, activeTab === 'catalog' ? null : activeTab)}
          onSearchBook={handleHomeSearchBook}
        >
          <TabScreenPanel active={activeTab === 'home'}>
            <HomeTab
              profile={profile}
              loading={profileLoading}
              serverConfig={serverConfig}
              isAppDark={isAppDark}
              isOnline={isOnline}
              downloadedBookIds={downloadedBookIdsWithFile}
              localRecentReading={localRecentReading}
              readingProgressByBookId={readingProgressByBookId}
              storageDirectory={storageDirectory}
              onOpenBook={handleBookPrimaryAction}
              onOpenDetails={openBookDetailsExclusive}
              downloadingId={downloadingId}
              queuedBookIds={queuedBookIds}
              fetchSectionBooks={isOnline ? inpxServer.fetchSectionBooks : undefined}
              onRefresh={isOnline ? () => inpxServer.refresh() : undefined}
              onGoCatalog={handleOpenCatalogRoot}
              onGoProfile={handleOpenConnectionSettings}
              onSearchSubmit={handleHomeSearchSubmit}
              onSearchAuthor={(name) => handleNavigateToCatalog(CATALOG_BROWSE_ROOT, name, null, 'home')}
              onSearchSeries={(name) => handleNavigateToCatalog(CATALOG_BROWSE_ROOT, null, name, 'home')}
              onSearchBook={handleHomeSearchBook}
              onBookLongPress={openBookActions}
              isTabActive={activeTab === 'home' && !activeReader}
              homeRootEpoch={homeRootEpoch}
              homeShelvesEpoch={homeShelvesEpoch}
              onUnpinShelf={isOnline ? (ref) => { void handleSetShelfOnHome(ref.kind === 'smart' ? 'smart' : 'shelf', Number(ref.id), false); } : undefined}
              readIds={isOnline ? inpxServer.readIds : undefined}
              onAuthExpired={markAuthExpired}
              onConnectionLost={markServerDisconnected}
              siteName={siteName}
            />
          </TabScreenPanel>

          <TabScreenPanel active={activeTab === 'catalog'}>
            <React.Suspense fallback={<div className="flex-1 px-5 py-4"><BookListSkeleton count={8} /></div>}>
              <CatalogTab
                serverConfig={serverConfig}
                onReadMarksChanged={isOnline ? () => { void inpxServer.refresh(); } : undefined}
                shelves={isOnline ? inpxServer.shelves : undefined}
                onShelvesChanged={isOnline ? () => { void inpxServer.refreshShelves(); } : undefined}
                onEnqueueDownload={handleDownloadBookFromUi}
                downloadedBookIds={downloadedBookIdsWithFile}
                downloadingId={downloadingId}
                queuedBookIds={queuedBookIds}
                onOpenBook={handleContinueBook}
                isTabActive={activeTab === 'catalog' && !activeReader}
                storageDirectory={storageDirectory}
                favoriteAuthors={activeFavoriteAuthors}
                onToggleFavoriteAuthor={handleToggleFavoriteAuthor}
                favoriteSeries={activeFavoriteSeries}
                onToggleFavoriteSeries={handleToggleFavoriteSeries}
                bookmarkIds={isOnline ? inpxServer.bookmarkIds : undefined}
                readIds={isOnline ? inpxServer.readIds : undefined}
                readingProgressByBookId={readingProgressByBookId}
                onToggleBookBookmark={isOnline ? handleToggleBookBookmark : undefined}
                onToggleRead={handleToggleReadStatus}
                isAppDark={isAppDark}
                subTab={catalogSubTab}
                onSubTabChange={setCatalogSubTab}
                selectedAuthor={catalogSelectedAuthor}
                onSelectedAuthorChange={setCatalogSelectedAuthor}
                selectedSeries={catalogSelectedSeries}
                onSelectedSeriesChange={setCatalogSelectedSeries}
                selectedSubgenre={catalogSelectedSubgenre}
                onSelectedSubgenreChange={setCatalogSelectedSubgenre}
                returnToPreviousTab={catalogReturnTo}
                onReturnToPreviousTab={handleCompleteCatalogReturn}
                onClearReturnTo={() => setCatalogReturnTo(null)}
                catalogNavEpoch={catalogNavEpoch}
                pendingSearchQuery={catalogPendingSearch}
                onConsumePendingSearch={handleConsumePendingSearch}
                onBookLongPress={openBookActions}
                onOpenDetails={openBookDetailsExclusive}
                onCloseDetails={() => {
                  setDownloadPromptBook(null);
                  setDownloadPromptError(null);
                }}
                onAuthExpired={markAuthExpired}
                onConnectionLost={markServerDisconnected}
              />
            </React.Suspense>
          </TabScreenPanel>

          <TabScreenPanel active={activeTab === 'library'}>
            <MyBooksTab
              serverConfig={serverConfig}
              isAppDark={isAppDark}
              isOnline={isOnline}
              canDownloadOnline={canReadOnline}
              downloadedBookIds={downloadedBookIdsWithFile}
              localOfflineBooks={downloadedBooksWithFile}
              localRecentReading={localRecentReading}
              storageDirectory={storageDirectory}
              storageDirectoryReady={storageDirectoryReady}
              downloadingId={downloadingId}
              readingProgressByBookId={readingProgressByBookId}
              readIds={inpxServer.collectionsReady ? inpxServer.readIds : undefined}
              bookmarkIds={inpxServer.collectionsReady ? inpxServer.bookmarkIds : undefined}
              wantIds={inpxServer.collectionsReady ? inpxServer.wantIds : undefined}
              onAuthExpired={markAuthExpired}
              shelves={libraryShelves}
              favoriteAuthors={activeFavoriteAuthors}
              favoriteSeries={activeFavoriteSeries}
              favoriteAuthorItems={isOnline ? inpxServer.favoriteAuthorItems : undefined}
              favoriteSeriesItems={isOnline ? inpxServer.favoriteSeriesItems : undefined}
              fetchSectionBooks={isOnline ? inpxServer.fetchSectionBooks : undefined}
              loadShelfBooks={async (shelfId) => {
                const localBooks = () => {
                  const shelf = localShelves.find((s) => String(s.id) === String(shelfId));
                  if (!shelf) return [];
                  const ids = new Set(shelf.bookIds);
                  return downloadedBooksWithFile.filter((b) => ids.has(b.id));
                };
                if (!isOnline || !/^\d+$/.test(String(shelfId))) return localBooks();
                try {
                  const remote = await inpxServer.loadShelfBooks(Number(shelfId));
                  const seen = new Set(remote.map((book) => book.id));
                  return [...remote, ...localBooks().filter((book) => !seen.has(book.id))];
                } catch (err) {
                  const local = localBooks();
                  if (local.length > 0) return local;
                  throw err;
                }
              }}
              onOpenBook={handleBookPrimaryAction}
              onContinueBook={handleContinueBook}
              onRegisterBook={registerDownloadedBook}
              onOpenDetails={openBookDetailsExclusive}
              onBookLongPress={openBookActions}
              onRemoveBooks={handleRemoveBooks}
              onAddBooksToShelf={handleAddBooksToShelf}
              onAddShelf={handleAddShelf}
              onOpenAuthor={handleOpenAuthorFromProfile}
              onOpenSeries={handleOpenSeriesFromProfile}
              onRemoveShelf={handleRemoveShelfConfirmed}
              onToggleShelfHome={isOnline ? handleToggleShelfHome : undefined}
              onReorderShelves={isOnline ? handleReorderShelves : undefined}
              onGoCatalog={handleOpenCatalogRoot}
              onGoProfile={() => handleTabChange('profile')}
              onOpenQueue={openQueueSheet}
              localReaderAnnotations={localReaderAnnotations}
              localReaderBookmarks={localReaderBookmarks}
              onOpenBookAtPosition={handleOpenBookAtPosition}
              onRemoveReaderAnnotation={handleRemoveReaderAnnotation}
              onUpdateReaderAnnotation={handleUpdateReaderAnnotation}
              onRemoveReaderBookmark={handleRemoveReaderBookmark}
              onUpdateReaderBookmark={handleUpdateReaderBookmark}
              isTabActive={activeTab === 'library' && !activeReader}
              libraryRootEpoch={libraryRootEpoch}
              openRequest={libraryOpenRequest}
            />
          </TabScreenPanel>

          <TabScreenPanel active={activeTab === 'profile'}>
            <ProfileScreen
              profile={profile}
              onAuthExpired={markAuthExpired}
              loading={profileLoading}
              error={profileError}
              isOnline={isOnline}
              serverConfig={serverConfig}
              onChangeServerConfig={handleServerConfigChange}
              onTestConnection={handleTestConnection}
              onPairingLogin={applyPairingLogin}
              onForgetServer={() => {
                setConnectionError(null);
                setFavoriteAuthors([]);
                setFavoriteSeries([]);
                setShelves([]);
              }}
              connectionError={connectionError}
              storageDirectory={storageDirectory}
              onChangeStorageDirectory={setStorageDirectory}
              appearance={appearance}
              onChangeAppearance={setAppearance}
              colorSource={colorSource}
              onChangeColorSource={setColorSource}
              isAppDark={isAppDark}
              einkMode={einkModePref}
              onChangeEinkMode={setEinkModePref}
              einkDetected={einkDetected}
              localBookCount={downloadedBooksWithFile.filter((b) => !isFolderLocalBookId(b.id)).length}
              localInProgressCount={localRecentReading.filter((b) => b.readProgress > 0 && b.readProgress < 99).length}
              connectionFocusEpoch={connectionFocusEpoch}
              updateFocusEpoch={updateFocusEpoch}
              isTabActive={activeTab === 'profile' && !activeReader}
              rootEpoch={profileRootEpoch}
              onOpenLibrary={(seg) => {
                handleTabChange('library');
                setLibraryOpenRequest((prev) => ({ seg, n: (prev?.n ?? 0) + 1 }));
              }}
            />
          </TabScreenPanel>
          <NextInSeriesSheet
            open={Boolean(nextSeriesResult) && !activeReader}
            result={nextSeriesResult}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            onClose={() => {
              if (nextSeriesResult) {
                nextSeriesDismissedRef.current.add(nextSeriesResult.current.id);
              }
              setNextSeriesResult(null);
            }}
            onContinue={handleNextSeriesContinue}
            onOpenSeries={(seriesName) => {
              handleNavigateToCatalog(CATALOG_BROWSE_ROOT, null, seriesName, readerOriginTabRef.current);
            }}
          />
        </AppShell>
        </div>

        {activeReader && resolvedReaderFile ? (
          <div className="fixed inset-0 z-[200] flex flex-col min-h-0">
            <FoliateReader
                key={activeReader.bookId}
                bookId={activeReader.bookId}
                bookTitle={activeReader.title}
                bookAuthor={
                  downloadedBooks.find((b) => b.id === activeReader.bookId)?.author || ''
                }
                bookExt={activeReader.ext}
                coverUrl={
                  serverConfig.connectionStatus === 'connected'
                    ? coverUrl(serverConfig, activeReader.bookId, 'thumb')
                    : ''
                }
                coverAuthHeader={authHeader(serverConfig).Authorization || ''}
                initialPosition={activeReader.initialPosition}
                localFile={resolvedReaderFile}
                einkActive={einkActive}
                offline={!isOnline}
                serverConfig={isOnline ? serverConfig : null}
                nextInSeries={readerNextInSeries}
                autoStartTtsToken={ttsAutostart?.bookId === activeReader.bookId ? ttsAutostart.token : 0}
                onClose={() => { void handleCloseReader(); }}
                onStoreSynced={bumpReaderLocal}
                onOpenNextInSeries={handleOpenNextInSeriesFromReader}
            />
          </div>
        ) : activeReader ? (
          <MissingLocalBookFallback
            title={activeReader.title}
            onBack={() => { void handleCloseReader(); }}
            onRedownload={
              canReadOnline
                ? () => {
                    const book = downloadedBooks.find((b) => b.id === activeReader.bookId);
                    void handleCloseReader().then(() => {
                      if (book) void handleDownloadBookFromUi(book).catch(() => {});
                    });
                  }
                : undefined
            }
          />
        ) : null}
        </>
      )}

      <BookDetailsSheet
        book={activeReader || queueSheetOpen ? null : downloadPromptBook}
        onClose={() => {
          setDownloadPromptBook(null);
          setDownloadPromptError(null);
        }}
        serverConfig={serverConfig}
        storageDirectory={storageDirectory}
        isServerConnected={isOnline}
        downloadedBookIds={downloadedBookIdsWithFile}
        downloadingId={downloadingId}
        queuedBookIds={queuedBookIds}
        downloadError={downloadPromptError}
        onDownload={(book) => {
          void handleDownloadBookFromUi(book).catch(() => {});
        }}
        onOpenBook={(book) => {
          setDownloadPromptBook(null);
          // Details sheet holds catalog meta — merge local paths before open.
          const local = downloadedBooks.find((b) => b.id === book.id);
          void handleContinueBook(
            local
              ? {
                  ...book,
                  ...local,
                  title: book.title || local.title,
                  author: book.author || local.author,
                  // Prefer fresher paths from the sheet/caller over stale library snapshot.
                  localFileName: book.localFileName?.trim() ? book.localFileName : local.localFileName,
                  storageUri: book.storageUri?.trim() ? book.storageUri : local.storageUri,
                  chaptersPath: book.chaptersPath?.trim() ? book.chaptersPath : local.chaptersPath,
                }
              : book,
          );
        }}
        onSelectBook={setDownloadPromptBook}
        readIds={isOnline ? inpxServer.readIds : undefined}
        readingProgressByBookId={readingProgressByBookId}
        isAppDark={isAppDark}
        onOpenAuthor={handleOpenAuthorFromBook}
        onOpenSeries={handleOpenSeriesFromBook}
        onOpenGenre={handleOpenGenreFromBook}
        onAuthExpired={markAuthExpired}
        shelves={uiShelves}
        onAddToShelf={handleAddBookToShelfFromUi}
        onCreateShelf={handleAddShelf}
        isBookmarked={downloadPromptBook ? inpxServer.bookmarkIds?.has(downloadPromptBook.id) : false}
        onToggleBookmark={isOnline ? handleToggleBookBookmark : undefined}
        isWant={downloadPromptBook ? inpxServer.wantIds?.has(downloadPromptBook.id) : false}
        onToggleWant={isOnline ? handleToggleWant : undefined}
        onOpenActions={(book) => openBookActions(book, { fromDetails: true })}
        onToggleRead={handleToggleReadStatus}
      />

      <DownloadQueueSheet
        open={queueSheetOpen && !activeReader}
        onClose={() => setQueueSheetOpen(false)}
        onOpenSaved={handleBookPrimaryAction}
      />

      <BookActionsSheet
        target={activeReader || queueSheetOpen ? null : actionsTarget}
        serverConfig={serverConfig}
        storageDirectory={storageDirectory}
        isDownloaded={
          actionsTarget ? downloadedBookIdsWithFile.includes(actionsTarget.book.id) : false
        }
        isRead={actionsTarget ? bookMarkedRead(actionsTarget.book.id) : false}
        isBookmarked={actionsTarget ? (
          Boolean(inpxServer.bookmarkIds?.has(actionsTarget.book.id) || actionsTarget.book.isFavorite)
        ) : false}
        isOnline={isOnline}
        onClose={() => setActionsTarget(null)}
        onOpenDetails={openBookDetailsExclusive}
        onToggleRead={handleToggleReadStatus}
        onToggleBookmark={isOnline ? handleToggleBookBookmark : undefined}
        onRemoveFromShelf={(bookId, shelfId) => {
          void handleRemoveBookFromShelf(bookId, String(shelfId));
        }}
        onRemoveFromReading={(bookId) => {
          void handleRemoveReadingHistory(bookId);
        }}
        shelves={uiShelves}
        onAddToShelf={handleAddBookToShelfFromUi}
        onCreateShelf={handleAddShelf}
        onRemove={(bookId) => {
          void handleRemoveBook(bookId);
        }}
      />
    </MobileFrame>
  );
}
