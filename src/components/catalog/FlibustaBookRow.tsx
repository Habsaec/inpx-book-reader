import React from 'react';
import { Check } from 'lucide-react';
import { Book } from '../../types';
import { theme } from '../../lib/appTheme';
import { textStyles, semantic, motion, radii } from '../../ui/tokens';
import DownloadStatusLabel from '../DownloadStatusLabel';

function volumeLabel(book: Book, index: number, showVolume: boolean): string {
  if (showVolume) {
    const raw = (book.seriesNoLabel || (book.seriesNo != null ? String(book.seriesNo) : '')).trim();
    if (raw) return `${raw}.`;
  }
  return `${index + 1}.`;
}

function ratingValue(rating?: number): number {
  if (rating == null || !Number.isFinite(rating) || rating <= 0) return 0;
  return Math.max(0, Math.min(5, Math.round(rating)));
}

/** Compact book row matching server Flibusta / author list: `N. Title  ★★  FB2`. */
export default function FlibustaBookRow({
  book,
  index,
  showVolume = false,
  isDownloaded,
  isDownloading,
  isSelected = false,
  onClick,
  onLongPress,
}: {
  book: Book;
  index: number;
  /** Prefer series volume number when present. */
  showVolume?: boolean;
  isDownloaded?: boolean;
  isDownloading?: boolean;
  isSelected?: boolean;
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

  const rating = ratingValue(book.rating);
  const ext = (book.ext || '').replace(/^\./, '').toUpperCase();

  return (
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
      className={`w-full flex items-center gap-2 min-h-11 py-2.5 px-3 mb-1 last:mb-0 text-left ${radii.md} ${theme.rowPress} ${motion.press} ${theme.focusRing} ${
        isSelected ? theme.accentMuted : 'hover:bg-[var(--app-surface-hover)]'
      }`}
    >
      {isSelected ? (
        <span className={`shrink-0 w-8 inline-flex items-center justify-center ${theme.accentText}`} aria-hidden>
          <Check className="w-4 h-4" />
        </span>
      ) : (
        <span className={`shrink-0 w-8 tabular-nums ${textStyles.caption} ${theme.textMuted}`}>
          {volumeLabel(book, index, showVolume)}
        </span>
      )}
      <span className={`flex-1 min-w-0 truncate ${textStyles.body} ${theme.text}`}>{book.title}</span>
      {rating > 0 ? (
        <span className={`shrink-0 text-xs tracking-tight ${semantic.warning}`} aria-label={`Рейтинг ${rating}`}>
          {'★'.repeat(rating)}
        </span>
      ) : null}
      {ext ? (
        <span className={`shrink-0 ${textStyles.micro} ${theme.textMuted}`}>{ext}</span>
      ) : null}
      <DownloadStatusLabel
        isDownloaded={Boolean(isDownloaded)}
        isDownloading={Boolean(isDownloading)}
        showNotDownloaded={false}
        className="shrink-0"
      />
    </button>
  );
}
