import React from 'react';
import { Book, ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import LiteBookRow from '../LiteBookRow';
import BookCoverGrid from '../BookCoverGrid';
import type { CatalogViewMode } from './catalogTypes';
import VirtualList from '../../ui/VirtualList';
import { bookHasPendingSync } from '../../lib/syncStats';

const LIST_ROW_HEIGHT = 132;
const VIRTUALIZE_THRESHOLD = 40;

interface CatalogBookListProps {
  books: Book[];
  viewMode: CatalogViewMode;
  isServerBrowse: boolean;
  serverConfig: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  isAppDark: boolean;
  downloadedBookIds: string[];
  readIds?: Set<string>;
  readingProgressByBookId?: Record<string, number>;
  onBookClick: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  /** Series drilldown: show volume numbers like server */
  showSeriesVolume?: boolean;
}

export default function CatalogBookList({
  books,
  viewMode,
  isServerBrowse,
  serverConfig,
  storageDirectory,
  isAppDark,
  downloadedBookIds,
  readIds,
  readingProgressByBookId,
  onBookClick,
  onBookLongPress,
  showSeriesVolume = false,
}: CatalogBookListProps) {
  if (viewMode === 'grid') {
    return (
      <BookCoverGrid
        books={books}
        serverConfig={serverConfig}
        storageDirectory={storageDirectory}
        downloadedBookIds={downloadedBookIds}
        readIds={readIds}
        readingProgressByBookId={readingProgressByBookId}
        showSeriesVolume={showSeriesVolume}
        onBookClick={onBookClick}
        onBookLongPress={onBookLongPress}
      />
    );
  }

  if (books.length >= VIRTUALIZE_THRESHOLD) {
    return (
      <div className="max-h-[min(70vh,640px)]">
        <VirtualList
          items={books}
          itemHeight={LIST_ROW_HEIGHT}
          className=""
          getKey={(book) => book.id}
          renderItem={(book) => (
            <LiteBookRow
              compact
              book={book}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              isRead={readIds?.has(book.id)}
              readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress}
              isDownloaded={downloadedBookIds.includes(book.id)}
              showDownloadStatus={isServerBrowse}
              hasPendingSync={downloadedBookIds.includes(book.id) && bookHasPendingSync(book.id)}
              isAppDark={isAppDark}
              onClick={() => onBookClick(book)}
              onLongPress={onBookLongPress ? () => onBookLongPress(book) : undefined}
            />
          )}
        />
      </div>
    );
  }

  return (
    <div>
      {books.map((book) => (
        <LiteBookRow
          key={book.id}
          compact
          book={book}
          serverConfig={serverConfig}
          storageDirectory={storageDirectory}
          isRead={readIds?.has(book.id)}
          readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress}
          isDownloaded={downloadedBookIds.includes(book.id)}
          showDownloadStatus={isServerBrowse}
          hasPendingSync={downloadedBookIds.includes(book.id) && bookHasPendingSync(book.id)}
          isAppDark={isAppDark}
          onClick={() => onBookClick(book)}
          onLongPress={onBookLongPress ? () => onBookLongPress(book) : undefined}
        />
      ))}
    </div>
  );
}
