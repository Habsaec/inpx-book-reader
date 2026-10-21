import React from 'react';
import { AlertCircle, BookOpen } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import {
  fetchShelfBooks,
  fetchSmartShelfBooks,
  isAuthError,
  isUnreachableServerError,
  mapServerBook,
  type HomeShelf,
} from '../lib/inpxClient';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import CatalogBookList from './catalog/CatalogBookList';
import CatalogPagination from './catalog/CatalogPagination';
import ViewModeToggle from '../ui/ViewModeToggle';
import { BookGridSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { textStyles } from '../ui/tokens';
import { usePageTitle } from '../ui/pageTitle';

/** Server page size of `/api/smart-shelves/:id/books`; regular shelves come in one response. */
const SMART_PAGE_SIZE = 24;

export type HomeShelfRef = Pick<HomeShelf, 'id' | 'kind' | 'title'>;

interface HomeShelfPanelProps {
  shelf: HomeShelfRef;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  downloadedBookIds: string[];
  readingProgressByBookId?: Record<string, number>;
  readIds?: Set<string>;
  isAppDark?: boolean;
  isTabActive?: boolean;
  onClose: () => void;
  onOpenBook: (book: Book) => void;
  onOpenDetails?: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  onAuthExpired?: () => void;
  onConnectionLost?: () => void;
}

/** «Все» for a shelf pinned on Home: the whole shelf, as the site's shelf / smart-shelf page. */
export default function HomeShelfPanel({
  shelf,
  serverConfig,
  storageDirectory,
  downloadedBookIds,
  readingProgressByBookId,
  readIds,
  isAppDark = false,
  isTabActive = true,
  onClose,
  onOpenBook,
  onOpenDetails,
  onBookLongPress,
  onAuthExpired,
  onConnectionLost,
}: HomeShelfPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [books, setBooks] = React.useState<Book[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const { viewMode, setViewMode } = useCatalogViewMode('books');

  useOverlayBackHandler(isTabActive, onClose);
  usePageTitle(shelf.title, onClose, isTabActive);

  React.useEffect(() => {
    if (!isTabActive) onClose();
  }, [isTabActive, onClose]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const request = shelf.kind === 'smart'
      ? fetchSmartShelfBooks(serverConfig, shelf.id, page).then((res) => ({
          items: res.items || [],
          total: Number(res.total) || 0,
        }))
      : fetchShelfBooks(serverConfig, shelf.id).then((items) => ({ items, total: items.length }));
    request
      .then((res) => {
        if (cancelled) return;
        setBooks(res.items.map((b) => mapServerBook(b, serverConfig)));
        setTotal(res.total || res.items.length);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (isAuthError(e)) onAuthExpired?.();
        else if (isUnreachableServerError(e)) onConnectionLost?.();
        setBooks([]);
        setTotal(0);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverConfig, shelf.id, shelf.kind, page, reloadKey, onAuthExpired, onConnectionLost]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const handleBookClick = React.useCallback(
    (book: Book) => {
      if (onOpenDetails) {
        onOpenDetails(book);
        return;
      }
      onOpenBook(book);
    },
    [onOpenBook, onOpenDetails],
  );

  return (
    <div className="relative flex-1 min-h-0 h-full">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto inpx-page-scroll px-5 py-3 min-[600px]:px-8">
        {error && !loading ? (
          <EmptyState
            compact
            tone="error"
            icon={AlertCircle}
            title="Не удалось загрузить полку"
            description="Проверьте соединение с сервером."
            actionLabel="Повторить"
            actionVariant="secondary"
            onAction={() => setReloadKey((k) => k + 1)}
          />
        ) : loading ? (
          <div aria-busy aria-label="Загрузка">
            <BookGridSkeleton count={9} />
          </div>
        ) : books.length === 0 ? (
          <EmptyState icon={BookOpen} title="На полке пока нет книг" />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className={`${textStyles.micro} ${theme.textMuted}`}>
                Книг: <strong>{total.toLocaleString('ru-RU')}</strong>
              </p>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
            <CatalogBookList
              books={books}
              viewMode={viewMode}
              isServerBrowse
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              isAppDark={isAppDark}
              downloadedBookIds={downloadedBookIds}
              readingProgressByBookId={readingProgressByBookId}
              readIds={readIds}
              onBookClick={handleBookClick}
              onBookLongPress={onBookLongPress}
            />
            {shelf.kind === 'smart' && (
              <CatalogPagination
                page={page}
                pageSize={SMART_PAGE_SIZE}
                total={total}
                onPageChange={setPage}
                isAppDark={isAppDark}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
