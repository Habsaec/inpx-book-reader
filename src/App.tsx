/**
 * INPX Book Reader — главное приложение.
 *
 * 📱 Только Android (Capacitor APK).
 * 🚫 server.ts не улучшать — только для dev в браузере.
 *
 * @see AGENTS.md — контекст проекта и ограничения
 */

import React from 'react';
import { useDragControls } from 'motion/react';
import MobileFrame from './components/MobileFrame';
import ProfileScreen from './components/ProfileScreen';
import HomeTab from './components/HomeTab';
import MyBooksTab from './components/MyBooksTab';
import NextInSeriesSheet from './components/NextInSeriesSheet';
import OnboardingFlow from './components/OnboardingFlow';
import BookActionsSheet, { type BookActionsTarget } from './components/BookActionsSheet';
import BookDetailsSheet from './components/catalog/BookDetailsSheet';
import AppShell, { type AppTab } from './components/AppShell';
import { MissingLocalBookFallback } from './components/MissingLocalBookFallback';
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
import { useLocalBookFileVerification } from './hooks/useLocalBookFileVerification';
import {
  ensureStorageDirectory,
  isValidStorageDirectory,
  normalizeStorageDirectory,
  readStoredStorageDirectory,
  writeStoredStorageDirectory,
  type StorageDirectory,
} from './lib/storageDirectory';
import { isAndroid } from './lib/platform';
import { theme } from './lib/appTheme';
import { ScreenLoader } from './ui/Skeleton';
import TabScreenPanel from './ui/TabScreenPanel';
import { syncAndroidStatusBar } from './lib/androidChrome';
import {
  type AppAppearance,
  type AppColorSource,
  applyAppThemeMode,
  applyServerChromeVars,
  applyServerThemeVars,
  clearServerChromeVars,
  clearServerThemeVars,
  fetchServerUiTheme,
  parseAppAppearance,
  parseAppColorSource,
  resolveIsDark,
} from './lib/serverTheme';
import { APP_SETTING_KEYS, getAppSettingString, setAppSettingRaw } from './lib/appSettings';
import { resolveNextInSeries, type NextInSeriesResult } from './lib/seriesNavigation';
import { syncContinueReadingWidget } from './lib/continueWidget';
import { useDownloadQueue } from './hooks/useDownloadQueue';
import { useSnackbar } from './ui/Snackbar';
import { authHeader, coverUrl, fetchServerLogoBlob } from './lib/inpxClient';
import { warmCoverCache } from './lib/coverCache';
import type { Book } from './types';

const CatalogTab = React.lazy(() => import('./components/CatalogTab'));
const FoliateReader = React.lazy(() => import('./components/FoliateReader'));

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

  const openBookActions = React.useCallback((book: Book, context?: { shelfId?: number; shelfName?: string }) => {
    setActionsTarget({
      book,
      shelfId: context?.shelfId,
      shelfName: context?.shelfName,
    });
  }, []);
  const bookDetailsDrag = useDragControls();

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
  } = library;

  const [catalogSubTab, setCatalogSubTab] = React.useState<'books' | 'authors' | 'series' | 'genres'>('authors');
  const [catalogSelectedAuthor, setCatalogSelectedAuthor] = React.useState<string | null>(null);
  const [catalogSelectedSeries, setCatalogSelectedSeries] = React.useState<string | null>(null);
  const [catalogSelectedSubgenre, setCatalogSelectedSubgenre] = React.useState<{ parent: string; name: string } | null>(null);
  const [catalogReturnTo, setCatalogReturnTo] = React.useState<AppTab | null>(null);
  /** Bumped on external catalog deep-links so CatalogTab resets search. */
  const [catalogNavEpoch, setCatalogNavEpoch] = React.useState(0);
  /** Bumped on Home tab re-tap — close «Показать всё» lists. */
  const [homeRootEpoch, setHomeRootEpoch] = React.useState(0);
  /** Bumped on Library tab re-tap — close overlays / shelf / back to root segment. */
  const [libraryRootEpoch, setLibraryRootEpoch] = React.useState(0);
  const readerOriginTabRef = React.useRef<AppTab>('home');

  const { resetExitPrompt } = useAppBackButton(() => snackbar.show('Ещё раз для выхода'));
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
    setCatalogReturnTo(null);
    clearCatalogDrilldown();
    setCatalogSubTab('authors');
    setCatalogNavEpoch((n) => n + 1);
    setActiveTab('catalog');
  }, [clearCatalogDrilldown]);

  const handleCompleteCatalogReturn = React.useCallback(() => {
    const target = catalogReturnTo ?? 'home';
    setCatalogReturnTo(null);
    clearCatalogDrilldown();
    setCatalogSubTab('authors');
    setCatalogNavEpoch((n) => n + 1);
    setActiveTab(target);
  }, [catalogReturnTo, clearCatalogDrilldown]);

  const handleTabChange = React.useCallback((tab: AppTab) => {
    // Leaving Catalog abandons drill-down/return stack so re-entry is a clean root.
    if (tab !== 'catalog') {
      setCatalogReturnTo(null);
      clearCatalogDrilldown();
      setCatalogSubTab('authors');
    } else {
      setCatalogReturnTo(null);
    }

    // Re-tap active tab → pop nested UI back to that tab's root (like system Back peel).
    if (tab === activeTab) {
      if (tab === 'home') {
        setHomeRootEpoch((n) => n + 1);
      } else if (tab === 'library') {
        setLibraryRootEpoch((n) => n + 1);
      } else if (tab === 'catalog') {
        setCatalogReturnTo(null);
        clearCatalogDrilldown();
        setCatalogSubTab('authors');
        setCatalogNavEpoch((n) => n + 1);
      }
    }

    setActiveTab(tab);
  }, [activeTab, clearCatalogDrilldown]);

  const [appearance, setAppearance] = React.useState<AppAppearance>(
    () => parseAppAppearance(getAppSettingString(APP_SETTING_KEYS.theme)),
  );
  const [colorSource, setColorSource] = React.useState<AppColorSource>(
    () => parseAppColorSource(
      getAppSettingString(APP_SETTING_KEYS.themeColor),
      getAppSettingString(APP_SETTING_KEYS.theme),
    ),
  );
  const [useServerBackground, setUseServerBackground] = React.useState(
    () => getAppSettingString(APP_SETTING_KEYS.serverBackground, '1') !== '0',
  );

  const [serverUiTheme, setServerUiTheme] = React.useState<Awaited<ReturnType<typeof fetchServerUiTheme>>>(null);
  const [serverBgBlobUrl, setServerBgBlobUrl] = React.useState<string | null>(null);
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
  const { siteName, logoSrc } = useServerBranding(serverConfig);

  const appBootReady = serverConfigReady && libraryReady && storageDirectoryReady;

  React.useEffect(() => {
    if (appBootReady) {
      (window as Window & { __INPX_APP_READY__?: boolean }).__INPX_APP_READY__ = true;
    }
  }, [appBootReady]);

  React.useEffect(() => {
    if (!libraryReady) return;
    const legacy = getAppSettingString(APP_SETTING_KEYS.theme);
    setAppearance(parseAppAppearance(legacy));
    setColorSource(parseAppColorSource(getAppSettingString(APP_SETTING_KEYS.themeColor), legacy));
  }, [libraryReady]);

  React.useEffect(() => {
    if (!libraryReady) return;
    setAppSettingRaw(APP_SETTING_KEYS.themeColor, colorSource);
    setAppSettingRaw(APP_SETTING_KEYS.theme, appearance);
  }, [appearance, colorSource, libraryReady]);

  React.useEffect(() => {
    if (!libraryReady) return;
    const saved = getAppSettingString(APP_SETTING_KEYS.serverBackground, '1');
    setUseServerBackground(saved !== '0');
  }, [libraryReady]);

  React.useEffect(() => {
    if (!libraryReady) return;
    setAppSettingRaw(APP_SETTING_KEYS.serverBackground, useServerBackground ? '1' : '0');
  }, [useServerBackground, libraryReady]);

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

  React.useEffect(() => {
    let cancelled = false;
    void fetchServerUiTheme(serverConfig)
      .then((theme) => {
        if (!cancelled) setServerUiTheme(theme);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [serverConfig.connectionStatus, serverConfig.url]);

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

  React.useEffect(() => {
    const path = serverUiTheme?.backgroundUrl;
    if (einkActive || !useServerBackground || !path || serverConfig.connectionStatus !== 'connected') {
      setServerBgBlobUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetchServerLogoBlob(serverConfig, path).then((blob) => {
      if (cancelled || !blob) return;
      const nextUrl = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      objectUrl = nextUrl;
      setServerBgBlobUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [einkActive, useServerBackground, serverUiTheme?.backgroundUrl, serverConfig.connectionStatus, serverConfig.url]);

  React.useEffect(() => {
    if (einkActive) {
      // E-ink palette comes from html[data-eink="1"] CSS; keep stored color theme intact.
      clearServerThemeVars();
      clearServerChromeVars();
      document.documentElement.dataset.theme = 'light';
      void syncAndroidStatusBar(false, { eink: true });
      return;
    }
    applyAppThemeMode(isAppDark);
    if (colorSource === 'server') {
      applyServerThemeVars(serverUiTheme, isAppDark);
    } else {
      clearServerThemeVars();
    }
    applyServerChromeVars(serverUiTheme, isAppDark, serverBgBlobUrl, useServerBackground);
    void syncAndroidStatusBar(isAppDark, { eink: false });
  }, [isAppDark, appearance, colorSource, serverUiTheme, serverBgBlobUrl, useServerBackground, einkActive]);

  const { enqueueDownload, downloadingId, queuedBookIds } = useDownloadPipeline({
    serverConfig,
    storageDirectory,
    canReadOnline,
    setDownloadedBooks,
    onAuthExpired: markAuthExpired,
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
    handleRemoveBooks,
    handleAddBooksToShelf,
    handleToggleFavoriteAuthor,
    handleToggleFavoriteSeries,
    handleToggleBookBookmark,
    handleToggleReadStatus,
    handleRemoveBookFromShelf,
    handleRemoveShelfConfirmed,
    handleRemoveReaderAnnotation,
    handleUpdateReaderAnnotation,
    handleRemoveReaderBookmark,
  } = bookActions;

  useAndroidLaunch({
    ready: serverConfigReady && libraryReady && storageDirectoryReady,
    serverConfig,
    storageDirectory,
    localRecentReading,
    downloadedBooks,
    onContinueBook: handleContinueBook,
    onOpenBook: handleOpenBookCard,
    onRegisterImportedBook: (book) => {
      setDownloadedBooks((prev) => (prev.some((b) => b.id === book.id) ? prev : [...prev, book]));
    },
    onTabChange: handleTabChange,
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
      handleNavigateToCatalog('authors', name, null, activeTab);
    },
    [activeTab, handleNavigateToCatalog, setDownloadPromptBook],
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
      handleNavigateToCatalog('series', null, name, activeTab);
    },
    [activeTab, handleNavigateToCatalog, setDownloadPromptBook],
  );

  const handleOpenAuthorFromProfile = React.useCallback(
    (name: string) => handleNavigateToCatalog('authors', name, null, 'library'),
    [handleNavigateToCatalog],
  );

  const handleOpenSeriesFromProfile = React.useCallback(
    (name: string) => handleNavigateToCatalog('series', null, name, 'library'),
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

  const downloadJobs = useDownloadQueue();
  const queuedCount = React.useMemo(
    () => downloadJobs.filter((j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'saving').length,
    [downloadJobs],
  );
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
    const hero = localRecentReading[0];
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
  }, [localRecentReading, downloadedBooksWithFile]);

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

  return (
    <MobileFrame>
      {!serverConfigReady || !libraryReady || !storageDirectoryReady ? (
        <div
          className={`flex-1 flex flex-col items-center justify-center gap-4 ${theme.bg} ${theme.text}`}
          style={{ backgroundColor: '#1e1a16' }}
        >
          <img
            src={BRAND_LOCKUP_SRC}
            alt="INPX Reader"
            className="h-10 w-auto max-w-[14rem] object-contain"
          />
          <p className={`text-xs font-bold ${theme.textMuted}`}>Защищаем подключение…</p>
        </div>
      ) : showOnboarding ? (
        <div key="onboarding" className="flex-1 min-h-0 flex flex-col inpx-screen-enter">
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
        </div>
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
          queuedCount={queuedCount}
        >
          <TabScreenPanel active={activeTab === 'home'}>
            <HomeTab
              profile={profile}
              loading={profileLoading}
              serverConfig={serverConfig}
              isAppDark={isAppDark}
              isOnline={isOnline}
              isVerifyingConnection={isVerifyingConnection}
              downloadedBookIds={downloadedBookIdsWithFile}
              localRecentReading={localRecentReading}
              readingProgressByBookId={readingProgressByBookId}
              storageDirectory={storageDirectory}
              onContinueBook={handleContinueBook}
              onOpenBook={handleContinueBook}
              onOpenDetails={openBookDetails}
              fetchSectionBooks={isOnline ? inpxServer.fetchSectionBooks : undefined}
              onRefresh={isOnline ? () => inpxServer.refresh() : undefined}
              onGoCatalog={handleOpenCatalogRoot}
              onBookLongPress={openBookActions}
              isTabActive={activeTab === 'home' && !activeReader}
              homeRootEpoch={homeRootEpoch}
              readIds={isOnline ? inpxServer.readIds : undefined}
              onAuthExpired={markAuthExpired}
              onConnectionLost={markServerDisconnected}
            />
          </TabScreenPanel>

          <TabScreenPanel active={activeTab === 'catalog'}>
            <React.Suspense fallback={<ScreenLoader label="Загрузка каталога…" />}>
              <CatalogTab
                serverConfig={serverConfig}
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
                onBookLongPress={openBookActions}
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
              storageDirectory={storageDirectory}
              storageDirectoryReady={storageDirectoryReady}
              downloadingId={downloadingId}
              readingProgressByBookId={readingProgressByBookId}
              readIds={isOnline ? inpxServer.readIds : undefined}
              bookmarkIds={isOnline ? inpxServer.bookmarkIds : undefined}
              shelves={
                isOnline
                  ? inpxServer.shelves
                  : localShelves.map((s) => ({
                      id: s.id,
                      name: s.name,
                      bookCount: s.bookIds.length,
                      previewBookIds: s.bookIds.slice(0, 4),
                    }))
              }
              favoriteAuthors={activeFavoriteAuthors}
              favoriteSeries={activeFavoriteSeries}
              favoriteAuthorItems={isOnline ? inpxServer.favoriteAuthorItems : undefined}
              favoriteSeriesItems={isOnline ? inpxServer.favoriteSeriesItems : undefined}
              fetchSectionBooks={isOnline ? inpxServer.fetchSectionBooks : undefined}
              loadShelfBooks={
                isOnline
                  ? (shelfId) => inpxServer.loadShelfBooks(Number(shelfId))
                  : async (shelfId) => {
                      const shelf = localShelves.find((s) => String(s.id) === String(shelfId));
                      if (!shelf) return [];
                      const ids = new Set(shelf.bookIds);
                      return downloadedBooksWithFile.filter((b) => ids.has(b.id));
                    }
              }
              onOpenBook={handleOpenBookCard}
              onContinueBook={handleContinueBook}
              onOpenDetails={openBookDetails}
              onBookLongPress={openBookActions}
              onRemoveBooks={handleRemoveBooks}
              onAddBooksToShelf={isOnline ? handleAddBooksToShelf : undefined}
              onOpenAuthor={handleOpenAuthorFromProfile}
              onOpenSeries={handleOpenSeriesFromProfile}
              onRemoveShelf={handleRemoveShelfConfirmed}
              onGoCatalog={handleOpenCatalogRoot}
              onGoProfile={() => handleTabChange('profile')}
              localReaderAnnotations={localReaderAnnotations}
              localReaderBookmarks={localReaderBookmarks}
              onOpenBookAtPosition={handleOpenBookAtPosition}
              onRemoveReaderAnnotation={handleRemoveReaderAnnotation}
              onUpdateReaderAnnotation={handleUpdateReaderAnnotation}
              onRemoveReaderBookmark={handleRemoveReaderBookmark}
              isTabActive={activeTab === 'library' && !activeReader}
              libraryRootEpoch={libraryRootEpoch}
            />
          </TabScreenPanel>

          <TabScreenPanel active={activeTab === 'profile'}>
            <ProfileScreen
              profile={profile}
              loading={profileLoading}
              error={profileError}
              isOnline={isOnline}
              serverConfig={serverConfig}
              onChangeServerConfig={handleServerConfigChange}
              onTestConnection={handleTestConnection}
              onPairingLogin={applyPairingLogin}
              onForgetServer={() => setConnectionError(null)}
              connectionError={connectionError}
              lastSynced={inpxServer.lastSynced}
              storageDirectory={storageDirectory}
              onChangeStorageDirectory={setStorageDirectory}
              appearance={appearance}
              onChangeAppearance={setAppearance}
              colorSource={colorSource}
              onChangeColorSource={setColorSource}
              useServerBackground={useServerBackground}
              onChangeUseServerBackground={setUseServerBackground}
              hasServerBackground={Boolean(serverUiTheme?.hasBackground)}
              isAppDark={isAppDark}
              einkMode={einkModePref}
              onChangeEinkMode={setEinkModePref}
              einkDetected={einkDetected}
              localBookCount={downloadedBooksWithFile.length}
              localInProgressCount={localRecentReading.filter((b) => b.readProgress > 0 && b.readProgress < 99).length}
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
              handleNavigateToCatalog('series', null, seriesName, readerOriginTabRef.current);
            }}
          />
        </AppShell>
        </div>

        {activeReader && resolvedReaderFile ? (
          <div className="fixed inset-0 z-[200] flex flex-col min-h-0">
            <React.Suspense fallback={<ScreenLoader label="Загрузка читалки…" />}>
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
                nextInSeries={readerNextInSeries}
                onClose={() => { void handleCloseReader(); }}
                onStoreSynced={bumpReaderLocal}
                onOpenNextInSeries={handleOpenNextInSeriesFromReader}
              />
            </React.Suspense>
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
        book={activeReader ? null : downloadPromptBook}
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
        bookmarkIds={isOnline ? inpxServer.bookmarkIds : undefined}
        readIds={isOnline ? inpxServer.readIds : undefined}
        onToggleBookBookmark={isOnline ? handleToggleBookBookmark : undefined}
        onToggleRead={handleToggleReadStatus}
        isAppDark={isAppDark}
        onOpenAuthor={handleOpenAuthorFromBook}
        onOpenSeries={handleOpenSeriesFromBook}
        dragControls={bookDetailsDrag}
        onAuthExpired={markAuthExpired}
      />

      <BookActionsSheet
        target={activeReader ? null : actionsTarget}
        serverConfig={serverConfig}
        storageDirectory={storageDirectory}
        isDownloaded={
          actionsTarget ? downloadedBookIdsWithFile.includes(actionsTarget.book.id) : false
        }
        isDownloading={
          actionsTarget
            ? downloadingId === actionsTarget.book.id || queuedBookIds.has(actionsTarget.book.id)
            : false
        }
        isRead={actionsTarget ? inpxServer.readIds?.has(actionsTarget.book.id) : false}
        isBookmarked={actionsTarget ? inpxServer.bookmarkIds?.has(actionsTarget.book.id) : false}
        isOnline={isOnline}
        onClose={() => setActionsTarget(null)}
        onOpen={(book) => {
          void handleContinueBook(book);
        }}
        onOpenDetails={openBookDetails}
        onDownload={(book) => {
          void handleDownloadBookFromUi(book).catch(() => {});
        }}
        onToggleRead={handleToggleReadStatus}
        onToggleBookmark={isOnline ? handleToggleBookBookmark : undefined}
        onRemoveFromShelf={(bookId, shelfId) => {
          void handleRemoveBookFromShelf(bookId, String(shelfId));
        }}
        onRemove={(bookId) => {
          void handleRemoveBook(bookId);
        }}
      />
    </MobileFrame>
  );
}
