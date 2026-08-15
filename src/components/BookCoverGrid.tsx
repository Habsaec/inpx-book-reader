import React from 'react';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import BookCoverTile from './BookCoverTile';
import { sortBooksBySeriesVolume } from '../lib/seriesVolumeSort';

export { sortBooksBySeriesVolume, seriesVolumeSortKey } from '../lib/seriesVolumeSort';
export { BOOK_COVER_TILE_WIDTH_PX } from './BookCoverTile';

interface BookCoverGridProps {
  books: Book[];
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  downloadedBookIds?: string[];
  readIds?: Set<string>;
  readingProgressByBookId?: Record<string, number>;
  showSeriesVolume?: boolean;
  onBookClick: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  selectedBookIds?: Set<string>;
  renderTileExtra?: (book: Book) => React.ReactNode;
}

/**
 * Responsive cover grid — 3 columns on phone, more on wider screens.
 * Tiles fill equal-width tracks with rounded covers.
 */
export default function BookCoverGrid({
  books,
  serverConfig,
  storageDirectory,
  downloadedBookIds = [],
  readIds,
  readingProgressByBookId,
  showSeriesVolume = false,
  onBookClick,
  onBookLongPress,
  selectedBookIds,
  renderTileExtra,
}: BookCoverGridProps) {
  const ordered = React.useMemo(
    () => (showSeriesVolume ? sortBooksBySeriesVolume(books) : books),
    [books, showSeriesVolume],
  );

  return (
    <div className="grid grid-cols-3 min-[480px]:grid-cols-4 min-[640px]:grid-cols-5 min-[900px]:grid-cols-6 gap-4 w-full min-w-0">
      {ordered.map((book) => (
        <div key={book.id} className="relative min-w-0 w-full">
          <BookCoverTile
            book={book}
            size="grid"
            showMeta
            showSeriesVolume={showSeriesVolume}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress}
            isRead={readIds?.has(book.id)}
            isDownloaded={downloadedBookIds.includes(book.id)}
            selected={selectedBookIds?.has(book.id)}
            onClick={() => onBookClick(book)}
            onLongPress={onBookLongPress ? () => onBookLongPress(book) : undefined}
          />
          {renderTileExtra?.(book)}
        </div>
      ))}
    </div>
  );
}
