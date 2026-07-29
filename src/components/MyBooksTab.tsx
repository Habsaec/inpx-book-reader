import React from 'react';
import { Heart, Folder, CheckCircle2, ArrowLeft, StickyNote, Bookmark, WifiOff, AlertCircle } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { FavoriteAuthorItem, FavoriteSeriesItem, ServerShelf } from '../lib/inpxClient';
import { mapServerBook } from '../lib/inpxClient';
import DeviceLibraryTab from './DeviceLibraryTab';
import BookCoverGrid from './BookCoverGrid';
import EntityPreviewRow from './EntityPreviewRow';
import { BookGridSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { textStyles, touchMin } from '../ui/tokens';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { useHorizontalTabSwipe } from '../hooks/useHorizontalTabSwipe';
import PullToRefresh from './PullToRefresh';
import ReaderNotesPanel from './mybooks/ReaderNotesPanel';
import ReaderBookmarksPanel from './mybooks/ReaderBookmarksPanel';
import type { LocalReaderAnnotationItem, LocalReaderBookmarkItem } from '../lib/offlineReaderStore';

const LIBRARY_SEGS = ['downloaded', 'shelves', 'favorites', 'read'] as const;
type LibrarySeg = (typeof LIBRARY_SEGS)[number];

interface MyBooksTabProps {
  serverConfig: ServerConfig;
  isAppDark: boolean;
  isOnline: boolean;
  canDownloadOnline: boolean;
  downloadedBookIds: string[];
  localOfflineBooks: Book[];
  storageDirectory?: StorageDirectory | null;
  storageDirectoryReady?: boolean;
  downloadingId?: string | null;
  readingProgressByBookId?: Record<string, number>;
  readIds?: Set<string>;
  bookmarkIds?: Set<string>;
  shelves?: ServerShelf[];
  favoriteAuthors?: string[];
  favoriteSeries?: string[];
  favoriteAuthorItems?: FavoriteAuthorItem[];
  favoriteSeriesItems?: FavoriteSeriesItem[];
  fetchSectionBooks?: (section: 'bookmarks' | 'read', page?: number) => Promise<import('../lib/inpxClient').InpxBookItem[]>;
  loadShelfBooks?: (shelfId: number) => Promise<Book[]>;
  onOpenBook: (book: Book) => void;
  onContinueBook: (book: Book) => void;
  onBookLongPress?: (book: Book, context?: { shelfId?: number; shelfName?: string }) => void;
  onOpenAuthor?: (name: string) => void;
  onOpenSeries?: (name: string) => void;
  onRemoveShelf?: (shelfId: string) => void | Promise<void>;
  localReaderAnnotations?: LocalReaderAnnotationItem[];
  localReaderBookmarks?: LocalReaderBookmarkItem[];
  onOpenBookAtPosition?: (bookId: string, position: string, fallbackBook?: Book) => void;
  onRemoveReaderAnnotation?: (bookId: string, annId: number) => void | Promise<void>;
  onUpdateReaderAnnotation?: (bookId: string, annId: number, patch: { note?: string; color?: string }) => void | Promise<void>;
  onRemoveReaderBookmark?: (bookId: string, bmId: number) => void | Promise<void>;
  onGoCatalog?: () => void;
  onGoProfile?: () => void;
  /** Когда false — вкладка скрыта, но смонтирована (сохраняем seg / оверлеи). */
  isTabActive?: boolean;
}

export default function MyBooksTab({
  serverConfig,
  isAppDark,
  isOnline,
  canDownloadOnline,
  downloadedBookIds,
  localOfflineBooks,
  storageDirectory,
  storageDirectoryReady,
  downloadingId,
  readingProgressByBookId = {},
  readIds,
  bookmarkIds,
  shelves = [],
  favoriteAuthors = [],
  favoriteSeries = [],
  favoriteAuthorItems,
  favoriteSeriesItems,
  fetchSectionBooks,
  loadShelfBooks,
  onOpenBook,
  onContinueBook,
  onBookLongPress,
  onOpenAuthor,
  onOpenSeries,
  localReaderAnnotations = [],
  localReaderBookmarks = [],
  onOpenBookAtPosition,
  onRemoveReaderAnnotation,
  onUpdateReaderAnnotation,
  onRemoveReaderBookmark,
  onGoCatalog,
  onGoProfile,
  isTabActive = true,
}: MyBooksTabProps) {
  const [seg, setSeg] = React.useState<LibrarySeg>('downloaded');
  const [libraryOverlay, setLibraryOverlay] = React.useState<'notes' | 'bookmarks' | null>(null);
  const [sectionBooks, setSectionBooks] = React.useState<Book[]>([]);
  const [sectionLoading, setSectionLoading] = React.useState(false);
  const [sectionError, setSectionError] = React.useState(false);
  const [activeShelfId, setActiveShelfId] = React.useState<number | null>(null);
  const [shelfBooks, setShelfBooks] = React.useState<Book[]>([]);
  const segBtnRefs = React.useRef<Partial<Record<LibrarySeg, HTMLButtonElement | null>>>({});

  const authorRows = React.useMemo(() => {
    if (favoriteAuthorItems && favoriteAuthorItems.length > 0) return favoriteAuthorItems;
    return favoriteAuthors.map((name) => ({ name, displayName: name }));
  }, [favoriteAuthorItems, favoriteAuthors]);

  const seriesRows = React.useMemo(() => {
    if (favoriteSeriesItems && favoriteSeriesItems.length > 0) return favoriteSeriesItems;
    return favoriteSeries.map((name) => ({ name, displayName: name }));
  }, [favoriteSeriesItems, favoriteSeries]);

  const segments: Array<{ id: LibrarySeg; label: string }> = [
    { id: 'downloaded', label: 'На устройстве' },
    { id: 'shelves', label: 'Полки' },
    { id: 'favorites', label: 'Избранное' },
    { id: 'read', label: 'Прочитано' },
  ];

  const goToSeg = React.useCallback((next: LibrarySeg) => {
    setSeg(next);
    setActiveShelfId(null);
  }, []);

  const librarySwipe = useHorizontalTabSwipe(
    LIBRARY_SEGS,
    seg,
    goToSeg,
    { enabled: isTabActive && !libraryOverlay && activeShelfId == null },
  );

  React.useEffect(() => {
    const btn = segBtnRefs.current[seg];
    btn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [seg]);

  React.useEffect(() => {
    if (seg === 'downloaded' || seg === 'shelves' || !fetchSectionBooks) return;
    if (!isOnline) {
      setSectionBooks([]);
      setSectionLoading(false);
      setSectionError(false);
      return;
    }
    if (seg === 'favorites') {
      let cancelled = false;
      setSectionLoading(true);
      setSectionError(false);
      fetchSectionBooks('bookmarks', 1)
        .then((items) => {
          if (!cancelled) setSectionBooks(items.map((b) => mapServerBook(b, serverConfig)));
        })
        .catch(() => {
          if (!cancelled) {
            setSectionBooks([]);
            setSectionError(true);
          }
        })
        .finally(() => {
          if (!cancelled) setSectionLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    if (seg === 'read') {
      let cancelled = false;
      setSectionLoading(true);
      setSectionError(false);
      fetchSectionBooks('read', 1)
        .then((items) => {
          if (!cancelled) setSectionBooks(items.map((b) => mapServerBook(b, serverConfig)));
        })
        .catch(() => {
          if (!cancelled) {
            setSectionBooks([]);
            setSectionError(true);
          }
        })
        .finally(() => {
          if (!cancelled) setSectionLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [seg, fetchSectionBooks, serverConfig, isOnline]);

  const refreshSection = React.useCallback(async () => {
    try {
      if (seg === 'favorites') {
        if (!fetchSectionBooks) return;
        setSectionError(false);
        const items = await fetchSectionBooks('bookmarks', 1);
        setSectionBooks(items.map((b) => mapServerBook(b, serverConfig)));
      } else if (seg === 'read') {
        if (!fetchSectionBooks) return;
        setSectionError(false);
        const items = await fetchSectionBooks('read', 1);
        setSectionBooks(items.map((b) => mapServerBook(b, serverConfig)));
      } else if (seg === 'shelves' && activeShelfId != null && loadShelfBooks) {
        setSectionError(false);
        const books = await loadShelfBooks(activeShelfId);
        setShelfBooks(books);
      }
    } catch {
      setSectionError(true);
      if (seg === 'favorites' || seg === 'read') setSectionBooks([]);
      if (seg === 'shelves') setShelfBooks([]);
    }
  }, [seg, fetchSectionBooks, serverConfig, activeShelfId, loadShelfBooks]);

  const inShelfDrilldown = seg === 'shelves' && activeShelfId != null;
  const activeShelfName = shelves.find((s) => s.id === activeShelfId)?.name;
  const shelfRevision = React.useMemo(
    () => shelves.map((s) => `${s.id}:${s.bookCount ?? 0}`).join('|'),
    [shelves],
  );

  const visibleSectionBooks = React.useMemo(() => {
    if (seg === 'favorites' && bookmarkIds) {
      return sectionBooks.filter((b) => bookmarkIds.has(b.id));
    }
    if (seg === 'read' && readIds) {
      return sectionBooks.filter((b) => readIds.has(b.id));
    }
    return sectionBooks;
  }, [seg, sectionBooks, bookmarkIds, readIds]);

  const shelfLoadGen = React.useRef(0);
  const lastShelfIdLoaded = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (seg !== 'shelves' || activeShelfId == null || !loadShelfBooks) {
      setShelfBooks([]);
      lastShelfIdLoaded.current = null;
      return;
    }
    const gen = ++shelfLoadGen.current;
    const shelfChanged = lastShelfIdLoaded.current !== activeShelfId;
    if (shelfChanged) setSectionLoading(true);
    loadShelfBooks(activeShelfId)
      .then((books) => {
        if (shelfLoadGen.current !== gen) return;
        lastShelfIdLoaded.current = activeShelfId;
        setShelfBooks(books);
        setSectionError(false);
      })
      .catch(() => {
        if (shelfLoadGen.current !== gen) return;
        setShelfBooks([]);
        setSectionError(true);
      })
      .finally(() => {
        if (shelfLoadGen.current === gen) setSectionLoading(false);
      });
  }, [seg, activeShelfId, loadShelfBooks, shelfRevision]);

  useOverlayBackHandler(isTabActive && Boolean(libraryOverlay), () => setLibraryOverlay(null));
  useOverlayBackHandler(isTabActive && inShelfDrilldown && !libraryOverlay, () => setActiveShelfId(null));

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
      <div className={`px-4 pt-3 pb-2 shrink-0 ${theme.bg}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className={textStyles.title}>Библиотека</h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              aria-label="Закладки"
              onClick={() => setLibraryOverlay('bookmarks')}
              className={`${touchMin} inline-flex items-center justify-center rounded-xl ${theme.textMuted} ${theme.focusRing}`}
            >
              <Bookmark className="w-5 h-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Заметки"
              onClick={() => setLibraryOverlay('notes')}
              className={`${touchMin} inline-flex items-center justify-center rounded-xl ${theme.textMuted} ${theme.focusRing}`}
            >
              <StickyNote className="w-5 h-5" aria-hidden />
            </button>
          </div>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
          {segments.map((s) => (
            <button
              key={s.id}
              type="button"
              ref={(el) => {
                segBtnRefs.current[s.id] = el;
              }}
              onClick={() => goToSeg(s.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full ${textStyles.bodyBold} ${touchMin} ${theme.focusRing} ${
                seg === s.id ? theme.accentBg : `${theme.chip} ${theme.text}`
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {libraryOverlay === 'notes' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className={`px-4 py-2 shrink-0 flex items-center gap-2 border-b ${theme.header}`}>
            <button
              type="button"
              aria-label="Назад"
              onClick={() => setLibraryOverlay(null)}
              className={`${touchMin} inline-flex items-center gap-1 px-1 ${textStyles.bodyBold} ${theme.accentText} ${theme.focusRing}`}
            >
              <ArrowLeft className="w-4 h-4" aria-hidden /> Назад
            </button>
            <p className={textStyles.title}>Заметки</p>
          </div>
          <ReaderNotesPanel
            annotations={localReaderAnnotations}
            serverConfig={serverConfig}
            onOpenAnnotation={(bookId, cfi, book) =>
              onOpenBookAtPosition?.(bookId, cfi, book) ?? onContinueBook(book)
            }
            onRemoveAnnotation={onRemoveReaderAnnotation}
            onUpdateAnnotation={onUpdateReaderAnnotation}
          />
        </div>
      ) : libraryOverlay === 'bookmarks' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className={`px-4 py-2 shrink-0 flex items-center gap-2 border-b ${theme.header}`}>
            <button
              type="button"
              aria-label="Назад"
              onClick={() => setLibraryOverlay(null)}
              className={`${touchMin} inline-flex items-center gap-1 px-1 ${textStyles.bodyBold} ${theme.accentText} ${theme.focusRing}`}
            >
              <ArrowLeft className="w-4 h-4" aria-hidden /> Назад
            </button>
            <p className={textStyles.title}>Закладки</p>
          </div>
          <ReaderBookmarksPanel
            bookmarks={localReaderBookmarks}
            serverConfig={serverConfig}
            onOpenBookmark={(bookId, position, book) =>
              onOpenBookAtPosition?.(bookId, position, book) ?? onContinueBook(book)
            }
            onRemoveBookmark={onRemoveReaderBookmark}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden" {...librarySwipe}>
          {seg === 'downloaded' ? (
            <DeviceLibraryTab
              books={localOfflineBooks}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory ?? null}
              storageDirectoryReady={storageDirectoryReady}
              isAppDark={isAppDark}
              isOnline={isOnline}
              canDownloadOnline={canDownloadOnline}
              downloadingId={downloadingId}
              readingProgressByBookId={readingProgressByBookId}
              onOpenBook={onOpenBook}
              onContinueBook={onContinueBook}
              onBookLongPress={onBookLongPress}
              onGoCatalog={onGoCatalog}
              onGoProfile={onGoProfile}
              embedded
            />
          ) : (
            <PullToRefresh
              onRefresh={refreshSection}
              disabled={!isOnline}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-5"
            >
              {seg === 'shelves' && activeShelfId == null && (
                shelves.length === 0 ? (
                  <EmptyState
                    icon={Folder}
                    title="Полок пока нет"
                    description="Создайте полку на сервере или найдите книги в поиске"
                    actionLabel={onGoCatalog ? 'Открыть поиск' : undefined}
                    onAction={onGoCatalog}
                  />
                ) : (
                  shelves.map((s) => (
                    <EntityPreviewRow
                      key={s.id}
                      name={s.name}
                      count={s.bookCount ?? 0}
                      serverConfig={serverConfig}
                      previewBookIds={s.previewBookIds}
                      onClick={() => setActiveShelfId(s.id)}
                    />
                  ))
                )
              )}

              {seg === 'shelves' && activeShelfId != null && (
                sectionLoading ? (
                  <BookGridSkeleton count={6} />
                ) : (
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Назад к списку полок"
                        onClick={() => setActiveShelfId(null)}
                        className={`${touchMin} inline-flex items-center gap-1 px-1 ${textStyles.bodyBold} ${theme.accentText} ${theme.focusRing}`}
                      >
                        <ArrowLeft className="w-4 h-4" aria-hidden /> Назад
                      </button>
                      <p className={`${textStyles.title} truncate`}>{activeShelfName ?? '…'}</p>
                    </div>
                    {sectionError ? (
                      <EmptyState
                        icon={AlertCircle}
                        tone="error"
                        title="Не удалось загрузить полку"
                        description="Проверьте подключение и попробуйте снова"
                        actionLabel="Повторить"
                        actionVariant="primary"
                        onAction={() => {
                          void refreshSection();
                        }}
                      />
                    ) : shelfBooks.length === 0 ? (
                      <EmptyState
                        icon={Folder}
                        title="На полке пусто"
                        description="Добавьте книги на полку из поиска или карточки книги"
                        actionLabel={onGoCatalog ? 'Открыть поиск' : undefined}
                        onAction={onGoCatalog}
                      />
                    ) : (
                      <BookCoverGrid
                        books={shelfBooks}
                        serverConfig={serverConfig}
                        storageDirectory={storageDirectory}
                        downloadedBookIds={downloadedBookIds}
                        readingProgressByBookId={readingProgressByBookId}
                        readIds={readIds}
                        onBookClick={onOpenBook}
                        onBookLongPress={
                          onBookLongPress
                            ? (book) =>
                                onBookLongPress(book, {
                                  shelfId: activeShelfId ?? undefined,
                                  shelfName: activeShelfName ?? undefined,
                                })
                            : undefined
                        }
                      />
                    )}
                  </div>
                )
              )}

              {(seg === 'favorites' || seg === 'read') && (
                !isOnline ? (
                  <EmptyState
                    icon={WifiOff}
                    tone="offline"
                    title="Нужен интернет"
                    description={
                      seg === 'favorites'
                        ? 'Избранное синхронизируется с сервером'
                        : 'Список прочитанного синхронизируется с сервером'
                    }
                    actionLabel={onGoProfile ? 'Открыть настройки' : undefined}
                    actionVariant="primary"
                    onAction={onGoProfile}
                  />
                ) : sectionLoading ? (
                  <BookGridSkeleton count={6} />
                ) : sectionError ? (
                  <EmptyState
                    icon={AlertCircle}
                    tone="error"
                    title="Не удалось загрузить"
                    description="Проверьте подключение и попробуйте снова"
                    actionLabel="Повторить"
                    actionVariant="primary"
                    onAction={() => {
                      setSectionError(false);
                      void refreshSection().catch(() => setSectionError(true));
                    }}
                  />
                ) : seg === 'favorites' && authorRows.length === 0 && seriesRows.length === 0 && visibleSectionBooks.length === 0 ? (
                  <EmptyState
                    icon={Heart}
                    title="Избранное пусто"
                    description="Добавляйте авторов и серии из поиска"
                    actionLabel={onGoCatalog ? 'Открыть поиск' : undefined}
                    onAction={onGoCatalog}
                  />
                ) : seg === 'read' && visibleSectionBooks.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="Прочитанных книг пока нет"
                    description="Отмечайте книги прочитанными во время чтения"
                    actionLabel={onGoCatalog ? 'Открыть поиск' : undefined}
                    onAction={onGoCatalog}
                  />
                ) : (
                  <>
                    {seg === 'favorites' && authorRows.length > 0 && (
                      <div className="space-y-0">
                        <h3 className={`${textStyles.sectionLabel} ${theme.textMuted} mb-1`}>Авторы</h3>
                        {authorRows.map((a) => (
                          <EntityPreviewRow
                            key={a.name}
                            name={a.displayName || a.name}
                            count={a.bookCount}
                            serverConfig={isOnline ? serverConfig : null}
                            authorKey={a.name}
                            coverBookId={a.coverBookId}
                            onClick={() => onOpenAuthor?.(a.name)}
                          />
                        ))}
                      </div>
                    )}
                    {seg === 'favorites' && seriesRows.length > 0 && (
                      <div className="space-y-0">
                        <h3 className={`${textStyles.sectionLabel} ${theme.textMuted} mb-1`}>Серии</h3>
                        {seriesRows.map((s) => (
                          <EntityPreviewRow
                            key={s.name}
                            name={s.displayName || s.name}
                            count={s.bookCount}
                            serverConfig={isOnline ? serverConfig : null}
                            previewBookIds={s.previewBookIds}
                            onClick={() => onOpenSeries?.(s.name)}
                          />
                        ))}
                      </div>
                    )}
                    {visibleSectionBooks.length > 0 && (
                      <div>
                        {seg === 'favorites' && (
                          <h3 className={`${textStyles.sectionLabel} ${theme.textMuted} mb-2`}>Книги</h3>
                        )}
                        <BookCoverGrid
                          books={visibleSectionBooks}
                          serverConfig={serverConfig}
                          storageDirectory={storageDirectory}
                          downloadedBookIds={downloadedBookIds}
                          readingProgressByBookId={readingProgressByBookId}
                          readIds={readIds}
                          onBookClick={onOpenBook}
                          onBookLongPress={onBookLongPress}
                        />
                      </div>
                    )}
                  </>
                )
              )}
            </PullToRefresh>
          )}
        </div>
      )}
    </div>
  );
}
