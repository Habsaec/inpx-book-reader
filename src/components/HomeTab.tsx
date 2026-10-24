import React from 'react';
import { BookOpen, AlertCircle, ChevronRight, Download, MoreVertical, Play, Loader2 } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { InpxProfile, mapServerBook, starsFromLibRate, fetchLibraryView, fetchHomeShelves, isAuthError, isUnreachableServerError, bookContentUrl, displayCoverUrl } from '../lib/inpxClient';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { mergeRecentReadingLists, type LocalRecentReadingItem } from '../lib/localReadingProgress';
import { isBookDownloadInFlight, isBookFinished, resolveBookPrimaryAction, type BookPrimaryKind } from '../lib/bookOpenPolicy';
import ReadMark from './ReadMark';
import BookCover from './BookCover';
import ReadProgressBar from './ReadProgressBar';
import BookShelfGrid from './BookShelfGrid';
import CatalogBookList from './catalog/CatalogBookList';
import LibrarySectionPanel, { type LibrarySectionView } from './LibrarySectionPanel';
import HomeShelfPanel, { type HomeShelfRef } from './HomeShelfPanel';
import Skeleton, { BookListSkeleton, BookShelfSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import IconButton from '../ui/IconButton';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import { useDownloadQueue } from '../hooks/useDownloadQueue';
import { useLongPress } from '../hooks/useLongPress';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { textStyles, motion, radii, spacing } from '../ui/tokens';
import { bookTitleWithoutVolume, displayBookTitle, seriesLabel, seriesVolumeLabel } from '../lib/seriesLabel';
import { getHomeRecentMode } from '../lib/appSettings';
import type { CatalogViewMode } from '../lib/catalogViewMode';

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
    <div className="flex min-h-12 items-center justify-between gap-3 -mb-1">
      <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>{title}</h3>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={`${textStyles.bodyBold} min-h-12 -mr-2 pl-2 pr-1 inline-flex items-center ${theme.accentText} ${theme.focusRing} ${motion.press} shrink-0`}
        >
          {actionLabel}
          <ChevronRight className="w-4 h-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function HeroActionIcon({ kind }: { kind: BookPrimaryKind }) {
  if (kind === 'downloading') return <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />;
  if (kind === 'download') return <Download className="w-4 h-4 shrink-0" aria-hidden />;
  return <Play className="w-4 h-4 fill-current shrink-0" aria-hidden />;
}

/** Wide Home (landscape tablets): two more books in progress sit beside «Продолжить чтение». */
const WIDE_HERO_QUERY = '(min-width: 1000px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(() => window.matchMedia(query).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function SideRecentBook({
  book,
  progress,
  serverConfig,
  storageDirectory,
  onOpen,
  onLongPress,
}: {
  book: Book;
  progress: number;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  onOpen: () => void;
  onLongPress?: () => void;
}) {
  const press = useLongPress(onOpen, onLongPress);
  return (
    <button
      type="button"
      {...press}
      className={`w-full flex items-center gap-3.5 py-2 text-left select-none ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
    >
      <span className="book-cover w-14 shrink-0">
        <span className="book-cover-inner">
          <BookCover
            bookId={book.id}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            title={bookTitleWithoutVolume(book)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </span>
      </span>
      <span className="flex-1 min-w-0 space-y-1">
        <span className={`block ${textStyles.bodyBold} ${theme.text} line-clamp-2`}>{displayBookTitle(book)}</span>
        {book.author ? <span className={`block ${textStyles.caption} ${theme.textMuted} truncate`}>{book.author}</span> : null}
        <ReadProgressBar value={progress} showLabel className="w-full" />
      </span>
    </button>
  );
}

function localRecentToBook(item: LocalRecentReadingItem, config: ServerConfig): Book {
  return {
    id: item.id,
    title: item.title,
    author: item.authorsDisplay,
    ext: item.ext,
    series: item.series,
    seriesNo: item.seriesNo,
    contentUrl: bookContentUrl(config, item.id),
    coverUrl: displayCoverUrl(config, item.id, 'thumb'),
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
  maxRows = 1,
}: {
  books: Book[];
  maxRows?: number;
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
    <BookShelfGrid
      books={books}
      serverConfig={serverConfig}
      storageDirectory={storageDirectory}
      readingProgressByBookId={readingProgressByBookId}
      downloadedBookIds={downloadedBookIds}
      readIds={readIds}
      loading={loading}
      maxRows={maxRows}
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
  /** Bumped when the server shelf list changes — reload pinned home shelves. */
  homeShelvesEpoch?: number;
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
  onRefresh,
  onGoCatalog,
  onGoProfile,
  onBookLongPress,
  onOpenDetails,
  isTabActive = true,
  homeRootEpoch = 0,
  homeShelvesEpoch = 0,
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
  const [homeShelves, setHomeShelves] = React.useState<Array<{ key: string; ref: HomeShelfRef; books: Book[] }>>([]);
  const [openShelf, setOpenShelf] = React.useState<HomeShelfRef | null>(null);
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

  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Re-tap on «Главная»: close «Все» lists; already at the root — scroll up and reload.
  React.useEffect(() => {
    if (homeRootEpochSeen.current === homeRootEpoch) return;
    homeRootEpochSeen.current = homeRootEpoch;
    if (sectionView || openShelf) {
      setSectionView(null);
      setOpenShelf(null);
      return;
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    if (!isOnline) return;
    setSectionKey((k) => k + 1);
    void onRefresh?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the re-tap only
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
  const visibleRecent = (recentMode === 'fav'
    ? recentServer.filter((book) => {
        const author = (book.author || '').toLowerCase();
        if (!author || readAuthorKeys.size === 0) return false;
        for (const name of readAuthorKeys) {
          if (author.includes(name)) return true;
        }
        return false;
      })
    : recentServer).slice(0, 8);

  const hero = mergedRecent[0];
  const heroProgress = hero ? (readingProgressByBookId[hero.id] ?? hero.readProgress ?? 0) : 0;
  const heroFinished = hero ? isBookFinished(heroProgress, readIds?.has(hero.id)) : false;
  const heroBook = React.useMemo(
    () => (hero ? localRecentToBook(hero, serverConfig) : null),
    [hero, serverConfig],
  );
  const wideHero = useMediaQuery(WIDE_HERO_QUERY);
  const recentBooks = React.useMemo(
    () => mergedRecent.slice(1, 11).map((item) => localRecentToBook(item, serverConfig)),
    [mergedRecent, serverConfig],
  );
  const sideRecent = wideHero ? recentBooks.slice(0, 2) : [];
  const moreRecent = wideHero ? recentBooks.slice(2) : recentBooks;
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
  const heroPress = useLongPress(handleHeroTap, onBookLongPress ? handleHeroLongPress : undefined);

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
    fetchHomeShelves(serverConfig)
      .then((shelves) => {
        if (cancelled) return;
        const next = shelves.map((shelf) => ({
          key: `${shelf.kind}:${shelf.id}`,
          ref: { id: shelf.id, kind: shelf.kind, title: shelf.title },
          books: shelf.items.map((b) => mapServerBook(b, serverConfig)),
        }));
        setHomeShelves(next);
        setOpenShelf((current) => (
          current && next.some((shelf) => shelf.key === `${current.kind}:${current.id}`) ? current : null
        ));
      })
      .catch(() => {
        // Как на веб-главной: недоступные полки просто не показываются.
        if (!cancelled) setHomeShelves([]);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchSectionBooks, isOnline, serverConfig, sectionKey, homeShelvesEpoch]);

  React.useEffect(() => {
    if (!fetchSectionBooks || !isOnline || recentMode === 'off') return;
    let cancelled = false;
    setRecentLoading(true);
    setRecentError(false);
    fetchSectionBooks('recent', 1)
      .then((items) => {
        if (cancelled) return;
        // Keep the whole first page: «Мои авторы» filters it before the preview is cut to 8.
        setRecentServer(items.map((b) => mapServerBook(b, serverConfig)));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setRecentServer([]);
        setRecentError(true);
        if (isAuthError(e)) onAuthExpired?.();
        else if (isUnreachableServerError(e)) onConnectionLost?.();
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchSectionBooks, isOnline, serverConfig, sectionKey, recentMode, onAuthExpired, onConnectionLost]);

  const pullRefresh = usePullToRefresh(
    isOnline
      ? () => {
          setSectionKey((k) => k + 1);
          return onRefresh?.();
        }
      : undefined,
  );

  const closeSectionView = React.useCallback(() => setSectionView(null), []);
  const closeShelf = React.useCallback(() => setOpenShelf(null), []);

  if (openShelf) {
    return (
      <HomeShelfPanel
        shelf={openShelf}
        serverConfig={serverConfig}
        storageDirectory={storageDirectory}
        downloadedBookIds={downloadedBookIds}
        readingProgressByBookId={readingProgressByBookId}
        readIds={readIds}
        isAppDark={isAppDark}
        isTabActive={isTabActive}
        onClose={closeShelf}
        onOpenBook={onOpenBook}
        onOpenDetails={onOpenDetails}
        onBookLongPress={onBookLongPress}
        onAuthExpired={onAuthExpired}
        onConnectionLost={onConnectionLost}
      />
    );
  }

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
      <div className={sideRecent.length > 0 ? 'grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-10 items-start' : ''}>
      {hero && heroBook && heroAction ? (
        <section
          className="relative flex w-full min-w-0 max-w-full gap-[1.125rem] pt-3"
          aria-label={`Продолжить чтение: ${displayBookTitle(hero)}`}
        >
          <button
            type="button"
            className={`w-28 min-[600px]:w-[9.5rem] shrink-0 self-start select-none touch-manipulation ${theme.focusRing} ${motion.press} disabled:opacity-70`}
            disabled={heroAction.disabled}
            aria-label={`${heroAction.kind === 'reread' ? 'Читать снова' : heroAction.label}: ${displayBookTitle(hero)}`}
            {...heroPress}
          >
            <span className="book-cover w-full">
              <span className="book-cover-inner">
                <BookCover
                  bookId={hero.id}
                  serverConfig={serverConfig}
                  storageDirectory={storageDirectory}
                  variant="full"
                  title={bookTitleWithoutVolume(hero)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {heroFinished ? <ReadMark /> : null}
              </span>
            </span>
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-2">
              <p className={`${textStyles.microBold} ${theme.accentText}`}>Продолжить чтение</p>
              {onBookLongPress ? (
                <IconButton
                  label="Ещё действия"
                  className="-my-3 -mr-3 shrink-0"
                  onClick={() => onBookLongPress(heroBook)}
                >
                  <MoreVertical className="w-5 h-5" aria-hidden />
                </IconButton>
              ) : null}
            </div>
            <h3 className={`mt-1.5 font-serif text-[1.375rem] leading-7 font-semibold line-clamp-2 [overflow-wrap:break-word] hyphens-manual ${theme.text}`}>
              {bookTitleWithoutVolume(hero)}
            </h3>
            {hero.authorsDisplay ? (
              <p className={`mt-1 ${textStyles.caption} ${theme.textMuted} line-clamp-1`}>{hero.authorsDisplay}</p>
            ) : null}
            {heroSeriesName ? (
              <p className={`${textStyles.caption} ${theme.textMuted} line-clamp-1`}>
                {heroSeriesName}{heroVolume ? ` · том ${heroVolume}` : ''}
              </p>
            ) : null}
            <div className="mt-auto pt-3 space-y-3">
              {heroAction.kind === 'downloading' ? (
                <div className="flex w-full items-center gap-2">
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
                  <span className={`shrink-0 ${textStyles.microBold} tabular-nums ${theme.textMuted}`}>
                    {Math.round(heroDownloadJob?.progress ?? 0)}%
                  </span>
                </div>
              ) : (
                <ReadProgressBar value={heroProgress} showLabel className="w-full" />
              )}
              <button
                type="button"
                disabled={heroAction.disabled}
                onClick={handleHeroTap}
                className={`min-h-12 px-5 ${radii.button} ${textStyles.bodyBold} inline-flex items-center gap-2 ${theme.accentBg} disabled:opacity-60 ${motion.press} ${theme.focusRing}`}
              >
                <HeroActionIcon kind={heroAction.kind} />
                {heroAction.kind === 'reread' ? 'Читать снова' : heroAction.label}
              </button>
            </div>
          </div>
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
      {sideRecent.length > 0 ? (
        <section className="pt-3" aria-label="Также читаете">
          <p className={`${textStyles.microBold} ${theme.textMuted} mb-1`}>Также читаете</p>
          {sideRecent.map((book) => (
            <SideRecentBook
              key={book.id}
              book={book}
              progress={readingProgressByBookId[book.id] ?? book.readProgress ?? 0}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              onOpen={() => onOpenBook(book)}
              onLongPress={onBookLongPress ? () => onBookLongPress(book) : undefined}
            />
          ))}
        </section>
      ) : null}
      </div>

      {moreRecent.length > 0 ? (
        <section className="space-y-4">
          <HomeSectionHeader title="Недавно читали" />
          <HomeBookPreview
            books={moreRecent}
            maxRows={2}
            viewMode={viewMode}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            readingProgressByBookId={readingProgressByBookId}
            downloadedBookIds={downloadedBookIds}
            readIds={readIds}
            onBookClick={onOpenBook}
            onBookLongPress={onBookLongPress}
          />
        </section>
      ) : null}

      {isOnline && recentMode !== 'off' && (
        <section className="space-y-4">
          <HomeSectionHeader
            title={recentMode === 'fav' ? 'Новинки ваших авторов' : 'Новинки'}
            actionLabel={recentMode === 'fav' ? 'Все новинки' : 'Все'}
            onAction={() => setSectionView('recent')}
          />
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
              emptyLabel={
                recentMode === 'fav' && recentServer.length > 0
                  ? 'Нет новинок от авторов, которых вы уже читали'
                  : 'Пока нет новинок'
              }
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

      {isOnline && homeShelves.map((shelf) => (
        <section key={shelf.key} className="space-y-4">
          <HomeSectionHeader title={shelf.ref.title} actionLabel="Все" onAction={() => setOpenShelf(shelf.ref)} />
          <HomeBookPreview
            books={shelf.books}
            viewMode={viewMode}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            readingProgressByBookId={readingProgressByBookId}
            downloadedBookIds={downloadedBookIds}
            readIds={readIds}
            onBookClick={handleCatalogBookTap}
            onBookLongPress={onBookLongPress}
          />
        </section>
      ))}
    </>
  );

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      {pullRefresh.indicator}
      <div ref={scrollRef} {...pullRefresh.bind} className="flex-1 min-h-0 overflow-y-auto inpx-page-scroll px-5 py-5 min-[600px]:px-8">
        <div className={`mx-auto w-full max-w-[60rem] ${spacing.shelfY}`}>{scrollInner}</div>
      </div>
    </div>
  );
}
