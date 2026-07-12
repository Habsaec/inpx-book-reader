import React from 'react';
import { BookOpen, Cloud, HardDrive, Play, RefreshCw, WifiOff } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { InpxProfile, mapServerBook } from '../lib/inpxClient';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { mergeRecentReadingLists, type LocalRecentReadingItem } from '../lib/localReadingProgress';
import BookCover from './BookCover';
import ReadProgressBar from './ReadProgressBar';
import LiteBookRow from './LiteBookRow';
import { BookListSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import DownloadQueueWidget from './DownloadQueueWidget';
import { textStyles, semantic, elevation } from '../ui/tokens';
import { bookHasPendingSync } from '../lib/syncStats';

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
  };
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} д назад`;
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
}: HomeTabProps) {
  const [recommended, setRecommended] = React.useState<Book[]>([]);
  const [recLoading, setRecLoading] = React.useState(false);
  const [recentServer, setRecentServer] = React.useState<Book[]>([]);
  const [recentLoading, setRecentLoading] = React.useState(false);

  const mergedRecent = React.useMemo(() => {
    const fromProfile = profile?.recentBooks?.map((b) => ({
      id: b.id,
      title: b.title,
      authorsDisplay: b.authorsDisplay || '',
      ext: (b.ext || 'fb2').replace(/^\./, ''),
      readProgress: b.readProgress != null ? Math.round(Number(b.readProgress)) : 0,
      lastOpenedAt: b.lastOpenedAt || new Date(0).toISOString(),
      series: b.series?.trim() || undefined,
      seriesNo: b.seriesNo != null ? Number(b.seriesNo) : undefined,
    })) ?? [];
    return mergeRecentReadingLists(fromProfile, localRecentReading);
  }, [profile, localRecentReading]);

  const hero = mergedRecent[0];
  const others = mergedRecent.slice(1, 8);
  const heroProgress = hero ? (readingProgressByBookId[hero.id] ?? hero.readProgress ?? 0) : 0;

  React.useEffect(() => {
    if (!fetchSectionBooks || !isOnline) return;
    setRecLoading(true);
    fetchSectionBooks('recommended', 1)
      .then((items) => setRecommended(items.slice(0, 6).map((b) => mapServerBook(b, serverConfig))))
      .catch(() => setRecommended([]))
      .finally(() => setRecLoading(false));
  }, [fetchSectionBooks, isOnline, serverConfig]);

  React.useEffect(() => {
    if (!fetchSectionBooks || !isOnline) return;
    setRecentLoading(true);
    fetchSectionBooks('recent', 1)
      .then((items) => setRecentServer(items.slice(0, 8).map((b) => mapServerBook(b, serverConfig))))
      .catch(() => setRecentServer([]))
      .finally(() => setRecentLoading(false));
  }, [fetchSectionBooks, isOnline, serverConfig]);

  const isDownloaded = (id: string) => downloadedBookIds.includes(id);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <BookListSkeleton count={4} />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className={`px-4 py-3 shrink-0 border-b ${theme.header} flex items-center justify-between gap-2`}>
        <div>
          <h2 className={textStyles.title}>Главная</h2>
          {lastSynced && isOnline && (
            <p className={`${textStyles.caption} ${theme.textMuted}`}>Синхр.: {lastSynced}</p>
          )}
        </div>
        {onOpenSync && (
          <button
            type="button"
            onClick={onOpenSync}
            aria-label="Синхронизация"
            className={`${textStyles.captionBold} ${theme.accentText} px-3 py-2 rounded-lg min-h-12 ${theme.chipButton} ${theme.focusRing}`}
          >
            <RefreshCw className="w-4 h-4 inline mr-1" aria-hidden />
            Синхр.
          </button>
        )}
      </div>

      {!isOnline && !isVerifyingConnection && (
        <div className={`mx-4 mt-3 px-3 py-2 rounded-xl border ${semantic.warningBg} flex items-center gap-2`}>
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden />
          <p className={textStyles.caption}>Офлайн — доступны скачанные книги</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        <DownloadQueueWidget compact />

        {hero ? (
          <button
            type="button"
            className={`relative overflow-hidden rounded-2xl border text-left w-full active:scale-[0.99] transition-transform ${theme.card} ${elevation.hero} ${theme.focusRing}`}
            onClick={() => onContinueBook(localRecentToBook(hero, serverConfig))}
            aria-label={`Продолжить: ${hero.title}`}
          >
            <div className="relative w-full aspect-[16/9] min-h-[10.5rem] max-h-56 bg-[var(--app-surface)]">
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
                <p className={`${textStyles.captionBold} uppercase tracking-wider opacity-80 mb-1`}>Продолжить чтение</p>
                <h3 className={`${textStyles.bookTitleHero} text-white line-clamp-2`}>{hero.title}</h3>
                <p className={`${textStyles.caption} opacity-90 mt-0.5 truncate`}>{hero.authorsDisplay}</p>
                {hero.lastOpenedAt && (
                  <p className={`${textStyles.caption} opacity-70 mt-1`}>{formatRelative(hero.lastOpenedAt)}</p>
                )}
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
                  <span className={`shrink-0 px-4 py-2 rounded-full ${textStyles.captionBold} inline-flex items-center gap-1.5 ${theme.accentBg}`}>
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
            description="Откройте книгу из каталога или скачайте на устройство"
          />
        )}

        {others.length > 0 && (
          <section className="space-y-3">
            <h3 className={`${textStyles.sectionLabel} ${theme.textMuted}`}>Недавно</h3>
            <div>
              {others.map((item) => (
                <LiteBookRow
                  key={item.id}
                  compact
                  book={localRecentToBook(item, serverConfig)}
                  serverConfig={serverConfig}
                  storageDirectory={storageDirectory}
                  readProgress={readingProgressByBookId[item.id] ?? item.readProgress}
                  isDownloaded={isDownloaded(item.id)}
                  hasPendingSync={isDownloaded(item.id) && bookHasPendingSync(item.id)}
                  showDownloadStatus={isOnline}
                  isAppDark={isAppDark}
                  onClick={() => onContinueBook(localRecentToBook(item, serverConfig))}
                  subtitle={formatRelative(item.lastOpenedAt)}
                />
              ))}
            </div>
          </section>
        )}

        {isOnline && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className={`${textStyles.sectionLabel} ${theme.textMuted}`}>Новинки</h3>
              <span className={`${textStyles.micro} font-medium ${theme.accentText}`}>На сервере</span>
            </div>
            {recentLoading ? (
              <BookListSkeleton count={3} />
            ) : recentServer.length === 0 ? (
              <p className={`${textStyles.caption} ${theme.textMuted}`}>Нет новых книг</p>
            ) : (
              <div>
                {recentServer.map((b) => (
                  <LiteBookRow
                    key={b.id}
                    compact
                    book={b}
                    serverConfig={serverConfig}
                    storageDirectory={storageDirectory}
                    isDownloaded={isDownloaded(b.id)}
                    hasPendingSync={isDownloaded(b.id) && bookHasPendingSync(b.id)}
                    showDownloadStatus
                    isAppDark={isAppDark}
                    onClick={() => onOpenBook(b)}
                    subtitle={isDownloaded(b.id) ? 'На устройстве' : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {isOnline && (
          <section className="space-y-3">
            <h3 className={`${textStyles.sectionLabel} ${theme.textMuted}`}>Рекомендации</h3>
            {recLoading ? (
              <BookListSkeleton count={3} />
            ) : recommended.length === 0 ? (
              <p className={`${textStyles.caption} ${theme.textMuted}`}>Нет рекомендаций</p>
            ) : (
              <div>
                {recommended.map((b) => (
                  <LiteBookRow
                    key={b.id}
                    compact
                    book={b}
                    serverConfig={serverConfig}
                    storageDirectory={storageDirectory}
                    isDownloaded={isDownloaded(b.id)}
                    hasPendingSync={isDownloaded(b.id) && bookHasPendingSync(b.id)}
                    showDownloadStatus
                    isAppDark={isAppDark}
                    onClick={() => onOpenBook(b)}
                    subtitle={isDownloaded(b.id) ? 'На устройстве' : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
