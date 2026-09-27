import React from 'react';
import { BookOpen, AlertCircle, MoreVertical, Play, Loader2 } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { InpxProfile, mapServerBook, starsFromLibRate, fetchLibraryView, isAuthError, isUnreachableServerError } from '../lib/inpxClient';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { mergeRecentReadingLists, type LocalRecentReadingItem } from '../lib/localReadingProgress';
import { isBookDownloadInFlight, isBookFinished, resolveBookPrimaryAction, type BookPrimaryKind } from '../lib/bookOpenPolicy';
import ReadMark from './ReadMark';
import BookCover from './BookCover';
import ReadProgressBar from './ReadProgressBar';
import HorizontalBookShelf from './HorizontalBookShelf';
import CatalogBookList from './catalog/CatalogBookList';
import LibrarySectionPanel, { type LibrarySectionView } from './LibrarySectionPanel';
import Skeleton, { BookListSkeleton, BookShelfSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import IconButton from '../ui/IconButton';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import { useDownloadQueue } from '../hooks/useDownloadQueue';
import { textStyles, motion, radii, spacing } from '../ui/tokens';
import { bookTitleWithoutVolume, displayBookTitle, seriesLabel, seriesVolumeLabel } from '../lib/seriesLabel';
import { getHomeRecentMode } from '../lib/appSettings';
import type { CatalogViewMode } from '../lib/catalogViewMode';

const HERO_LONG_PRESS_MS = 420;

function HomeSectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className={`${textStyles.labelBold} tracking-wide ${theme.textMuted}`}>{title}</h3>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={`${textStyles.body} min-h-12 px-1 ${theme.accentText} ${theme.focusRing} ${motion.press} shrink-0`}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function HeroActionIcon({ kind }: { kind: BookPrimaryKind }) {
  if (kind === 'downloading') return <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />;
  return <Play className="w-4 h-4 fill-current shrink-0" aria-hidden />;
}

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
  readIds,
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
  readIds?: Set<string>;
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
        readIds={readIds}
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
      readIds={readIds}
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
  downloadedBookIds: string[];
  localRecentReading: LocalRecentReadingItem[];
  readingProgressByBookId: Record<string, number>;
  storageDirectory?: StorageDirectory | null;
  onOpenBook: (book: Book) => void;
  downloadingId?: string | null;
  queuedBookIds?: Set<string>;
  fetchSectionBooks?: (section: 'recent' | 'recommended', page?: number) => Promise<import('../lib/inpxClient').InpxBookItem[]>;
  onRefresh?: () => void | Promise<void>;
  onGoCatalog?: () => void;
  onGoProfile?: () => void;
  onSearchSubmit?: (query: string) => void;
  onSearchAuthor?: (name: string) => void;
  onSearchSeries?: (name: string) => void;
  onSearchBook?: (book: { id: string; title: string; authors?: string; authorsDisplay?: string }) => void;
  onBookLongPress?: (book: Book) => void;
  /** Shelf tap → storefront card (same as catalog). */
  onOpenDetails?: (book: Book) => void;
  isTabActive?: boolean;
  /** Bumped when Home tab is selected again — close «Показать всё» lists. */
  homeRootEpoch?: number;
  readIds?: Set<string>;
  onAuthExpired?: () => void;
  onConnectionLost?: () => void;
  /** Library name from the server, shown in the home header. */
  siteName: string;
}

export default function HomeTab({
  profile,
  loading,
  serverConfig,
  isAppDark,
  isOnline,
  downloadedBookIds,
  localRecentReading,
  readingProgressByBookId,
  storageDirectory,
  onOpenBook,
  downloadingId = null,
  queuedBookIds,
  fetchSectionBooks,
  onGoCatalog,
  onGoProfile,
  onBookLongPress,
  onOpenDetails,
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
  const [recentMode, setRecentMode] = React.useState(getHomeRecentMode);
  React.useEffect(() => {
    const onChange = () => setRecentMode(getHomeRecentMode());
    window.addEventListener('inpx-settings', onChange);
    return () => window.removeEventListener('inpx-settings', onChange);
  }, []);
  const downloadJobs = useDownloadQueue();
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

  const readAuthorKeys = React.useMemo(() => {
    const set = new Set<string>();
    for (const item of mergedRecent) {
      for (const part of (item.authorsDisplay || '').split(/[,:]/)) {
        const name = part.trim().toLowerCase();
        if (name) set.add(name);
      }
    }
    return set;
  }, [mergedRecent]);
  const visibleRecent = recentMode === 'fav'
    ? recentServer.filter((book) => {
        const author = (book.author || '').toLowerCase();
        if (!author || readAuthorKeys.size === 0) return false;
        for (const name of readAuthorKeys) {
          if (author.includes(name)) return true;
        }
        return false;
      })
    : recentServer;

  const hero = mergedRecent[0];
  const heroProgress = hero ? (readingProgressByBookId[hero.id] ?? hero.readProgress ?? 0) : 0;
  const heroFinished = hero ? isBookFinished(heroProgress, readIds?.has(hero.id)) : false;
  const heroBook = React.useMemo(
    () => (hero ? localRecentToBook(hero, serverConfig) : null),
    [hero, serverConfig],
  );
  const heroDownloading = Boolean(
    hero && isBookDownloadInFlight(hero.id, downloadingId, queuedBookIds),
  );
  const heroHasFile = Boolean(hero && downloadedBookIds.includes(hero.id));
  const heroAction = hero
    ? resolveBookPrimaryAction({
        hasFile: heroHasFile,
        isDownloading: heroDownloading,
        progress: heroProgress,
        isRead: readIds?.has(hero.id),
      })
    : null;
  const heroDownloadJob = hero
    ? downloadJobs.find(
        (job) =>
          job.id === hero.id &&
          (job.status === 'queued' || job.status === 'downloading' || job.status === 'saving'),
      )
    : undefined;
  const handleHeroTap = React.useCallback(() => {
    if (!heroBook || heroAction?.disabled) return;
    onOpenBook(heroBook);
  }, [heroBook, heroAction?.disabled, onOpenBook]);
  const handleHeroLongPress = React.useCallback(() => {
    if (heroBook) onBookLongPress?.(heroBook);
  }, [heroBook, onBookLongPress]);
  const heroPress = useHeroPressHandlers(handleHeroTap, onBookLongPress ? handleHeroLongPress : undefined);

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
    if (!fetchSectionBooks || !isOnline || recentMode === 'off') return;
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
  }, [fetchSectionBooks, isOnline, serverConfig, sectionKey, recentMode]);

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
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div data-large-title="" className="flex-1 overflow-y-auto inpx-page-scroll px-5 py-5 space-y-8" aria-busy aria-label="Загрузка главной">
          <Skeleton className="w-[7.5rem] aspect-[2/3]" />
          <div className="space-y-3">
            <Skeleton variant="block" blockSize="lg" className="max-w-[30%]" />
            {viewMode === 'list' ? <BookListSkeleton count={4} /> : <BookShelfSkeleton count={4} />}
          </div>
          <div className="space-y-3">
            <Skeleton variant="block" blockSize="lg" className="max-w-[35%]" />
            {viewMode === 'list' ? <BookListSkeleton count={4} /> : <BookShelfSkeleton count={4} />}
          </div>
        </div>
      </div>
    );
  }

  const heroSeriesName = hero ? seriesLabel(hero) : '';
  const heroVolume = hero ? seriesVolumeLabel(hero) : '';

  const scrollInner = (
    <>
      {hero && heroBook && heroAction ? (
        <section className="relative flex w-full min-w-0 max-w-full flex-col items-center text-center gap-3" aria-label={`Продолжить чтение: ${displayBookTitle(hero)}`}>
          {onBookLongPress ? (
            <IconButton
              label="Ещё действия"
              className="absolute top-0 right-0 shrink-0"
              onClick={() => onBookLongPress(heroBook)}
            >
              <MoreVertical className="w-5 h-5" aria-hidden />
            </IconButton>
          ) : null}
          <button
            type="button"
            className={`w-40 select-none touch-manipulation ${theme.focusRing} ${motion.press} disabled:opacity-70`}
            disabled={heroAction.disabled}
            aria-label={`${heroAction.kind === 'downloading' ? heroAction.label : 'Продолжить'}: ${displayBookTitle(hero)}`}
            {...heroPress}
          >
            <span className="book-cover w-full">
              <span className="book-cover-inner">
                <BookCover
                  bookId={hero.id}
                  serverConfig={serverConfig}
                  storageDirectory={storageDirectory}
                  variant="full"
                  title={hero.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {heroFinished ? <ReadMark /> : null}
              </span>
            </span>
          </button>
          <h3 className={`${textStyles.bookTitleHero} ${theme.text} line-clamp-2`}>{bookTitleWithoutVolume(hero)}</h3>
          <ReadProgressBar value={heroProgress} showLabel className="w-full" />
          {hero.authorsDisplay ? (
            <p className={`text-base font-medium ${theme.accentText}`}>{hero.authorsDisplay}</p>
          ) : null}
          {heroSeriesName ? (
            <p className={`${textStyles.caption} ${theme.textMuted}`}>
              {heroSeriesName}{heroVolume ? ` · том ${heroVolume}` : ''}
            </p>
          ) : null}
          {heroAction.kind === 'downloading' ? (
            <div className="flex w-full items-center gap-3">
              <div
                className="flex-1 min-w-0 h-1 rounded-full bg-[var(--app-progress-track,var(--app-border))] overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(heroDownloadJob?.progress ?? 0)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Прогресс скачивания"
              >
                <div
                  className={`h-full ${theme.progress}`}
                  style={{ width: `${Math.max(4, heroDownloadJob?.progress ?? 0)}%` }}
                />
              </div>
              <span className={`shrink-0 ${textStyles.caption} tabular-nums ${theme.textMuted}`}>
                {Math.round(heroDownloadJob?.progress ?? 0)}%
              </span>
            </div>
          ) : null}
          <button
            type="button"
            disabled={heroAction.disabled}
            onClick={handleHeroTap}
            className={`min-h-12 px-5 ${radii.button} ${textStyles.bodyBold} inline-flex items-center gap-1.5 ${theme.accentBg} disabled:opacity-60 ${motion.press} ${theme.focusRing}`}
          >
            <HeroActionIcon kind={heroAction.kind} />
            {heroAction.kind === 'downloading' ? heroAction.label : 'Продолжить'}
          </button>
        </section>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="Начните читать"
          description={
            isOnline
              ? 'Откройте каталог и выберите книгу'
              : 'Подключите сервер, чтобы искать и скачивать книги'
          }
          actionLabel={
            isOnline
              ? onGoCatalog
                ? 'Открыть каталог'
                : undefined
              : onGoProfile
                ? 'Подключить сервер'
                : undefined
          }
          onAction={isOnline ? onGoCatalog : onGoProfile}
          actionVariant="primary"
        />
      )}

      {isOnline && recentMode !== 'off' && (
        <section className="space-y-4">
          <HomeSectionHeader title="Новинки" actionLabel="Все" onAction={() => setSectionView('recent')} />
          {recentError && !recentLoading ? (
            <EmptyState
              compact
              tone="error"
              icon={AlertCircle}
              title="Не удалось загрузить новинки"
              description="Проверьте соединение с сервером."
              actionLabel="Повторить"
              actionVariant="secondary"
              onAction={() => setSectionKey((k) => k + 1)}
            />
          ) : (
            <HomeBookPreview
              books={visibleRecent}
              viewMode={viewMode}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              readingProgressByBookId={readingProgressByBookId}
              downloadedBookIds={downloadedBookIds}
              readIds={readIds}
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
          <HomeSectionHeader title="Рекомендации" actionLabel="Все" onAction={() => setSectionView('recommended')} />
          {recError && !recLoading ? (
            <EmptyState
              compact
              tone="error"
              icon={AlertCircle}
              title="Не удалось загрузить рекомендации"
              description="Проверьте соединение с сервером."
              actionLabel="Повторить"
              actionVariant="secondary"
              onAction={() => setSectionKey((k) => k + 1)}
            />
          ) : (
            <HomeBookPreview
              books={recommended}
              viewMode={viewMode}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              readingProgressByBookId={readingProgressByBookId}
              downloadedBookIds={downloadedBookIds}
              readIds={readIds}
              loading={recLoading}
              onBookClick={handleCatalogBookTap}
              onBookLongPress={onBookLongPress}
              emptyLabel="Пока нечего предложить — читайте и добавляйте в избранное"
            />
          )}
        </section>
      )}
    </>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className={`flex-1 min-h-0 overflow-y-auto inpx-page-scroll px-5 py-5 ${spacing.shelfY}`}>{scrollInner}</div>
    </div>
  );
}
