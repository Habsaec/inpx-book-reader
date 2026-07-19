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
import BookDetailsSheet from './components/catalog/BookDetailsSheet';
import AppShell, { type AppTab } from './components/AppShell';
import { MissingLocalBookFallback } from './components/MissingLocalBookFallback';
import { BRAND_LOCKUP_SRC } from './lib/brand';
import { useInpxServer } from './hooks/useInpxServer';
import { useAppBackButton } from './hooks/useAppBackButton';
import { useAndroidLaunch } from './hooks/useAndroidLaunch';
import { useServerBranding } from './hooks/useServerBranding';
import { useServerConnection } from './hooks/useServerConnection';
import { useLocalLibrary } from './hooks/useLocalLibrary';
import { useDownloadPipeline } from './hooks/useDownloadPipeline';
import { useAppSync } from './hooks/useAppSync';
import { useBookActions } from './hooks/useBookActions';
import { useLocalBookFileVerification } from './hooks/useLocalBookFileVerification';
import {
  ensureStorageDirectory,
  isValidStorageDirectory,
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
import { bookHasPendingSync } from './lib/syncStats';

const CatalogTab = React.lazy(() => import('./components/CatalogTab'));
const FoliateReader = React.lazy(() => import('./components/FoliateReader'));

export default function App() {
  const [activeTab, setActiveTab] = React.useState<AppTab>('home');
  const [syncCenterOpen, setSyncCenterOpen] = React.useState(false);
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

  useAppBackButton();

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
  const [storageDirectory, setStorageDirectory] = React.useState<StorageDirectory | null>(null);
  const [storageDirectoryReady, setStorageDirectoryReady] = React.useState(() => !isAndroid());

  const {
    serverConfig,
    serverConfigReady,
    connectionError,
    setConnectionError,
    markServerDisconnected,
    handleServerConfigChange,
    handleTestConnection,
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
      const stored = readStoredStorageDirectory();
      const resolved = await ensureStorageDirectory(stored);
      if (cancelled) return;
      if (resolved) setStorageDirectory(resolved);
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
  const profileLoading = isVerifyingConnection || (isOnline ? inpxServer.loading : false);
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

  React.useEffect(() => {
    applyAppThemeMode(appTheme, isAppDark);
    if (appTheme === 'server') {
      applyServerThemeVars(serverUiTheme, isAppDark);
    } else {
      clearServerThemeVars();
    }
    void syncAndroidStatusBar(isAppDark);
  }, [isAppDark, appTheme, serverUiTheme]);

  const { enqueueDownload, downloadingId, queuedBookIds } = useDownloadPipeline({
    serverConfig,
    storageDirectory,
    canReadOnline,
    setDownloadedBooks,
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

  useLocalBookFileVerification({
    enabled: libraryReady && storageDirectoryReady,
    downloadedBooks,
    setDownloadedBooks,
    storageDirectory,
    onStorageDirectoryResolved: setStorageDirectory,
    activeTab,
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
    handleOpenBookCard,
    handleContinueBook,
    handleOpenBookAtPosition,
    handleRemoveBook,
    removingBookIds,
    handleToggleFavoriteAuthor,
    handleToggleFavoriteSeries,
    handleToggleBookBookmark,
    handleToggleReadStatus,
    handleRemoveShelfConfirmed,
    handleRemoveReaderAnnotation,
    handleUpdateReaderAnnotation,
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
      await enqueueDownload(book);
    },
    [enqueueDownload, setDownloadPromptError],
  );

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
  });

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
                onClose={closeReader}
              />
            </React.Suspense>
          </div>
        ) : (
          <MissingLocalBookFallback title={activeReader.title} onBack={closeReader} />
        )
      ) : (
        <AppShell
          activeTab={activeTab}
          onTabChange={handleTabChange}
          siteName={siteName}
          logoSrc={logoSrc}
          isOnline={isOnline}
          isVerifyingConnection={isVerifyingConnection}
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
              />
            </React.Suspense>
          </div>

          {activeTab === 'library' && (
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
              shelves={isOnline ? inpxServer.shelves : []}
              favoriteAuthors={activeFavoriteAuthors}
              favoriteSeries={activeFavoriteSeries}
              fetchSectionBooks={isOnline ? inpxServer.fetchSectionBooks : undefined}
              loadShelfBooks={isOnline ? inpxServer.loadShelfBooks : undefined}
              onOpenBook={handleOpenBookCard}
              onContinueBook={handleContinueBook}
              onRemoveBook={handleRemoveBook}
              removingBookIds={removingBookIds}
              onDownloadBook={handleDownloadBookFromUi}
              onOpenAuthor={handleOpenAuthorFromProfile}
              onOpenSeries={handleOpenSeriesFromProfile}
              onRemoveShelf={handleRemoveShelfConfirmed}
              localReaderAnnotations={localReaderAnnotations}
              onOpenBookAtPosition={handleOpenBookAtPosition}
              onRemoveReaderAnnotation={handleRemoveReaderAnnotation}
              onUpdateReaderAnnotation={handleUpdateReaderAnnotation}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileScreen
              profile={profile}
              loading={profileLoading}
              error={profileError}
              isOnline={isOnline}
              serverConfig={serverConfig}
              onChangeServerConfig={handleServerConfigChange}
              onTestConnection={handleTestConnection}
              onForgetServer={() => setConnectionError(null)}
              connectionError={connectionError}
              lastSynced={inpxServer.lastSynced}
              storageDirectory={storageDirectory}
              onChangeStorageDirectory={setStorageDirectory}
              appTheme={appTheme}
              onChangeTheme={setAppTheme}
              isAppDark={isAppDark}
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
          void handleContinueBook(book);
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
    </MobileFrame>
  );
}
