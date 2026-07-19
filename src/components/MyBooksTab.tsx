import React from 'react';
import { Heart, Folder, CheckCircle2, ArrowLeft } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { ServerShelf } from '../lib/inpxClient';
import { mapServerBook } from '../lib/inpxClient';
import DeviceLibraryTab from './DeviceLibraryTab';
import LiteBookRow from './LiteBookRow';
import LiteEntityRow from './LiteEntityRow';
import { BookListSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { textStyles, touchMin } from '../ui/tokens';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { bookHasPendingSync } from '../lib/syncStats';
import { useHorizontalTabSwipe } from '../hooks/useHorizontalTabSwipe';
import PullToRefresh from './PullToRefresh';
import ReaderNotesPanel from './mybooks/ReaderNotesPanel';
import type { LocalReaderAnnotationItem } from '../lib/offlineReaderStore';

type MyBooksSubTab = 'downloaded' | 'notes' | 'shelves' | 'favorites' | 'read';

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
  shelves?: ServerShelf[];
  favoriteAuthors?: string[];
  favoriteSeries?: string[];
  fetchSectionBooks?: (section: 'bookmarks' | 'read', page?: number) => Promise<import('../lib/inpxClient').InpxBookItem[]>;
  loadShelfBooks?: (shelfId: number) => Promise<Book[]>;
  onOpenBook: (book: Book) => void;
  onContinueBook: (book: Book) => void;
  onRemoveBook: (bookId: string, mode: 'file' | 'file-and-data') => void | Promise<void>;
  removingBookIds?: Set<string>;
  onDownloadBook?: (book: Book) => void | Promise<void>;
  onOpenAuthor?: (name: string) => void;
  onOpenSeries?: (name: string) => void;
  onRemoveShelf?: (shelfId: string) => void | Promise<void>;
  localReaderAnnotations?: LocalReaderAnnotationItem[];
  onOpenBookAtPosition?: (bookId: string, position: string, fallbackBook?: Book) => void;
  onRemoveReaderAnnotation?: (bookId: string, annId: number) => void | Promise<void>;
  onUpdateReaderAnnotation?: (bookId: string, annId: number, patch: { note?: string; color?: string }) => void | Promise<void>;
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
  shelves = [],
  favoriteAuthors = [],
  favoriteSeries = [],
  fetchSectionBooks,
  loadShelfBooks,
  onOpenBook,
  onContinueBook,
  onRemoveBook,
  removingBookIds,
  onDownloadBook,
  onOpenAuthor,
  onOpenSeries,
  onRemoveShelf,
  localReaderAnnotations = [],
  onOpenBookAtPosition,
  onRemoveReaderAnnotation,
  onUpdateReaderAnnotation,
}: MyBooksTabProps) {
  const [tab, setTab] = React.useState<MyBooksSubTab>('downloaded');
  const [sectionBooks, setSectionBooks] = React.useState<Book[]>([]);
  const [sectionLoading, setSectionLoading] = React.useState(false);
  const [activeShelfId, setActiveShelfId] = React.useState<number | null>(null);
  const [shelfBooks, setShelfBooks] = React.useState<Book[]>([]);

  const tabs: Array<{ id: MyBooksSubTab; label: string; count?: number }> = [
    { id: 'downloaded', label: 'Скачанные', count: downloadedBookIds.length || undefined },
    { id: 'notes', label: 'Заметки', count: localReaderAnnotations.length || undefined },
    { id: 'shelves', label: 'Полки', count: shelves.length || undefined },
    { id: 'favorites', label: 'Избранное' },
    { id: 'read', label: 'Прочитано' },
  ];

  const tabSwipe = useHorizontalTabSwipe(
    tabs.map((t) => t.id),
    tab,
    (next) => setTab(next as MyBooksSubTab),
  );

  React.useEffect(() => {
    if (!fetchSectionBooks) return;
    if (tab === 'favorites') {
      setSectionLoading(true);
      fetchSectionBooks('bookmarks', 1)
        .then((items) => setSectionBooks(items.map((b) => mapServerBook(b, serverConfig))))
        .catch(() => setSectionBooks([]))
        .finally(() => setSectionLoading(false));
    } else if (tab === 'read') {
      setSectionLoading(true);
      fetchSectionBooks('read', 1)
        .then((items) => setSectionBooks(items.map((b) => mapServerBook(b, serverConfig))))
        .catch(() => setSectionBooks([]))
        .finally(() => setSectionLoading(false));
    }
  }, [tab, fetchSectionBooks, serverConfig]);

  React.useEffect(() => {
    if (!loadShelfBooks || activeShelfId == null) {
      setShelfBooks([]);
      return;
    }
    setSectionLoading(true);
    loadShelfBooks(activeShelfId)
      .then(setShelfBooks)
      .finally(() => setSectionLoading(false));
  }, [activeShelfId, loadShelfBooks]);

  const refreshSection = React.useCallback(async () => {
    if (!fetchSectionBooks) return;
    if (tab === 'favorites') {
      setSectionLoading(true);
      try {
        const items = await fetchSectionBooks('bookmarks', 1);
        setSectionBooks(items.map((b) => mapServerBook(b, serverConfig)));
      } finally {
        setSectionLoading(false);
      }
    } else if (tab === 'read') {
      setSectionLoading(true);
      try {
        const items = await fetchSectionBooks('read', 1);
        setSectionBooks(items.map((b) => mapServerBook(b, serverConfig)));
      } finally {
        setSectionLoading(false);
      }
    } else if (tab === 'shelves' && activeShelfId != null && loadShelfBooks) {
      setSectionLoading(true);
      try {
        setShelfBooks(await loadShelfBooks(activeShelfId));
      } finally {
        setSectionLoading(false);
      }
    }
  }, [tab, fetchSectionBooks, serverConfig, activeShelfId, loadShelfBooks]);

  const inShelfDrilldown = tab === 'shelves' && activeShelfId != null;
  const activeShelfName = shelves.find((s) => s.id === activeShelfId)?.name;

  useOverlayBackHandler(inShelfDrilldown, () => setActiveShelfId(null));

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className={`px-4 py-3 shrink-0 border-b ${theme.header}`}>
        <h2 className={textStyles.title}>Мои книги</h2>
      </div>

      <div className={`shrink-0 border-b overflow-x-auto scrollbar-none ${theme.header}`}>
        <div className="flex gap-1 px-2 py-2 min-w-max" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setActiveShelfId(null);
              }}
              className={`px-3 py-2 rounded-lg min-h-12 ${textStyles.captionBold} whitespace-nowrap ${theme.focusRing} ${theme.chipButton} ${
                tab === t.id ? theme.accentMuted : theme.textMuted
              }`}
            >
              {t.label}
              {t.count != null && <span className="opacity-70 ml-1">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden" {...tabSwipe}>
        {tab === 'downloaded' ? (
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
            onRemoveBook={(id) => onRemoveBook(id, 'file-and-data')}
            removingBookIds={removingBookIds}
            onDownloadBook={onDownloadBook}
            embedded
          />
        ) : tab === 'notes' ? (
          <ReaderNotesPanel
            annotations={localReaderAnnotations}
            serverConfig={serverConfig}
            onOpenAnnotation={(bookId, cfi, book) =>
              onOpenBookAtPosition?.(bookId, cfi, book) ?? onContinueBook(book)
            }
            onRemoveAnnotation={onRemoveReaderAnnotation}
            onUpdateAnnotation={onUpdateReaderAnnotation}
          />
        ) : (
          <PullToRefresh
            onRefresh={refreshSection}
            disabled={!isOnline}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
          >
            {tab === 'shelves' && activeShelfId == null && (
              shelves.length === 0 ? (
                <EmptyState icon={Folder} title="Полок пока нет" description="Создайте полку в веб-интерфейсе сервера" />
              ) : (
                shelves.map((s) => (
                  <LiteEntityRow
                    key={s.id}
                    name={s.name}
                    count={s.bookCount ?? 0}
                    isAppDark={isAppDark}
                    onClick={() => setActiveShelfId(s.id)}
                  />
                ))
              )
            )}

            {tab === 'shelves' && activeShelfId != null && (
              sectionLoading ? (
                <BookListSkeleton />
              ) : (
                <div>
                  <div className={`border rounded-xl p-3 mb-3.5 flex items-center justify-between shadow-xs ${theme.cardSecondary}`}>
                    <div className="min-w-0">
                      <button
                        type="button"
                        aria-label="Назад к списку полок"
                        onClick={() => setActiveShelfId(null)}
                        className={`${touchMin} inline-flex items-center gap-1 px-2 text-xs font-bold ${theme.accentText} ${theme.focusRing}`}
                      >
                        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Назад
                      </button>
                      <h3 className={`${textStyles.sectionLabel} ${theme.textMuted} mt-1`}>Полка</h3>
                      <p className={`${textStyles.bookTitle} truncate mt-0.5`}>{activeShelfName ?? '…'}</p>
                    </div>
                  </div>
                  {shelfBooks.map((b) => (
                    <LiteBookRow
                      key={b.id}
                      compact
                      book={b}
                      serverConfig={serverConfig}
                      storageDirectory={storageDirectory}
                      isDownloaded={downloadedBookIds.includes(b.id)}
                      hasPendingSync={downloadedBookIds.includes(b.id) && bookHasPendingSync(b.id)}
                      readProgress={readingProgressByBookId[b.id]}
                      isAppDark={isAppDark}
                      onClick={() => onOpenBook(b)}
                    />
                  ))}
                </div>
              )
            )}

            {(tab === 'favorites' || tab === 'read') && (
              sectionLoading ? (
                <BookListSkeleton />
              ) : tab === 'favorites' && !isOnline && favoriteAuthors.length === 0 && favoriteSeries.length === 0 && sectionBooks.length === 0 ? (
                <EmptyState icon={Heart} title="Избранное пусто" />
              ) : tab === 'read' && sectionBooks.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Прочитанных книг пока нет" />
              ) : (
                <>
                  {tab === 'favorites' && favoriteAuthors.length > 0 && (
                    <div className="space-y-3">
                      <h3 className={`${textStyles.sectionLabel} ${theme.textMuted}`}>Авторы</h3>
                      {favoriteAuthors.map((name) => (
                        <LiteEntityRow
                          key={name}
                          name={name}
                          count={0}
                          isAppDark={isAppDark}
                          onClick={() => onOpenAuthor?.(name)}
                        />
                      ))}
                    </div>
                  )}
                  {tab === 'favorites' && favoriteSeries.length > 0 && (
                    <div className="space-y-3">
                      <h3 className={`${textStyles.sectionLabel} ${theme.textMuted}`}>Серии</h3>
                      {favoriteSeries.map((name) => (
                        <LiteEntityRow
                          key={name}
                          name={name}
                          count={0}
                          isAppDark={isAppDark}
                          onClick={() => onOpenSeries?.(name)}
                        />
                      ))}
                    </div>
                  )}
                  {sectionBooks.length > 0 && (
                    <div>
                      {sectionBooks.map((b) => (
                        <LiteBookRow
                          key={b.id}
                          compact
                          book={b}
                          serverConfig={serverConfig}
                          storageDirectory={storageDirectory}
                          isDownloaded={downloadedBookIds.includes(b.id)}
                          hasPendingSync={downloadedBookIds.includes(b.id) && bookHasPendingSync(b.id)}
                          readProgress={readIds?.has(b.id) ? 100 : readingProgressByBookId[b.id]}
                          isRead={readIds?.has(b.id)}
                          isAppDark={isAppDark}
                          onClick={() => onOpenBook(b)}
                        />
                      ))}
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
