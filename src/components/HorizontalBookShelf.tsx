import React from 'react';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import BookCoverTile, {
  BOOK_COVER_TILE_WIDTH_PX,
  shelfTileWidthForContainer,
} from './BookCoverTile';
import { BookShelfSkeleton } from '../ui/Skeleton';
import { textStyles } from '../ui/tokens';
import { theme } from '../lib/appTheme';

interface HorizontalBookShelfProps {
  books: Book[];
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  readingProgressByBookId?: Record<string, number>;
  downloadedBookIds?: string[];
  readIds?: Set<string>;
  loading?: boolean;
  onBookClick: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  emptyLabel?: string;
}

/**
 * Horizontal shelf — tile width matches the cover grid on this container width.
 */
export default function HorizontalBookShelf({
  books,
  serverConfig,
  storageDirectory,
  readingProgressByBookId,
  downloadedBookIds = [],
  readIds,
  loading = false,
  onBookClick,
  onBookLongPress,
  emptyLabel,
}: HorizontalBookShelfProps) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [tileWidthPx, setTileWidthPx] = React.useState(BOOK_COVER_TILE_WIDTH_PX);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const apply = (width: number) => {
      const next = shelfTileWidthForContainer(width);
      setTileWidthPx((prev) => (prev === next ? prev : next));
    };

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? el.clientWidth;
      apply(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (books.length === 0 && !loading) {
    if (!emptyLabel) return null;
    return <p className={`${textStyles.caption} ${theme.textMuted} py-2`}>{emptyLabel}</p>;
  }

  // Bleeds into the page's px-5 so the next cover peeks at the screen edge.
  return (
    <div
      ref={scrollerRef}
      data-swipe-lock
      className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-px-5 pt-1 pb-3 -mx-5 px-5"
      role="list"
    >
      {loading ? <BookShelfSkeleton count={5} tileWidthPx={tileWidthPx} /> : null}
      {books.map((book) => (
        <div
          key={book.id}
          className="snap-start shrink-0"
          role="listitem"
        >
          <BookCoverTile
            book={book}
            size="shelf"
            tileWidthPx={tileWidthPx}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress}
            isRead={readIds?.has(book.id)}
            isDownloaded={downloadedBookIds.includes(book.id)}
            onClick={() => onBookClick(book)}
            onLongPress={onBookLongPress ? () => onBookLongPress(book) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
