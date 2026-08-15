import React from 'react';
import { Book, ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import BookCoverGrid from '../BookCoverGrid';
import type { CatalogViewMode } from './catalogTypes';
import FlibustaBookRow from './FlibustaBookRow';
import VirtualList from '../../ui/VirtualList';

/** Flibusta text rows are short (~44px). */
const LIST_ROW_HEIGHT = 44;
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
  /** Series drilldown: show volume numbers like server */
  showSeriesVolume?: boolean;
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
  virtualizeList = true,
}: CatalogBookListProps) {
  const isDownloadingBook = (id: string) =>
    downloadingId === id || Boolean(queuedBookIds?.has(id));

  const renderRow = (book: Book, index: number) => (
    <FlibustaBookRow
      book={book}
      index={index}
      showVolume={showSeriesVolume}
      isDownloaded={downloadedBookIds.includes(book.id)}
      isDownloading={isDownloadingBook(book.id)}
      isSelected={Boolean(selectedBookIds?.has(book.id))}
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
          renderItem={(book, index) => renderRow(book, index)}
        />
      </div>
    );
  }

  return <div>{books.map((book, index) => <React.Fragment key={book.id}>{renderRow(book, index)}</React.Fragment>)}</div>;
}
