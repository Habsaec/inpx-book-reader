import React from 'react';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import BookCoverTile, {
  BOOK_COVER_TILE_WIDTH_PX,
  coverTileLayoutForContainer,
} from './BookCoverTile';
import { sortBooksBySeriesVolume } from '../lib/seriesVolumeSort';

export { sortBooksBySeriesVolume, seriesVolumeSortKey } from '../lib/seriesVolumeSort';
export { BOOK_COVER_TILE_WIDTH_PX };

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
  renderTileExtra?: (book: Book) => React.ReactNode;
}

/**
 * Cover grid: column count by width breakpoints (phone 3 → e-reader 5 → wider more),
 * tiles share the row evenly. Sized via ResizeObserver (no fragile CSS minmax).
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
  renderTileExtra,
}: BookCoverGridProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [tileWidthPx, setTileWidthPx] = React.useState(BOOK_COVER_TILE_WIDTH_PX);

  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const apply = (width: number) => {
      const w = width > 0 ? width : el.clientWidth;
      if (w <= 0) return;
      const { tileWidth } = coverTileLayoutForContainer(w);
      setTileWidthPx((prev) => (prev === tileWidth ? prev : tileWidth));
    };

    const measure = () => apply(el.getBoundingClientRect().width || el.clientWidth);

    measure();
    const raf = requestAnimationFrame(measure);

    if (typeof ResizeObserver === 'undefined') {
      return () => cancelAnimationFrame(raf);
    }

    const ro = new ResizeObserver((entries) => {
      const entryW = entries[0]?.contentRect?.width ?? 0;
      apply(entryW || el.clientWidth);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const ordered = React.useMemo(
    () => (showSeriesVolume ? sortBooksBySeriesVolume(books) : books),
    [books, showSeriesVolume],
  );

  return (
    <div ref={rootRef} className="flex flex-wrap gap-3 w-full min-w-0">
      {ordered.map((book) => (
        <div key={book.id} className="relative shrink-0" style={{ width: tileWidthPx }}>
          <BookCoverTile
            book={book}
            size="shelf"
            tileWidthPx={tileWidthPx}
            showMeta
            showSeriesVolume={showSeriesVolume}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress}
            isRead={readIds?.has(book.id)}
            isDownloaded={downloadedBookIds.includes(book.id)}
            onClick={() => onBookClick(book)}
            onLongPress={onBookLongPress ? () => onBookLongPress(book) : undefined}
          />
          {renderTileExtra?.(book)}
        </div>
      ))}
    </div>
  );
}
