import React from 'react';
import { BookOpen, Play, WifiOff, AlertCircle, RefreshCw, Star } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { InpxProfile, mapServerBook } from '../lib/inpxClient';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { mergeRecentReadingLists, type LocalRecentReadingItem } from '../lib/localReadingProgress';
import BookCover from './BookCover';
import ReadProgressBar from './ReadProgressBar';
import HorizontalBookShelf from './HorizontalBookShelf';
import PullToRefresh from './PullToRefresh';
import Skeleton, { BookShelfSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import DownloadQueueWidget from './DownloadQueueWidget';
import { textStyles, motion, semantic } from '../ui/tokens';

function ratingFromLibRate(libRate: unknown): number | undefined {
  const n = Number(libRate);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(5, Math.round(n > 5 ? n / 20 : n));
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

function formatLastSynced(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  try {
    return new Date(t).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
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
  onOpenSync?: () => void;
  lastSynced: string | null;
  fetchSectionBooks?: (section: 'recent' | 'recommended', page?: number) => Promise<import('../lib/inpxClient').InpxBookItem[]>;
  onRefresh?: () => void | Promise<void>;
  onGoCatalog?: () => void;
  onBookLongPress?: (book: Book) => void;
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
  onOpenSync,
  lastSynced,
  fetchSectionBooks,
  onRefresh,
  onGoCatalog,
  onBookLongPress,
}: HomeTabProps) {
  const [recommended, setRecommended] = React.useState<Book[]>([]);
  const [recLoading, setRecLoading] = React.useState(false);
  const [recError, setRecError] = React.useState(false);
  const [recentServer, setRecentServer] = React.useState<Book[]>([]);
  const [recentLoading, setRecentLoading] = React.useState(false);
  const [recentError, setRecentError] = React.useState(false);
  const [sectionKey, setSectionKey] = React.useState(0);

  const mergedRecent = React.useMemo(() => {
    const fromProfile = profile?.recentBooks?.map((b) => {
      const rating = ratingFromLibRate(b.libRate);
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
  const syncedLabel = formatLastSynced(lastSynced);

  React.useEffect(() => {
    if (!fetchSectionBooks || !isOnline) return;
    setRecLoading(true);
    setRecError(false);
    fetchSectionBooks('recommended', 1)
      .then((items) => setRecommended(items.slice(0, 8).map((b) => mapServerBook(b, serverConfig))))
      .catch(() => {
        setRecommended([]);
        setRecError(true);
      })
      .finally(() => setRecLoading(false));
  }, [fetchSectionBooks, isOnline, serverConfig, sectionKey]);

  React.useEffect(() => {
    if (!fetchSectionBooks || !isOnline) return;
    setRecentLoading(true);
    setRecentError(false);
    fetchSectionBooks('recent', 1)
      .then((items) => setRecentServer(items.slice(0, 8).map((b) => mapServerBook(b, serverConfig))))
      .catch(() => {
        setRecentServer([]);
        setRecentError(true);
      })
      .finally(() => setRecentLoading(false));
  }, [fetchSectionBooks, isOnline, serverConfig, sectionKey]);

  const handleRefresh = React.useCallback(async () => {
    setSectionKey((k) => k + 1);
    await onRefresh?.();
  }, [onRefresh]);

  // Full-page skeleton only when there is nothing local to show yet.
  // During connection check / fast sync, hero from localRecent must appear immediately.
  if (loading && mergedRecent.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6" aria-busy aria-label="Загрузка главной">
        <Skeleton className="w-full aspect-[16/9] min-h-[11rem] max-h-60" />
        <div className="space-y-3">
          <Skeleton variant="text" className="max-w-[30%] h-4" />
          <BookShelfSkeleton count={4} />
        </div>
        <div className="space-y-3">
          <Skeleton variant="text" className="max-w-[35%] h-4" />
          <BookShelfSkeleton count={4} />
        </div>
      </div>
    );
  }

  const scrollInner = (
    <>
      {hero ? (
        <button
          type="button"
          className={`relative overflow-hidden rounded-xl text-left w-full ${motion.press} ${theme.focusRing}`}
          onClick={() => onContinueBook(localRecentToBook(hero, serverConfig))}
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
            <div className="absolute bottom-0 left-0 right-0 p-4 z-10 text-white">
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
                <span className={`shrink-0 px-3.5 py-2 rounded-full ${textStyles.caption} font-semibold inline-flex items-center gap-1.5 ${theme.accentBg}`}>
                  <Play className="w-4 h-4 fill-current" aria-hidden /> Продолжить
                </span>
              </div>
            </div>
          </div>
        </button>
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

      {syncedLabel && onOpenSync && (
        <button
          type="button"
          onClick={onOpenSync}
          className={`w-full text-left ${textStyles.caption} ${theme.textMuted} ${theme.focusRing} rounded-lg py-1`}
        >
          Синхронизация: {syncedLabel}
        </button>
      )}

      {others.length > 0 && (
        <section className="space-y-3">
          <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>Недавно</h3>
          <HorizontalBookShelf
            books={others}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            readingProgressByBookId={readingProgressByBookId}
            downloadedBookIds={downloadedBookIds}
            onBookClick={onContinueBook}
            onBookLongPress={onBookLongPress}
          />
        </section>
      )}

      {isOnline && (
        <section className="space-y-3">
          <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>Новинки</h3>
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
            <HorizontalBookShelf
              books={recentServer}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              readingProgressByBookId={readingProgressByBookId}
              downloadedBookIds={downloadedBookIds}
              loading={recentLoading}
              onBookClick={onOpenBook}
              onBookLongPress={onBookLongPress}
              emptyLabel="Нет новых книг"
            />
          )}
        </section>
      )}

      {isOnline && (
        <section className="space-y-3">
          <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>Рекомендации</h3>
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
            <HorizontalBookShelf
              books={recommended}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              readingProgressByBookId={readingProgressByBookId}
              downloadedBookIds={downloadedBookIds}
              loading={recLoading}
              onBookClick={onOpenBook}
              onBookLongPress={onBookLongPress}
              emptyLabel="Нет рекомендаций"
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
        <PullToRefresh onRefresh={handleRefresh} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-6">
          {scrollInner}
        </PullToRefresh>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6">{scrollInner}</div>
      )}
    </div>
  );
}
