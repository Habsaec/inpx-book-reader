import React from 'react';
import { Check, MoreVertical, Star } from 'lucide-react';
import { Book, ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import { theme } from '../../lib/appTheme';
import { textStyles, motion, semantic } from '../../ui/tokens';
import BookCover from '../BookCover';
import ReadProgressBar from '../ReadProgressBar';
import DownloadStatusLabel from '../DownloadStatusLabel';
import { displayBookTitle, seriesLabel } from '../../lib/seriesLabel';
import { isBookFinished } from '../../lib/bookOpenPolicy';
import ReadMark from '../ReadMark';

const COVER_W = 56;
const COVER_H = 84;

/** Cover list row — ~104px, title + author + progress. */
export default function FlibustaBookRow({
  book,
  serverConfig,
  storageDirectory,
  isDownloaded,
  isDownloading,
  downloadProgress = 0,
  readProgress = 0,
  isRead = false,
  isSelected = false,
  showFileExt = false,
  onClick,
  onLongPress,
}: {
  book: Book;
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  isDownloaded?: boolean;
  isDownloading?: boolean;
  downloadProgress?: number;
  readProgress?: number;
  isRead?: boolean;
  isSelected?: boolean;
  showFileExt?: boolean;
  onClick: () => void;
  onLongPress?: () => void;
}) {
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = React.useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  React.useEffect(() => () => clearLongPress(), []);

  const titleText = displayBookTitle(book);
  const extLabel = showFileExt && book.ext ? book.ext.toUpperCase() : '';
  const seriesText = showFileExt ? seriesLabel(book) : '';
  const fileLine = [extLabel, seriesText].filter(Boolean).join(' · ');
  const rating = Math.max(0, Math.min(5, Math.round(Number(book.rating) || 0)));
  const progress = Math.max(0, Math.min(100, Math.round(readProgress || book.readProgress || 0)));
  const finished = isBookFinished(progress, isRead);

  return (
    <div
      className={`w-full flex items-stretch ${showFileExt ? 'min-h-[104px]' : 'h-[104px]'} border-b last:border-b-0 ${theme.divider} ${
        isSelected ? theme.accentMuted : ''
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (longPressFired.current) {
            longPressFired.current = false;
            return;
          }
          onClick();
        }}
        onPointerDown={() => {
          if (!onLongPress) return;
          longPressFired.current = false;
          clearLongPress();
          longPressTimer.current = setTimeout(() => {
            longPressFired.current = true;
            onLongPress();
          }, 420);
        }}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
        aria-pressed={isSelected || undefined}
        className={`flex-1 min-w-0 flex items-center gap-3 px-1 text-left ${theme.rowPress} ${motion.press} ${theme.focusRing}`}
      >
        <span className="book-cover w-14 h-[84px] shrink-0 relative">
          <span className="book-cover-inner">
            <BookCover
              bookId={book.id}
              title={book.title}
              author={book.author}
              serverConfig={serverConfig}
              storageDirectory={storageDirectory}
              variant="thumb"
              width={COVER_W}
              height={COVER_H}
              className="absolute inset-0 w-full h-full !rounded-none !border-0"
            />
          </span>
          {isSelected ? (
            <span className="absolute top-1 right-1 z-[2] w-5 h-5 rounded-full bg-[var(--app-accent)] text-white flex items-center justify-center">
              <Check className="w-3 h-3" strokeWidth={3} aria-hidden />
            </span>
          ) : finished ? (
            <ReadMark className="top-1 right-1" />
          ) : null}
          {rating > 0 && !isDownloading ? (
            <span
              className="absolute z-[6] top-1 left-1 inline-flex items-center gap-0.5 rounded bg-black/75 px-1 py-px text-white"
              aria-label={`Рейтинг ${rating} из 5`}
            >
              <Star className={`w-2.5 h-2.5 fill-current ${semantic.warning}`} aria-hidden />
              <span className={`${textStyles.microBold} text-[10px] leading-none`}>{rating}</span>
            </span>
          ) : null}
        </span>
        <span className="flex-1 min-w-0 flex flex-col justify-center gap-1 py-2">
          <span className={`${textStyles.bookTitle} line-clamp-2 ${theme.text}`}>{titleText}</span>
          {book.author ? (
            <span className={`${textStyles.caption} ${theme.textMuted} truncate`}>{book.author}</span>
          ) : null}
          {fileLine ? (
            <span className={`${textStyles.micro} ${theme.textMuted} truncate`}>{fileLine}</span>
          ) : null}
          {isDownloading ? (
            <span className="flex items-center gap-2">
              <span
                className="flex-1 min-w-0 h-1 rounded-full bg-[var(--app-progress-track,var(--app-border))] overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(downloadProgress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Прогресс скачивания"
              >
                <span className={`block h-full ${theme.progress}`} style={{ width: `${Math.max(4, downloadProgress)}%` }} />
              </span>
              <span className={`shrink-0 ${textStyles.caption} tabular-nums ${theme.textMuted}`}>
                {Math.round(downloadProgress)}%
              </span>
            </span>
          ) : !finished && progress > 0 ? (
            <ReadProgressBar value={progress} />
          ) : (
            <DownloadStatusLabel
              isDownloaded={Boolean(isDownloaded)}
              isDownloading={Boolean(isDownloading)}
              showNotDownloaded={false}
            />
          )}
        </span>
      </button>
      {onLongPress ? (
        <button
          type="button"
          aria-label="Ещё действия"
          className={`shrink-0 min-h-12 min-w-12 self-center inline-flex items-center justify-center ${theme.textMuted} ${theme.rowPress} ${motion.press} ${theme.focusRing}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onLongPress();
          }}
        >
          <MoreVertical className="w-4 h-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
