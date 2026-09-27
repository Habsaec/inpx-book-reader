import React from 'react';
import { Book, ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import BookCoverGrid from '../BookCoverGrid';
import type { CatalogViewMode } from './catalogTypes';
import FlibustaBookRow from './FlibustaBookRow';
import VirtualList from '../../ui/VirtualList';
import { useDownloadQueue } from '../../hooks/useDownloadQueue';

/** Cover list rows are 104px. */
const LIST_ROW_HEIGHT = 104;
const VIRTUALIZE_THRESHOLD = 60;

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
  /**
   * Use inner VirtualList for long lists (catalog).
   * Disable when the parent already scrolls (Мои книги).
   */
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
  virtualizeList = true,
}: CatalogBookListProps) {
  const downloadJobs = useDownloadQueue();
  const downloadProgressByBookId = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const job of downloadJobs) {
      if (job.status === 'queued' || job.status === 'downloading' || job.status === 'saving') {
        map[job.id] = job.progress ?? 0;
      }
    }
    return map;
  }, [downloadJobs]);

  const downloadingBookIds = React.useMemo(() => {
    const ids = new Set(Object.keys(downloadProgressByBookId));
    if (downloadingId) ids.add(downloadingId);
    queuedBookIds?.forEach((id) => ids.add(id));
    return ids;
  }, [downloadProgressByBookId, downloadingId, queuedBookIds]);

  const isDownloadingBook = (id: string) => downloadingBookIds.has(id);

  const renderRow = (book: Book) => (
    <FlibustaBookRow
      book={book}
      serverConfig={serverConfig}
      storageDirectory={storageDirectory}
      isDownloaded={downloadedBookIds.includes(book.id)}
      isDownloading={isDownloadingBook(book.id)}
      downloadProgress={downloadProgressByBookId[book.id] ?? 0}
      readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress ?? 0}
      isRead={readIds?.has(book.id)}
      isSelected={Boolean(selectedBookIds?.has(book.id))}
      showFileExt={showFileExt}
      onClick={() => onBookClick(book)}
      onLongPress={onBookLongPress ? () => onBookLongPress(book) : undefined}
    />
  );

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
        downloadProgressByBookId={downloadProgressByBookId}
        onBookClick={onBookClick}
        onBookLongPress={onBookLongPress}
      />
    );
  }

  if (virtualizeList && books.length >= VIRTUALIZE_THRESHOLD) {
    return (
      <div className="max-h-[min(70vh,640px)]">
        <VirtualList
          items={books}
          itemHeight={LIST_ROW_HEIGHT}
          className=""
          getKey={(book) => book.id}
          renderItem={(book) => renderRow(book)}
        />
      </div>
    );
  }

  return <div>{books.map((book) => <React.Fragment key={book.id}>{renderRow(book)}</React.Fragment>)}</div>;
}
