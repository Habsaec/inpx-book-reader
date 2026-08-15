import React from 'react';
import { Heart, Folder, CheckCircle2, ArrowLeft, WifiOff, AlertCircle } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { FavoriteAuthorItem, FavoriteSeriesItem, UiShelf } from '../lib/inpxClient';
import { mapServerBook, fetchAllReaderBookmarkList, fetchAllReaderAnnotationList } from '../lib/inpxClient';
import DeviceLibraryTab from './DeviceLibraryTab';
import CatalogBookList from './catalog/CatalogBookList';
import EntityPreviewRow from './EntityPreviewRow';
import { BookGridSkeleton, BookListSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { textStyles, touchMin } from '../ui/tokens';
import SegmentTabStrip from '../ui/SegmentTabStrip';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { useHorizontalTabSwipe } from '../hooks/useHorizontalTabSwipe';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import PullToRefresh from './PullToRefresh';
import ReaderNotesPanel from './mybooks/ReaderNotesPanel';
import ReaderBookmarksPanel from './mybooks/ReaderBookmarksPanel';
import {
  ensureOfflineReaderAnnotation,
  mergeReaderAnnotationLists,
  mergeReaderBookmarkLists,
  readerAnnotationFromApi,
  readerBookmarkFromApi,
  type LocalReaderAnnotationItem,
  type LocalReaderBookmarkItem,
} from '../lib/offlineReaderStore';

const LIBRARY_SEGS = ['downloaded', 'favorites', 'shelves', 'bookmarks', 'notes', 'read'] as const;
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
  shelves?: UiShelf[];
  favoriteAuthors?: string[];
  favoriteSeries?: string[];
  favoriteAuthorItems?: FavoriteAuthorItem[];
  favoriteSeriesItems?: FavoriteSeriesItem[];
  fetchSectionBooks?: (section: 'bookmarks' | 'read', page?: number) => Promise<import('../lib/inpxClient').InpxBookItem[]>;
  loadShelfBooks?: (shelfId: number | string) => Promise<Book[]>;
  onOpenBook: (book: Book) => void;
  onContinueBook: (book: Book) => void;
  /** Non-downloaded taps → details (shelves / read / etc.). */
  onOpenDetails?: (book: Book) => void;
  onBookLongPress?: (book: Book, context?: { shelfId?: number | string; shelfName?: string }) => void;
  onRemoveBooks?: (bookIds: string[]) => void | Promise<void>;
  onAddBooksToShelf?: (shelfId: number | string, bookIds: string[]) => void | Promise<void>;
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
  /** Bumped when Library tab is re-selected — return to root («На устройстве»). */
  libraryRootEpoch?: number;
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
  onOpenDetails,
  onBookLongPress,
  onRemoveBooks,
  onAddBooksToShelf,
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
  libraryRootEpoch = 0,
}: MyBooksTabProps) {
  const handleBookTap = React.useCallback(
    (book: Book) => {
      if (onOpenDetails) {
        onOpenDetails(book);
        return;
      }
      onOpenBook(book);
    },
    [onOpenBook, onOpenDetails],
  );

  const [seg, setSeg] = React.useState<LibrarySeg>('downloaded');
  const { viewMode } = useCatalogViewMode('books');
  const [sectionBooks, setSectionBooks] = React.useState<Book[]>([]);
  const [sectionLoading, setSectionLoading] = React.useState(false);
  const [sectionError, setSectionError] = React.useState(false);
  const [activeShelfId, setActiveShelfId] = React.useState<number | string | null>(null);
  const [shelfBooks, setShelfBooks] = React.useState<Book[]>([]);
  const [serverBookmarks, setServerBookmarks] = React.useState<LocalReaderBookmarkItem[] | null>(null);
  const [serverAnnotations, setServerAnnotations] = React.useState<LocalReaderAnnotationItem[] | null>(null);
  const [readerListsLoading, setReaderListsLoading] = React.useState(false);
  const [readerListsError, setReaderListsError] = React.useState(false);
  const [readerListsKey, setReaderListsKey] = React.useState(0);
  const segBtnRefs = React.useRef<Partial<Record<LibrarySeg, HTMLButtonElement | null>>>({});
  const libraryRootEpochSeen = React.useRef(libraryRootEpoch);

  React.useEffect(() => {
    if (libraryRootEpochSeen.current === libraryRootEpoch) return;
    libraryRootEpochSeen.current = libraryRootEpoch;
    setActiveShelfId(null);
    setSeg('downloaded');
  }, [libraryRootEpoch]);

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
    { id: 'favorites', label: 'Избранное' },
    { id: 'shelves', label: 'Полки' },
    { id: 'bookmarks', label: 'Закладки' },
    { id: 'notes', label: 'Заметки' },
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
    { enabled: isTabActive && activeShelfId == null },
  );

  React.useEffect(() => {
    const btn = segBtnRefs.current[seg];
    btn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [seg]);

  React.useEffect(() => {
    if (seg === 'downloaded' || seg === 'shelves' || seg === 'bookmarks' || seg === 'notes' || !fetchSectionBooks) return;
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

  React.useEffect(() => {
    if ((seg !== 'bookmarks' && seg !== 'notes') || !isOnline) return;
    let cancelled = false;
    setReaderListsLoading(true);
    setReaderListsError(false);
    const load =
      seg === 'bookmarks'
        ? fetchAllReaderBookmarkList(serverConfig).then((rows) => {
            if (!cancelled) setServerBookmarks(rows.map(readerBookmarkFromApi));
          })
        : fetchAllReaderAnnotationList(serverConfig).then((rows) => {
            if (!cancelled) setServerAnnotations(rows.map(readerAnnotationFromApi));
          });
    load
      .catch(() => {
        if (!cancelled) setReaderListsError(true);
      })
      .finally(() => {
        if (!cancelled) setReaderListsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seg, isOnline, serverConfig, readerListsKey]);

  const displayBookmarks = React.useMemo(
    () => mergeReaderBookmarkLists(serverBookmarks ?? [], localReaderBookmarks),
    [serverBookmarks, localReaderBookmarks],
  );
  const displayAnnotations = React.useMemo(
    () => mergeReaderAnnotationLists(serverAnnotations ?? [], localReaderAnnotations),
    [serverAnnotations, localReaderAnnotations],
  );

  const refreshSection = React.useCallback(async () => {
    const refreshSeg = seg;
    const refreshShelfId = activeShelfId;
    try {
      if (refreshSeg === 'favorites') {
        if (!fetchSectionBooks) return;
        setSectionError(false);
        const items = await fetchSectionBooks('bookmarks', 1);
        if (seg !== 'favorites') return;
        setSectionBooks(items.map((b) => mapServerBook(b, serverConfig)));
      } else if (refreshSeg === 'read') {
        if (!fetchSectionBooks) return;
        setSectionError(false);
        const items = await fetchSectionBooks('read', 1);
        if (seg !== 'read') return;
        setSectionBooks(items.map((b) => mapServerBook(b, serverConfig)));
      } else if (refreshSeg === 'shelves' && refreshShelfId != null && loadShelfBooks) {
        setSectionError(false);
        const books = await loadShelfBooks(refreshShelfId);
        if (seg !== 'shelves' || activeShelfId !== refreshShelfId) return;
        setShelfBooks(books);
      }
    } catch {
      if (seg !== refreshSeg) return;
      setSectionError(true);
      if (refreshSeg === 'favorites' || refreshSeg === 'read') setSectionBooks([]);
      if (refreshSeg === 'shelves') setShelfBooks([]);
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
  const lastShelfIdLoaded = React.useRef<number | string | null>(null);

  React.useEffect(() => {
    if (seg !== 'shelves' || activeShelfId == null || !loadShelfBooks) {
      shelfLoadGen.current += 1;
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
    return () => {
      shelfLoadGen.current += 1;
    };
  }, [seg, activeShelfId, loadShelfBooks, shelfRevision]);

  useOverlayBackHandler(isTabActive && inShelfDrilldown, () => setActiveShelfId(null));

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
      <div className={`px-5 pt-4 pb-3 shrink-0 ${theme.bg}`}>
        <div className="min-w-0">
          <h2 className={textStyles.title}>Мои книги</h2>
          <p className={`${textStyles.caption} ${theme.textMuted} mt-1`}>На устройстве и с сервера</p>
        </div>
        <SegmentTabStrip
          tabs={segments}
          active={seg}
          tabRefs={segBtnRefs}
          aria-label="Раздел библиотеки"
          onChange={goToSeg}
        />
      </div>

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
            shelves={shelves}
            onOpenBook={onOpenBook}
            onContinueBook={onContinueBook}
            onOpenDetails={onOpenDetails}
            onBookLongPress={onBookLongPress}
            onRemoveBooks={onRemoveBooks}
            onAddBooksToShelf={onAddBooksToShelf}
            onGoCatalog={onGoCatalog}
            onGoProfile={onGoProfile}
            embedded
            resetEpoch={libraryRootEpoch}
          />
        ) : seg === 'bookmarks' ? (
          readerListsLoading && displayBookmarks.length === 0 ? (
            <div className="px-5 py-4">
              <BookListSkeleton count={5} />
            </div>
          ) : readerListsError && displayBookmarks.length === 0 ? (
            <EmptyState
              icon={AlertCircle}
              tone="error"
              title="Не удалось загрузить закладки"
              description="Проверьте подключение и попробуйте снова"
              actionLabel="Повторить"
              actionVariant="primary"
              onAction={() => setReaderListsKey((k) => k + 1)}
            />
          ) : (
            <ReaderBookmarksPanel
              bookmarks={displayBookmarks}
              serverConfig={serverConfig}
              downloadedBookIds={downloadedBookIds}
              onOpenBookmark={(bookId, position, book) =>
                onOpenBookAtPosition?.(bookId, position, book) ?? onContinueBook(book)
              }
              onRemoveBookmark={
                onRemoveReaderBookmark
                  ? async (bookId, bmId) => {
                      setServerBookmarks((prev) =>
                        prev?.filter((b) => !(b.bookId === bookId && b.id === bmId)) ?? null,
                      );
                      await onRemoveReaderBookmark(bookId, bmId);
                    }
                  : undefined
              }
            />
          )
        ) : seg === 'notes' ? (
          readerListsLoading && displayAnnotations.length === 0 ? (
            <div className="px-5 py-4">
              <BookListSkeleton count={5} />
            </div>
          ) : readerListsError && displayAnnotations.length === 0 ? (
            <EmptyState
              icon={AlertCircle}
              tone="error"
              title="Не удалось загрузить заметки"
              description="Проверьте подключение и попробуйте снова"
              actionLabel="Повторить"
              actionVariant="primary"
              onAction={() => setReaderListsKey((k) => k + 1)}
            />
          ) : (
            <ReaderNotesPanel
              annotations={displayAnnotations}
              serverConfig={serverConfig}
              downloadedBookIds={downloadedBookIds}
              onOpenAnnotation={(bookId, cfi, book) => {
                const an = displayAnnotations.find((item) => item.bookId === bookId && item.cfi === cfi);
                if (an) {
                  ensureOfflineReaderAnnotation(bookId, {
                    id: an.id,
                    cfi: an.cfi,
                    text: an.text,
                    note: an.note,
                    color: an.color,
                  });
                }
                onOpenBookAtPosition?.(bookId, cfi, book) ?? onContinueBook(book);
              }}
              onRemoveAnnotation={
                onRemoveReaderAnnotation
                  ? async (bookId, annId) => {
                      setServerAnnotations((prev) =>
                        prev?.filter((a) => !(a.bookId === bookId && a.id === annId)) ?? null,
                      );
                      await onRemoveReaderAnnotation(bookId, annId);
                    }
                  : undefined
              }
              onUpdateAnnotation={onUpdateReaderAnnotation}
            />
          )
        ) : (
          <PullToRefresh
            onRefresh={refreshSection}
            disabled={!isOnline}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          >
              {seg === 'shelves' && activeShelfId == null && (
                shelves.length === 0 ? (
                  <EmptyState
                    icon={isOnline ? Folder : WifiOff}
                    tone={isOnline ? undefined : 'offline'}
                    title={isOnline ? 'Полок пока нет' : 'Нет локальных полок'}
                    description={
                      isOnline
                        ? 'Создайте полку на сервере или найдите книги в поиске'
                        : 'Офлайн доступны только полки, созданные на этом устройстве. Подключитесь к серверу для синхронизации.'
                    }
                    actionLabel={isOnline ? (onGoCatalog ? 'Открыть поиск' : undefined) : (onGoProfile ? 'Открыть настройки' : undefined)}
                    actionVariant="primary"
                    onAction={isOnline ? onGoCatalog : onGoProfile}
                  />
                ) : (
                  shelves.map((s) => (
                    <EntityPreviewRow
                      key={String(s.id)}
                      name={s.name}
                      count={s.bookCount ?? 0}
                      serverConfig={serverConfig}
                      storageDirectory={storageDirectory}
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
                          void refreshSection().catch(() => setSectionError(true));
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
                      <CatalogBookList
                        books={shelfBooks}
                        viewMode={viewMode}
                        serverConfig={serverConfig}
                        storageDirectory={storageDirectory}
                        downloadedBookIds={downloadedBookIds}
                        readingProgressByBookId={readingProgressByBookId}
                        readIds={readIds}
                        virtualizeList={false}
                        onBookClick={handleBookTap}
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
                    description="Добавляйте авторов, серии и книги из поиска"
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
                            storageDirectory={storageDirectory}
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
                            storageDirectory={storageDirectory}
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
                        <CatalogBookList
                          books={visibleSectionBooks}
                          viewMode={viewMode}
                          serverConfig={serverConfig}
                          storageDirectory={storageDirectory}
                          downloadedBookIds={downloadedBookIds}
                          readingProgressByBookId={readingProgressByBookId}
                          readIds={readIds}
                          virtualizeList={false}
                          onBookClick={handleBookTap}
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
    </div>
  );
}
