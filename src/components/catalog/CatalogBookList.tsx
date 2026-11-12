import React from 'react';
import { Book, ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import BookCoverGrid from '../BookCoverGrid';
import type { CatalogViewMode } from './catalogTypes';
import FlibustaBookRow from './FlibustaBookRow';
import { useDownloadQueue } from '../../hooks/useDownloadQueue';
import { useIncrementalRender } from '../../hooks/useIncrementalRender';

const EMPTY_BOOKS: Book[] = [];

interface CatalogBookListProps {
  books: Book[];
  viewMode: CatalogViewMode;
  isServerBrowse?: boolean;
  serverConfig: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  isAppDark?: boolean;
  downloadedBookIds: string[];
  downloadingId?: string | null;
  queuedBookIds?: Set<string>;
  readIds?: Set<string>;
  readingProgressByBookId?: Record<string, number>;
  selectedBookIds?: Set<string>;
  onBookClick: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  /** Series drilldown: order by volume. The number itself is always shown in the title. */
  showSeriesVolume?: boolean;
  /** Локальная папка: расширение файла и серия из метаданных. */
  showFileExt?: boolean;
  /** @deprecated no effect: every long list now mounts its rows in steps inside the page scroll. */
  virtualizeList?: boolean;
}

export default function CatalogBookList({
  books,
  viewMode,
  serverConfig,
  storageDirectory,
  downloadedBookIds,
  downloadingId = null,
  queuedBookIds,
  readIds,
  readingProgressByBookId,
  selectedBookIds,
  onBookClick,
  onBookLongPress,
  showSeriesVolume = false,
  showFileExt = false,
}: CatalogBookListProps) {
  const downloadJobs = useDownloadQueue();
  const downloadingBookIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const job of downloadJobs) {
      if (job.status === 'queued' || job.status === 'downloading' || job.status === 'saving') ids.add(job.id);
    }
    if (downloadingId) ids.add(downloadingId);
    queuedBookIds?.forEach((id) => ids.add(id));
    return ids;
  }, [downloadJobs, downloadingId, queuedBookIds]);
  const downloadedSet = React.useMemo(() => new Set(downloadedBookIds), [downloadedBookIds]);

  // One stable function for every row: rows are memoized and skip the render when nothing of theirs changed.
  const clickRef = React.useRef(onBookClick);
  clickRef.current = onBookClick;
  const longPressRef = React.useRef(onBookLongPress);
  longPressRef.current = onBookLongPress;
  const handleClick = React.useCallback((book: Book) => clickRef.current(book), []);
  const handleLongPress = React.useCallback((book: Book) => longPressRef.current?.(book), []);
  // Rows mount in steps as the list is scrolled (no inner scroll box: the page itself scrolls).
  const { visible, sentinel } = useIncrementalRender(viewMode === 'grid' ? EMPTY_BOOKS : books);

  if (viewMode === 'grid') {
    return (
      <BookCoverGrid
        books={books}
        serverConfig={serverConfig}
        storageDirectory={storageDirectory}
        downloadedBookIds={downloadedBookIds}
        readIds={readIds}
        readingProgressByBookId={readingProgressByBookId}
        selectedBookIds={selectedBookIds}
        showSeriesVolume={showSeriesVolume}
        showFileExt={showFileExt}
        downloadingBookIds={downloadingBookIds}
        onBookClick={onBookClick}
        onBookLongPress={onBookLongPress}
      />
    );
  }

  return (
    <div>
      {visible.map((book) => (
        <FlibustaBookRow
          key={book.id}
          book={book}
          serverConfig={serverConfig}
          storageDirectory={storageDirectory}
          isDownloaded={downloadedSet.has(book.id)}
          isDownloading={downloadingBookIds.has(book.id)}
          readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress ?? 0}
          isRead={readIds?.has(book.id)}
          isSelected={Boolean(selectedBookIds?.has(book.id))}
          showFileExt={showFileExt}
          onBookClick={handleClick}
          onBookLongPress={onBookLongPress ? handleLongPress : undefined}
        />
      ))}
      {sentinel}
    </div>
  );
}
