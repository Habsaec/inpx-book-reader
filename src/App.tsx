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
import SyncCenterSheet from './components/SyncCenterSheet';
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
import { syncAndroidStatusBar } from './lib/androidChrome';
import {
  type AppThemeMode,
  applyAppThemeMode,
  applyServerThemeVars,
  clearServerThemeVars,
  fetchServerUiTheme,
  resolveIsDark,
} from './lib/serverTheme';
import { APP_SETTING_KEYS, getAppSettingString, setAppSettingRaw } from './lib/appSettings';
import { bookHasPendingSync, getSyncPendingBreakdown } from './lib/syncStats';
import { resolveNextInSeries, type NextInSeriesResult } from './lib/seriesNavigation';
import { useDownloadQueue } from './hooks/useDownloadQueue';
import { useSnackbar } from './ui/Snackbar';
import type { Book } from './types';

const CatalogTab = React.lazy(() => import('./components/CatalogTab'));
const FoliateReader = React.lazy(() => import('./components/FoliateReader'));

export default function App() {
  const snackbar = useSnackbar();
  const [activeTab, setActiveTab] = React.useState<AppTab>('home');
  const [syncCenterOpen, setSyncCenterOpen] = React.useState(false);
  const [nextSeriesResult, setNextSeriesResult] = React.useState<NextInSeriesResult | null>(null);
  const nextSeriesDismissedRef = React.useRef<Set<string>>(new Set());
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [actionsTarget, setActionsTarget] = React.useState<BookActionsTarget | null>(null);

  const openBookActions = React.useCallback((book: Book, context?: { shelfId?: number; shelfName?: string }) => {
    setActionsTarget({
      book,
      shelfId: context?.shelfId,
      shelfName: context?.shelfName,
    });
  }, []);
  const openDownloadedBookRef = React.useRef<(book: Book) => void>(() => {});
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
    setShelves,
    favoriteAuthors,
    setFavoriteAuthors,
    favoriteSeries,
    setFavoriteSeries,
  } = library;

  const [catalogSubTab, setCatalogSubTab] = React.useState<'books' | 'authors' | 'series' | 'genres'>('books');
  const [catalogSelectedAuthor, setCatalogSelectedAuthor] = React.useState<string | null>(null);
  const [catalogSelectedSeries, setCatalogSelectedSeries] = React.useState<string | null>(null);
  const [catalogSelectedSubgenre, setCatalogSelectedSubgenre] = React.useState<{ parent: string; name: string } | null>(null);
  const [catalogReturnTo, setCatalogReturnTo] = React.useState<AppTab | null>(null);

  useAppBackButton(() => snackbar.show('Ещё раз для выхода'));

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
    setCatalogReturnTo(returnTo);
  }, []);

  const handleCompleteCatalogReturn = React.useCallback(() => {
    const target = catalogReturnTo ?? 'home';
    setCatalogReturnTo(null);
    setCatalogSelectedAuthor(null);
    setCatalogSelectedSeries(null);
    setCatalogSelectedSubgenre(null);
    setActiveTab(target);
  }, [catalogReturnTo]);

  const handleTabChange = React.useCallback((tab: AppTab) => {
    setCatalogReturnTo(null);
    setActiveTab(tab);
  }, []);

  const [appTheme, setAppTheme] = React.useState<AppThemeMode>(() => {
    const saved = getAppSettingString(APP_SETTING_KEYS.theme);
    const valid: AppThemeMode[] = ['server', 'system', 'light', 'dark', 'sepia', 'auto'];
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
    return saved && valid.includes(saved as AppThemeMode) ? (saved as AppThemeMode) : 'server';
  });

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
    handleServerConfigChange,
    handleTestConnection,
    applyPairingLogin,
    isVerifyingConnection,
  } = useServerConnection();

  const inpxServer = useInpxServer(serverConfig, markServerDisconnected);
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
    const saved = getAppSettingString(APP_SETTING_KEYS.theme);
    if (saved && saved !== appTheme) {
      const valid: AppThemeMode[] = ['server', 'system', 'light', 'dark', 'sepia', 'auto'];
      if (valid.includes(saved as AppThemeMode)) {
        setAppTheme(saved as AppThemeMode);
      }
    }
  }, [libraryReady]);

  React.useEffect(() => {
    if (!libraryReady) return;
    setAppSettingRaw(APP_SETTING_KEYS.theme, appTheme);
  }, [appTheme, libraryReady]);

  React.useEffect(() => {
    if (!libraryReady) return;
    let cancelled = false;
    void (async () => {
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
      setStorageDirectoryReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [libraryReady]);

  React.useEffect(() => {
    if (serverConfig.connectionStatus !== 'connected') return;
    void fetchServerUiTheme(serverConfig).then(setServerUiTheme);
  }, [serverConfig.connectionStatus, serverConfig.url]);

  React.useEffect(() => {
    if (!libraryReady || !storageDirectoryReady) return;
    if (isValidStorageDirectory(storageDirectory)) {
      writeStoredStorageDirectory(storageDirectory);
    }
  }, [libraryReady, storageDirectoryReady, storageDirectory]);

  const profile = isOnline ? inpxServer.profile : null;
  // Never block Home on connection check — local recent is ready after library boot.
  // inpxServer.loading clears after fast profile fetch; heavy ID maps run in background.
  const profileLoading = isOnline ? inpxServer.loading : false;
  const profileError = isOnline ? inpxServer.error : '';
  const activeFavoriteAuthors = isOnline ? inpxServer.favoriteAuthors : favoriteAuthors;
  const activeFavoriteSeries = isOnline ? inpxServer.favoriteSeries : favoriteSeries;

  const [autoThemeTick, setAutoThemeTick] = React.useState(0);
  const isAppDark = React.useMemo(
    () => resolveIsDark(appTheme, serverUiTheme),
    [appTheme, serverUiTheme, autoThemeTick],
  );

  React.useEffect(() => {
    if (appTheme !== 'auto' && appTheme !== 'system') return;
    const interval = setInterval(() => setAutoThemeTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [appTheme]);

  const {
    pref: einkModePref,
    setPref: setEinkModePref,
    active: einkActive,
    detected: einkDetected,
  } = useEinkMode(libraryReady);

  React.useEffect(() => {
    if (einkActive) {
      // E-ink palette comes from html[data-eink="1"] CSS; keep stored color theme intact.
      clearServerThemeVars();
      document.documentElement.dataset.theme = 'light';
      void syncAndroidStatusBar(false, { eink: true });
      return;
    }
    applyAppThemeMode(appTheme, isAppDark);
    if (appTheme === 'server') {
      applyServerThemeVars(serverUiTheme, isAppDark);
    } else {
      clearServerThemeVars();
    }
    void syncAndroidStatusBar(isAppDark, { eink: false });
  }, [isAppDark, appTheme, serverUiTheme, einkActive]);

  const { enqueueDownload, downloadingId, queuedBookIds } = useDownloadPipeline({
    serverConfig,
    storageDirectory,
    canReadOnline,
    setDownloadedBooks,
    onOpenDownloadedBook: (book) => openDownloadedBookRef.current(book),
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
  });

  openDownloadedBookRef.current = bookActions.handleContinueBook;

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
    ready: serverConfigReady && libraryReady,
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
      handleNavigateToCatalog('authors', name, null, activeTab);
    },
    [activeTab, handleNavigateToCatalog, setDownloadPromptBook],
  );

  const handleOpenSeriesFromBook = React.useCallback(
    (name: string) => {
      setDownloadPromptBook(null);
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

  const { syncing, syncError, lastSyncSummary, handleSyncNow } = useAppSync({
    canReadOnline,
    serverConfig,
    connectionStatus: serverConfig.connectionStatus,
    downloadedBooksWithFile,
    inpxServer,
    activeReaderRef,
    onReaderStoreSynced: bumpReaderLocal,
  });

  const downloadJobs = useDownloadQueue();
  const queuedCount = React.useMemo(
    () => downloadJobs.filter((j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'saving').length,
    [downloadJobs],
  );
  const [pendingSyncCount, setPendingSyncCount] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getSyncPendingBreakdown(downloadedBookIdsWithFile).then((b) => {
        if (!cancelled) setPendingSyncCount(b.totalPending);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [downloadedBookIdsWithFile, syncing, lastSyncSummary]);

  const handleCloseReader = React.useCallback(async () => {
    const closed = await closeReader();
    if (!closed || !isOnline) return;
    const { bookId, progress } = closed;
    if (nextSeriesDismissedRef.current.has(bookId)) return;
    const markedRead = progress >= 99 || Boolean(inpxServer.readIds?.has(bookId));
    if (!markedRead) return;
    try {
      const readIds = new Set(inpxServer.readIds ?? []);
      readIds.add(bookId);
      const next = await resolveNextInSeries(serverConfig, bookId, readIds, {
        treatCurrentAsRead: true,
      });
      if (next) setNextSeriesResult(next);
    } catch {
      /* ignore */
    }
  }, [closeReader, inpxServer.readIds, isOnline, serverConfig]);

  const handleNextSeriesContinue = React.useCallback(
    (book: Book) => {
      void handleContinueBook(book);
    },
    [handleContinueBook],
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
      ) : activeReader ? (
        resolvedReaderFile ? (
          <div className="fixed inset-0 z-[200] flex flex-col min-h-0">
            <React.Suspense fallback={<ScreenLoader label="Загрузка читалки…" />}>
              <FoliateReader
                bookId={activeReader.bookId}
                bookTitle={activeReader.title}
                bookExt={activeReader.ext}
                initialPosition={activeReader.initialPosition}
                localFile={resolvedReaderFile}
                einkActive={einkActive}
                onClose={() => { void handleCloseReader(); }}
                onStoreSynced={bumpReaderLocal}
              />
            </React.Suspense>
          </div>
        ) : (
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
        )
      ) : (
        <AppShell
          activeTab={activeTab}
          onTabChange={handleTabChange}
          siteName={siteName}
          logoSrc={logoSrc}
          isOnline={isOnline}
          isVerifyingConnection={isVerifyingConnection}
          isSyncing={syncing}
          queuedCount={queuedCount}
          pendingSyncCount={pendingSyncCount}
          onOpenSyncCenter={() => setSyncCenterOpen(true)}
        >
          {activeTab === 'home' && (
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
              onOpenBook={openBookDetails}
              onOpenSync={() => setSyncCenterOpen(true)}
              lastSynced={inpxServer.lastSynced}
              fetchSectionBooks={isOnline ? inpxServer.fetchSectionBooks : undefined}
              onRefresh={isOnline ? () => inpxServer.refresh() : undefined}
              onGoCatalog={() => handleTabChange('catalog')}
              onBookLongPress={openBookActions}
            />
          )}

          <div className={`flex-1 min-h-0 flex flex-col h-full overflow-hidden ${activeTab !== 'catalog' ? 'hidden' : ''}`}>
            <React.Suspense fallback={<ScreenLoader label="Загрузка каталога…" />}>
              <CatalogTab
                serverConfig={serverConfig}
                onEnqueueDownload={handleDownloadBookFromUi}
                downloadedBookIds={downloadedBookIdsWithFile}
                downloadingId={downloadingId}
                queuedBookIds={queuedBookIds}
                onOpenBook={handleContinueBook}
                isTabActive={activeTab === 'catalog'}
                storageDirectory={storageDirectory}
                favoriteAuthors={activeFavoriteAuthors}
                onToggleFavoriteAuthor={handleToggleFavoriteAuthor}
                favoriteSeries={activeFavoriteSeries}
                onToggleFavoriteSeries={handleToggleFavoriteSeries}
                bookmarkIds={isOnline ? inpxServer.bookmarkIds : undefined}
                readIds={isOnline ? inpxServer.readIds : undefined}
                readingProgressByBookId={readingProgressByBookId}
                onToggleBookBookmark={handleToggleBookBookmark}
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
                onOpenSyncCenter={() => setSyncCenterOpen(true)}
                onBookLongPress={openBookActions}
              />
            </React.Suspense>
          </div>

          <div className={`flex-1 min-h-0 flex flex-col h-full overflow-hidden ${activeTab !== 'library' ? 'hidden' : ''}`}>
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
              shelves={isOnline ? inpxServer.shelves : []}
              favoriteAuthors={activeFavoriteAuthors}
              favoriteSeries={activeFavoriteSeries}
              favoriteAuthorItems={isOnline ? inpxServer.favoriteAuthorItems : undefined}
              favoriteSeriesItems={isOnline ? inpxServer.favoriteSeriesItems : undefined}
              fetchSectionBooks={isOnline ? inpxServer.fetchSectionBooks : undefined}
              loadShelfBooks={isOnline ? inpxServer.loadShelfBooks : undefined}
              onOpenBook={handleOpenBookCard}
              onContinueBook={handleContinueBook}
              onBookLongPress={openBookActions}
              onOpenAuthor={handleOpenAuthorFromProfile}
              onOpenSeries={handleOpenSeriesFromProfile}
              onRemoveShelf={handleRemoveShelfConfirmed}
              onGoCatalog={() => handleTabChange('catalog')}
              onGoProfile={() => handleTabChange('profile')}
              localReaderAnnotations={localReaderAnnotations}
              localReaderBookmarks={localReaderBookmarks}
              onOpenBookAtPosition={handleOpenBookAtPosition}
              onRemoveReaderAnnotation={handleRemoveReaderAnnotation}
              onUpdateReaderAnnotation={handleUpdateReaderAnnotation}
              onRemoveReaderBookmark={handleRemoveReaderBookmark}
              isTabActive={activeTab === 'library'}
            />
          </div>

          {activeTab === 'profile' && (
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
              appTheme={appTheme}
              onChangeTheme={setAppTheme}
              isAppDark={isAppDark}
              einkMode={einkModePref}
              onChangeEinkMode={setEinkModePref}
              einkDetected={einkDetected}
            />
          )}

          <SyncCenterSheet
            open={syncCenterOpen}
            onClose={() => setSyncCenterOpen(false)}
            isOnline={isOnline}
            lastSynced={inpxServer.lastSynced}
            onSyncNow={handleSyncNow}
            syncing={syncing}
            syncError={syncError}
            lastSyncSummary={lastSyncSummary}
            downloadedBookIds={downloadedBookIdsWithFile}
            serverConfig={serverConfig}
          />

          <NextInSeriesSheet
            open={Boolean(nextSeriesResult)}
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
              handleNavigateToCatalog('series', null, seriesName, 'home');
            }}
          />
        </AppShell>
      )}

      <BookDetailsSheet
        book={downloadPromptBook}
        onClose={() => {
          setDownloadPromptBook(null);
          setDownloadPromptError(null);
        }}
        serverConfig={serverConfig}
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
        bookmarkIds={isOnline ? inpxServer.bookmarkIds : undefined}
        readIds={isOnline ? inpxServer.readIds : undefined}
        onToggleBookBookmark={handleToggleBookBookmark}
        onToggleRead={handleToggleReadStatus}
        isAppDark={isAppDark}
        onOpenAuthor={handleOpenAuthorFromBook}
        onOpenSeries={handleOpenSeriesFromBook}
        hasPendingSync={
          downloadPromptBook
            ? downloadedBookIdsWithFile.includes(downloadPromptBook.id) && bookHasPendingSync(downloadPromptBook.id)
            : false
        }
        onOpenSyncCenter={() => {
          setSyncCenterOpen(true);
          setDownloadPromptBook(null);
        }}
        dragControls={bookDetailsDrag}
      />

      <BookActionsSheet
        target={actionsTarget}
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
        onToggleBookmark={handleToggleBookBookmark}
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
