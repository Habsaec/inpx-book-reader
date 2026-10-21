import React from 'react';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import BookCoverTile, { coverGridColumnsForWidth } from './BookCoverTile';
import Skeleton from '../ui/Skeleton';
import { textStyles } from '../ui/tokens';
import { theme } from '../lib/appTheme';

interface BookShelfGridProps {
  books: Book[];
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  readingProgressByBookId?: Record<string, number>;
  downloadedBookIds?: string[];
  readIds?: Set<string>;
  loading?: boolean;
  /** Show only this many full rows; the rest sits behind the section's «Все». */
  maxRows?: number;
  onBookClick: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  emptyLabel?: string;
}

/**
 * Covers in a grid as wide as the page. No sideways scrolling: on e-ink it smears
 * and on tablets it leaves half the row empty.
 */
export default function BookShelfGrid({
  books,
  serverConfig,
  storageDirectory,
  readingProgressByBookId,
  downloadedBookIds = [],
  readIds,
  loading = false,
  maxRows,
  onBookClick,
  onBookLongPress,
  emptyLabel,
}: BookShelfGridProps) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [cols, setCols] = React.useState(3);

  React.useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const apply = (width: number) => {
      const next = coverGridColumnsForWidth(width);
      setCols((prev) => (prev === next ? prev : next));
    };
    apply(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => apply(entries[0]?.contentRect?.width ?? el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (books.length === 0 && !loading) {
    if (!emptyLabel) return null;
    return <p className={`${textStyles.caption} ${theme.textMuted} py-2`}>{emptyLabel}</p>;
  }

  const shown = maxRows ? books.slice(0, cols * maxRows) : books;

  return (
    <div
      ref={gridRef}
      className="grid gap-x-3 gap-y-5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      role="list"
      aria-busy={loading || undefined}
    >
      {loading && books.length === 0
        ? Array.from({ length: cols * (maxRows ?? 1) }, (_, i) => (
            <div key={i} className="space-y-2" aria-hidden>
              <Skeleton className="w-full aspect-[2/3]" />
              <Skeleton variant="block" blockSize="md" className="max-w-full" />
              <Skeleton variant="block" blockSize="sm" className="max-w-[70%]" />
            </div>
          ))
        : null}
      {shown.map((book) => (
        <div key={book.id} className="min-w-0" role="listitem">
          <BookCoverTile
            book={book}
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
