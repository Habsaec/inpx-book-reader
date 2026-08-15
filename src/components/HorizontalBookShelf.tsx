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

    apply(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? el.clientWidth;
      apply(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (loading) {
    return <BookShelfSkeleton count={5} tileWidthPx={tileWidthPx} />;
  }

  if (books.length === 0) {
    if (!emptyLabel) return null;
    return <p className={`${textStyles.caption} ${theme.textMuted} py-2`}>{emptyLabel}</p>;
  }

  return (
    <div
      ref={scrollerRef}
      data-swipe-lock
      className="flex gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-2 -mx-1 px-1"
      role="list"
    >
      {books.map((book, index) => (
        <div
          key={book.id}
          className="snap-start shrink-0 inpx-enter-y"
          role="listitem"
          style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
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
