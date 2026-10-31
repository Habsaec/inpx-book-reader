import React from 'react';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import BookCoverTile from './BookCoverTile';
import { sortBooksBySeriesVolume } from '../lib/seriesVolumeSort';
import { getUiFontScale } from '../lib/uiFontScale';

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
  showFileExt?: boolean;
  onBookClick: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  selectedBookIds?: Set<string>;
  downloadingBookIds?: Set<string>;
  downloadProgressByBookId?: Record<string, number>;
  renderTileExtra?: (book: Book) => React.ReactNode;
}

/**
 * Columns of the grid below for a viewport width. The width is divided by the system font
 * scale (root font-size), so a larger «Font size» gives fewer, wider tiles; px media queries
 * cannot see that scale, hence the columns are set inline.
 */
export function bookGridColumnsForViewport(viewportWidth: number): number {
  const width = viewportWidth / getUiFontScale();
  if (width >= 900) return 6;
  if (width >= 640) return 5;
  if (width >= 480) return 4;
  return 3;
}

export function useBookGridColumns(): number {
  const [cols, setCols] = React.useState(() => bookGridColumnsForViewport(window.innerWidth));
  React.useEffect(() => {
    const onResize = () => setCols(bookGridColumnsForViewport(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return cols;
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
  showFileExt = false,
  onBookClick,
  onBookLongPress,
  selectedBookIds,
  downloadingBookIds,
  downloadProgressByBookId,
  renderTileExtra,
}: BookCoverGridProps) {
  const ordered = React.useMemo(
    () => (showSeriesVolume ? sortBooksBySeriesVolume(books) : books),
    [books, showSeriesVolume],
  );
  const cols = useBookGridColumns();

  return (
    <div
      className="grid gap-4 w-full min-w-0"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {ordered.map((book) => (
        <div key={book.id} className="relative min-w-0 w-full">
          <BookCoverTile
            book={book}
            size="grid"
            showMeta
            showFileExt={showFileExt}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress}
            isRead={readIds?.has(book.id)}
            isDownloaded={downloadedBookIds.includes(book.id)}
            isDownloading={downloadingBookIds?.has(book.id)}
            downloadProgress={downloadProgressByBookId?.[book.id] ?? 0}
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
