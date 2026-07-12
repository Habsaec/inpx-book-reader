import React from 'react';
import { Book, ServerConfig } from '../../types';
import { theme } from '../../lib/appTheme';
import LiteBookRow from '../LiteBookRow';
import BookCover from '../BookCover';
import ReadProgressBar from '../ReadProgressBar';
import type { CatalogViewMode } from './catalogTypes';
import { textStyles, motion, elevation } from '../../ui/tokens';
import VirtualList from '../../ui/VirtualList';
import { bookHasPendingSync } from '../../lib/syncStats';
import { Check, Download } from 'lucide-react';
import BookMetaSummary from '../BookMetaSummary';

const LIST_ROW_HEIGHT = 132;
const VIRTUALIZE_THRESHOLD = 40;

interface CatalogBookListProps {
  books: Book[];
  viewMode: CatalogViewMode;
  isServerBrowse: boolean;
  serverConfig: ServerConfig | null;
  isAppDark: boolean;
  downloadedBookIds: string[];
  readIds?: Set<string>;
  readingProgressByBookId?: Record<string, number>;
  onBookClick: (book: Book) => void;
}

export default function CatalogBookList({
  books,
  viewMode,
  isServerBrowse,
  serverConfig,
  isAppDark,
  downloadedBookIds,
  readIds,
  readingProgressByBookId,
  onBookClick,
}: CatalogBookListProps) {
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {books.map((book) => {
          const progress = readingProgressByBookId?.[book.id] ?? book.readProgress ?? 0;
          return (
            <button
              key={book.id}
              type="button"
              onClick={() => onBookClick(book)}
              aria-label={`Открыть: ${book.title}`}
              className={`text-left rounded-xl border p-2 ${theme.card} ${elevation.card} ${theme.focusRing} ${motion.press} ${motion.colors}`}
            >
              <span className="relative block w-full aspect-[2/3] overflow-hidden rounded-lg mb-2 bg-[var(--app-surface)]">
                <BookCover
                  bookId={book.id}
                  title={book.title}
                  author={book.author}
                  serverConfig={serverConfig}
                  className="absolute inset-0 w-full h-full"
                />
                {readIds?.has(book.id) && (
                  <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[var(--app-success)] text-white flex items-center justify-center shadow border border-white/40" title="Прочитано" aria-label="Прочитано">
                    <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />
                  </span>
                )}
                {downloadedBookIds.includes(book.id) && (
                  <span className={`absolute bottom-3 left-1.5 px-1.5 py-1 rounded-lg bg-black/70 text-white inline-flex items-center gap-1 ${textStyles.microCaps}`}>
                    <Download className="w-3 h-3" aria-hidden /> На устройстве
                  </span>
                )}
              </span>
              <p className={`${textStyles.bookTitle} line-clamp-2`}>{book.title}</p>
              <p className={`${textStyles.micro} ${theme.textMuted} line-clamp-1 mt-0.5`}>{book.author}</p>
              <span className="block mt-1"><BookMetaSummary book={book} compact /></span>
              {progress > 0 && <ReadProgressBar value={progress} showLabel className="mt-2" />}
            </button>
          );
        })}
      </div>
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
              isRead={readIds?.has(book.id)}
              readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress}
              isDownloaded={downloadedBookIds.includes(book.id)}
              showDownloadStatus={isServerBrowse}
              hasPendingSync={downloadedBookIds.includes(book.id) && bookHasPendingSync(book.id)}
              isAppDark={isAppDark}
              onClick={() => onBookClick(book)}
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
          isRead={readIds?.has(book.id)}
          readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress}
          isDownloaded={downloadedBookIds.includes(book.id)}
          showDownloadStatus={isServerBrowse}
          hasPendingSync={downloadedBookIds.includes(book.id) && bookHasPendingSync(book.id)}
          isAppDark={isAppDark}
          onClick={() => onBookClick(book)}
        />
      ))}
    </div>
  );
}
