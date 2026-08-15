import React from 'react';
import { BookOpen, Play, WifiOff, AlertCircle, RefreshCw, Star } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { InpxProfile, mapServerBook, starsFromLibRate, fetchLibraryView, isAuthError, isUnreachableServerError } from '../lib/inpxClient';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { mergeRecentReadingLists, type LocalRecentReadingItem } from '../lib/localReadingProgress';
import BookCover from './BookCover';
import ReadProgressBar from './ReadProgressBar';
import HorizontalBookShelf from './HorizontalBookShelf';
import CatalogBookList from './catalog/CatalogBookList';
import LibrarySectionPanel, { type LibrarySectionView } from './LibrarySectionPanel';
import PullToRefresh from './PullToRefresh';
import Skeleton, { BookListSkeleton, BookShelfSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import DownloadQueueWidget from './DownloadQueueWidget';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import { textStyles, motion, semantic, radii, elevation } from '../ui/tokens';
import type { CatalogViewMode } from '../lib/catalogViewMode';

const HERO_LONG_PRESS_MS = 420;

function useHeroPressHandlers(onTap: () => void, onLongPress?: () => void) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = React.useRef(false);

  const clear = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  React.useEffect(() => () => clear(), [clear]);

  return {
    onClick: () => {
      if (fired.current) {
        fired.current = false;
        return;
      }
      onTap();
    },
    onPointerDown: () => {
      if (!onLongPress) return;
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, HERO_LONG_PRESS_MS);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  };
}

function localRecentToBook(item: LocalRecentReadingItem, config: ServerConfig): Book {
  return {
    id: item.id,
    title: item.title,
    author: item.authorsDisplay,
    ext: item.ext,
    series: item.series,
    seriesNo: item.seriesNo,
    contentUrl: `${config.url}/api/books/${item.id}/content`,
    coverUrl: `${config.url}/api/books/${item.id}/cover-thumb`,
    readProgress: item.readProgress,
    ...(item.rating && item.rating > 0 ? { rating: item.rating } : {}),
  };
}

function HomeBookPreview({
  books,
  viewMode,
  serverConfig,
  storageDirectory,
  readingProgressByBookId,
  downloadedBookIds,
  loading = false,
  onBookClick,
  onBookLongPress,
  emptyLabel,
}: {
  books: Book[];
  viewMode: CatalogViewMode;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  readingProgressByBookId?: Record<string, number>;
  downloadedBookIds: string[];
  loading?: boolean;
  onBookClick: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  emptyLabel?: string;
}) {
  if (viewMode === 'list') {
    if (loading) {
      return <BookListSkeleton count={5} />;
    }
    if (books.length === 0) {
      if (!emptyLabel) return null;
      return <p className={`${textStyles.caption} ${theme.textMuted} py-2`}>{emptyLabel}</p>;
    }
    return (
      <CatalogBookList
        books={books}
        viewMode="list"
        serverConfig={serverConfig}
        storageDirectory={storageDirectory}
        downloadedBookIds={downloadedBookIds}
        readingProgressByBookId={readingProgressByBookId}
        virtualizeList={false}
        onBookClick={onBookClick}
        onBookLongPress={onBookLongPress}
      />
    );
  }

  return (
    <HorizontalBookShelf
      books={books}
      serverConfig={serverConfig}
      storageDirectory={storageDirectory}
      readingProgressByBookId={readingProgressByBookId}
      downloadedBookIds={downloadedBookIds}
      loading={loading}
      onBookClick={onBookClick}
      onBookLongPress={onBookLongPress}
      emptyLabel={emptyLabel}
    />
  );
}

interface HomeTabProps {
  profile: InpxProfile | null;
  loading: boolean;
  serverConfig: ServerConfig;
  isAppDark: boolean;
  isOnline: boolean;
  isVerifyingConnection?: boolean;
  downloadedBookIds: string[];
  localRecentReading: LocalRecentReadingItem[];
  readingProgressByBookId: Record<string, number>;
  storageDirectory?: StorageDirectory | null;
  onContinueBook: (book: Book) => void;
  onOpenBook: (book: Book) => void;
  /** Short tap on a shelf/card → details sheet. Hero long-press also opens details. */
  onOpenDetails?: (book: Book) => void;
  fetchSectionBooks?: (section: 'recent' | 'recommended', page?: number) => Promise<import('../lib/inpxClient').InpxBookItem[]>;
  onRefresh?: () => void | Promise<void>;
  onGoCatalog?: () => void;
  onBookLongPress?: (book: Book) => void;
  isTabActive?: boolean;
  /** Bumped when Home tab is selected again — close «Показать всё» lists. */
  homeRootEpoch?: number;
  readIds?: Set<string>;
  onAuthExpired?: () => void;
  onConnectionLost?: () => void;
}

export default function HomeTab({
  profile,
  loading,
  serverConfig,
  isAppDark,
  isOnline,
  isVerifyingConnection,
  downloadedBookIds,
  localRecentReading,
  readingProgressByBookId,
  storageDirectory,
  onContinueBook,
  onOpenBook,
  onOpenDetails,
  fetchSectionBooks,
  onRefresh,
  onGoCatalog,
  onBookLongPress,
  isTabActive = true,
  homeRootEpoch = 0,
  readIds,
  onAuthExpired,
  onConnectionLost,
}: HomeTabProps) {
  const [recommended, setRecommended] = React.useState<Book[]>([]);
  const [recLoading, setRecLoading] = React.useState(true);
  const [recError, setRecError] = React.useState(false);
  const [recentServer, setRecentServer] = React.useState<Book[]>([]);
  const [recentLoading, setRecentLoading] = React.useState(false);
  const [recentError, setRecentError] = React.useState(false);
  const [sectionKey, setSectionKey] = React.useState(0);
  const [sectionView, setSectionView] = React.useState<LibrarySectionView | null>(null);
  const { viewMode } = useCatalogViewMode('home');
  const homeRootEpochSeen = React.useRef(homeRootEpoch);

  React.useEffect(() => {
    if (homeRootEpochSeen.current === homeRootEpoch) return;
    homeRootEpochSeen.current = homeRootEpoch;
    setSectionView(null);
  }, [homeRootEpoch]);

  const handleCatalogBookTap = React.useCallback(
    (book: Book) => {
      if (onOpenDetails) {
        onOpenDetails(book);
        return;
      }
      onOpenBook(book);
    },
    [onOpenBook, onOpenDetails],
  );

  const mergedRecent = React.useMemo(() => {
    const fromProfile = profile?.recentBooks?.map((b) => {
      const rating = starsFromLibRate(b.libRate);
      const item: LocalRecentReadingItem = {
        id: b.id,
        title: b.title,
        authorsDisplay: b.authorsDisplay || '',
        ext: (b.ext || 'fb2').replace(/^\./, ''),
        readProgress: b.readProgress != null ? Math.round(Number(b.readProgress)) : 0,
        lastOpenedAt: b.lastOpenedAt || new Date(0).toISOString(),
        series: b.series?.trim() || undefined,
        seriesNo: b.seriesNo != null ? Number(b.seriesNo) : undefined,
        ...(rating ? { rating } : {}),
      };
      return item;
    }) ?? [];
    return mergeRecentReadingLists(fromProfile, localRecentReading);
  }, [profile, localRecentReading]);

  const hero = mergedRecent[0];
  const others = mergedRecent.slice(1, 8).map((item) => localRecentToBook(item, serverConfig));
  const heroProgress = hero ? (readingProgressByBookId[hero.id] ?? hero.readProgress ?? 0) : 0;
  const heroRating = hero?.rating && hero.rating > 0 ? hero.rating : 0;
  const heroBook = React.useMemo(
    () => (hero ? localRecentToBook(hero, serverConfig) : null),
    [hero, serverConfig],
  );
  const handleHeroTap = React.useCallback(() => {
    if (heroBook) onContinueBook(heroBook);
  }, [heroBook, onContinueBook]);
  const handleHeroLongPress = React.useCallback(() => {
    if (heroBook) onOpenDetails?.(heroBook);
  }, [heroBook, onOpenDetails]);
  const heroPress = useHeroPressHandlers(handleHeroTap, onOpenDetails ? handleHeroLongPress : undefined);

  React.useEffect(() => {
    if (!fetchSectionBooks || !isOnline) return;
    let cancelled = false;
    let pollTimer: number | undefined;
    setRecLoading(true);
    setRecError(false);

    const load = async (attempt = 0) => {
      let waitingForPoll = false;
      try {
        const res = await fetchLibraryView(serverConfig, 'recommended', 1, 24);
        if (cancelled) return;
        if (res.computing) {
          setRecLoading(true);
          if (attempt < 15) {
            waitingForPoll = true;
            pollTimer = window.setTimeout(() => {
              pollTimer = undefined;
              void load(attempt + 1);
            }, 2000);
            return;
          }
          setRecommended([]);
          setRecError(true);
          return;
        }
        setRecommended((res.items || []).slice(0, 8).map((b) => mapServerBook(b, serverConfig)));
        setRecError(false);
      } catch (e) {
        if (cancelled) return;
        setRecommended([]);
        setRecError(true);
        if (isAuthError(e)) onAuthExpired?.();
        else if (isUnreachableServerError(e)) onConnectionLost?.();
      } finally {
        if (!cancelled && !waitingForPoll) setRecLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [fetchSectionBooks, isOnline, serverConfig, sectionKey, onAuthExpired, onConnectionLost]);

  React.useEffect(() => {
    if (!fetchSectionBooks || !isOnline) return;
    let cancelled = false;
    setRecentLoading(true);
    setRecentError(false);
    fetchSectionBooks('recent', 1)
      .then((items) => {
        if (cancelled) return;
        setRecentServer(items.slice(0, 8).map((b) => mapServerBook(b, serverConfig)));
      })
      .catch(() => {
        if (cancelled) return;
        setRecentServer([]);
        setRecentError(true);
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchSectionBooks, isOnline, serverConfig, sectionKey]);

  const handleRefresh = React.useCallback(async () => {
    setSectionKey((k) => k + 1);
    await onRefresh?.();
  }, [onRefresh]);

  const closeSectionView = React.useCallback(() => setSectionView(null), []);

  if (sectionView) {
    return (
      <LibrarySectionPanel
        view={sectionView}
        serverConfig={serverConfig}
        storageDirectory={storageDirectory}
        downloadedBookIds={downloadedBookIds}
        readingProgressByBookId={readingProgressByBookId}
        readIds={readIds}
        isAppDark={isAppDark}
        isTabActive={isTabActive}
        onClose={closeSectionView}
        onOpenBook={onOpenBook}
        onOpenDetails={onOpenDetails}
        onBookLongPress={onBookLongPress}
        onAuthExpired={onAuthExpired}
        onConnectionLost={onConnectionLost}
      />
    );
  }

  // Full-page skeleton only when there is nothing local to show yet.
  // During connection check / fast sync, hero from localRecent must appear immediately.
  if (loading && mergedRecent.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6" aria-busy aria-label="Загрузка главной">
        {viewMode === 'list' ? (
          <Skeleton className="w-full h-28 rounded-xl" />
        ) : (
          <Skeleton className="w-full aspect-[16/9] min-h-[11rem] max-h-60" />
        )}
        <div className="space-y-3">
          <Skeleton variant="block" blockSize="lg" className="max-w-[30%]" />
          {viewMode === 'list' ? <BookListSkeleton count={4} /> : <BookShelfSkeleton count={4} />}
        </div>
        <div className="space-y-3">
          <Skeleton variant="block" blockSize="lg" className="max-w-[35%]" />
          {viewMode === 'list' ? <BookListSkeleton count={4} /> : <BookShelfSkeleton count={4} />}
        </div>
      </div>
    );
  }

  const scrollInner = (
    <>
      {hero ? (
        viewMode === 'list' ? (
          <button
            type="button"
            className={`w-full text-left select-none touch-manipulation ${radii.lg} ${theme.card} ${elevation.card} px-5 py-4 space-y-3 ${motion.press} ${theme.focusRing}`}
            {...heroPress}
            aria-label={`Продолжить: ${hero.title}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={`${textStyles.captionBold} ${theme.accentText}`}>Продолжить чтение</p>
              {heroRating > 0 ? (
                <span className={`shrink-0 text-xs tracking-tight ${semantic.warning}`} aria-label={`Рейтинг ${heroRating}`}>
                  {'★'.repeat(heroRating)}
                </span>
              ) : null}
            </div>
            <h3 className={`${textStyles.bookTitle} ${theme.text} line-clamp-2`}>{hero.title}</h3>
            {hero.authorsDisplay ? (
              <p className={`${textStyles.caption} ${theme.textMuted} truncate`}>{hero.authorsDisplay}</p>
            ) : null}
            <div className="flex items-center gap-3 pt-0.5">
              {heroProgress > 0 ? (
                <div className="flex-1 min-w-0">
                  <ReadProgressBar value={heroProgress} showLabel />
                </div>
              ) : (
                <span className="flex-1" />
              )}
              <span className={`shrink-0 inline-flex items-center gap-1 ${textStyles.captionBold} ${theme.accentText}`}>
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden />
                Продолжить
              </span>
            </div>
          </button>
        ) : (
          <button
            type="button"
            className={`relative overflow-hidden select-none touch-manipulation ${radii.lg} text-left w-full ${elevation.hero} ${motion.press} ${theme.focusRing}`}
            {...heroPress}
            aria-label={`Продолжить: ${hero.title}`}
          >
            <div className="relative w-full aspect-[16/9] min-h-[11rem] max-h-60 bg-[var(--app-surface)]">
              <BookCover
                bookId={hero.id}
                serverConfig={serverConfig}
                storageDirectory={storageDirectory}
                variant="full"
                title={hero.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className={`absolute inset-0 bg-gradient-to-t ${isAppDark ? 'from-[var(--app-bg)] via-[var(--app-bg)]/55 to-transparent' : 'from-black/85 via-black/45 to-transparent'}`} />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent inpx-hero-shine"
              />
              <div className="absolute bottom-0 left-0 right-0 p-5 z-10 text-white">
                <div className="flex items-center gap-2 mb-1">
                  <p className={`${textStyles.caption} opacity-80`}>Продолжить чтение</p>
                  {heroRating > 0 && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5"
                      aria-label={`Рейтинг ${heroRating} из 5`}
                    >
                      <Star className={`w-3 h-3 fill-current ${semantic.warning}`} aria-hidden />
                      <span className={`${textStyles.microBold} tabular-nums leading-none`}>{heroRating}</span>
                    </span>
                  )}
                </div>
                <h3 className={`${textStyles.bookTitleHero} text-white line-clamp-2`}>{hero.title}</h3>
                <p className={`${textStyles.caption} opacity-90 mt-0.5 truncate`}>{hero.authorsDisplay}</p>
                <div className="flex items-center gap-3 mt-3">
                  {heroProgress > 0 && (
                    <div className="flex-1 min-w-0">
                      <ReadProgressBar
                        value={heroProgress}
                        showLabel={false}
                        className="[&>div:first-child]:bg-white/25"
                      />
                    </div>
                  )}
                  <span className={`shrink-0 px-4 py-2.5 ${radii.button} ${textStyles.caption} font-semibold inline-flex items-center gap-1.5 ${theme.accentBg}`}>
                    <Play className="w-4 h-4 fill-current" aria-hidden /> Продолжить
                  </span>
                </div>
              </div>
            </div>
          </button>
        )
      ) : (
        <EmptyState
          icon={BookOpen}
          title="Начните читать"
          description="Найдите книгу в поиске или откройте скачанную из библиотеки"
          actionLabel={onGoCatalog ? 'Открыть поиск' : undefined}
          onAction={onGoCatalog}
          actionVariant="primary"
        />
      )}

      <DownloadQueueWidget compact />

      {others.length > 0 && (
        <section className="space-y-4">
          <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>Недавно</h3>
          <HomeBookPreview
            books={others}
            viewMode={viewMode}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            readingProgressByBookId={readingProgressByBookId}
            downloadedBookIds={downloadedBookIds}
            onBookClick={handleCatalogBookTap}
            onBookLongPress={onBookLongPress}
          />
        </section>
      )}

      {isOnline && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>Новинки</h3>
            <button
              type="button"
              onClick={() => setSectionView('recent')}
              className={`${textStyles.captionBold} min-h-12 px-4 ${theme.accentText} ${theme.accentMuted} ${radii.button} ${theme.focusRing} ${motion.press} shrink-0`}
            >
              Показать всё
            </button>
          </div>
          {recentError && !recentLoading ? (
            <div className={`flex items-center justify-between gap-2 py-2 ${textStyles.caption} ${semantic.error}`}>
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                Не удалось загрузить новинки
              </span>
              <button
                type="button"
                onClick={() => setSectionKey((k) => k + 1)}
                className={`shrink-0 inline-flex items-center gap-1 font-bold underline ${theme.focusRing}`}
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                Повторить
              </button>
            </div>
          ) : (
            <HomeBookPreview
              books={recentServer}
              viewMode={viewMode}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              readingProgressByBookId={readingProgressByBookId}
              downloadedBookIds={downloadedBookIds}
              loading={recentLoading}
              onBookClick={handleCatalogBookTap}
              onBookLongPress={onBookLongPress}
              emptyLabel="Пока нет новинок"
            />
          )}
        </section>
      )}

      {isOnline && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>Рекомендации</h3>
            <button
              type="button"
              onClick={() => setSectionView('recommended')}
              className={`${textStyles.captionBold} min-h-12 px-4 ${theme.accentText} ${theme.accentMuted} ${radii.button} ${theme.focusRing} ${motion.press} shrink-0`}
            >
              Показать всё
            </button>
          </div>
          {recError && !recLoading ? (
            <div className={`flex items-center justify-between gap-2 py-2 ${textStyles.caption} ${semantic.error}`}>
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                Не удалось загрузить рекомендации
              </span>
              <button
                type="button"
                onClick={() => setSectionKey((k) => k + 1)}
                className={`shrink-0 inline-flex items-center gap-1 font-bold underline ${theme.focusRing}`}
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                Повторить
              </button>
            </div>
          ) : (
            <HomeBookPreview
              books={recommended}
              viewMode={viewMode}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              readingProgressByBookId={readingProgressByBookId}
              downloadedBookIds={downloadedBookIds}
              loading={recLoading}
              onBookClick={handleCatalogBookTap}
              onBookLongPress={onBookLongPress}
              emptyLabel="Пока нечего предложить — читайте и добавляйте в избранное"
            />
          )}
        </section>
      )}

      {!isOnline && !isVerifyingConnection && (
        <p className={`${textStyles.caption} ${semantic.offline} flex items-center gap-2`}>
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden />
          Офлайн — доступны скачанные книги
        </p>
      )}
    </>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {onRefresh ? (
        <PullToRefresh onRefresh={handleRefresh} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-6">
          {scrollInner}
        </PullToRefresh>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">{scrollInner}</div>
      )}
    </div>
  );
}
