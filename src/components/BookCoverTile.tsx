import React from 'react';
import { Check, Download, Star } from 'lucide-react';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { theme } from '../lib/appTheme';
import { textStyles, motion, semantic } from '../ui/tokens';
import BookCover from './BookCover';
import BookMetaSummary from './BookMetaSummary';
import CoverRatingBadge from './CoverRatingBadge';

function readEinkFlag(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.eink === '1';
}

/** Fallback tile width before first measure (CSS px). */
export const BOOK_COVER_TILE_WIDTH_PX = 110;
/** @deprecated kept for imports; grid sizing is column-based now. */
export const BOOK_COVER_GRID_MIN_PX = 96;
/** @deprecated kept for imports; grid sizing is column-based now. */
export const BOOK_COVER_GRID_MAX_PX = 140;
const COVER_GAP_PX = 12;

/**
 * Column count from container width (content area after page padding).
 *
 * | Width        | Columns | Typical device      |
 * |--------------|---------|---------------------|
 * | < 480px      | 3       | phones              |
 * | 480–639px    | 4       | large phone/tablet  |
 * | 640–899px    | 5       | e-readers (BOOX)    |
 * | 900–1099px   | 6       | large e-ink / tab   |
 * | 1100–1299px  | 7       | wide                |
 * | ≥ 1300px     | 8       | very wide           |
 */
export function coverGridColumnsForWidth(containerWidth: number): number {
  const w = Math.max(0, Number(containerWidth) || 0);
  if (w <= 0) return 3;
  if (w < 480) return 3;
  if (w < 640) return 4;
  if (w < 900) return 5;
  if (w < 1100) return 6;
  if (w < 1300) return 7;
  return 8;
}

/** Equal tile width so `cols` fill 100% of the row (minus gaps). */
export function coverTileLayoutForContainer(containerWidth: number): {
  cols: number;
  tileWidth: number;
} {
  const w = Math.max(0, Number(containerWidth) || 0);
  const cols = coverGridColumnsForWidth(w);
  if (w <= 0) {
    return { cols, tileWidth: BOOK_COVER_TILE_WIDTH_PX };
  }
  const tileWidth = Math.max(1, Math.floor((w - COVER_GAP_PX * (cols - 1)) / cols));
  return { cols, tileWidth };
}

/** Home carousel: same tile size as the grid on this width (~3 visible on phone). */
export function shelfTileWidthForContainer(containerWidth: number): number {
  return coverTileLayoutForContainer(containerWidth).tileWidth;
}

export interface BookCoverTileProps {
  book: Book;
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  readProgress?: number;
  isRead?: boolean;
  isDownloaded?: boolean;
  showMeta?: boolean;
  showAuthor?: boolean;
  /**
   * `shelf` — fixed px width from layout helper (Home / grid).
   * `grid` — fill parent track (legacy; prefer shelf + tileWidthPx).
   */
  size?: 'shelf' | 'grid';
  /** Override shelf tile width (from ResizeObserver). */
  tileWidthPx?: number;
  showSeriesVolume?: boolean;
  selected?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
  className?: string;
}

const LONG_PRESS_MS = 420;

export default function BookCoverTile({
  book,
  serverConfig,
  storageDirectory,
  readProgress = 0,
  isRead = false,
  isDownloaded = false,
  showMeta = true,
  showAuthor = true,
  size = 'grid',
  tileWidthPx,
  showSeriesVolume = false,
  selected = false,
  onClick,
  onLongPress,
  className = '',
}: BookCoverTileProps) {
  const progress = isRead ? 100 : Math.max(0, Math.min(100, Math.round(readProgress || book.readProgress || 0)));
  const isFullyRead = isRead || progress >= 100;
  const showProgressPct = progress > 0 && progress < 100 && !isFullyRead;
  const rating = Math.max(0, Math.min(5, Math.round(Number(book.rating) || 0)));
  const volumeLabel = showSeriesVolume
    ? (book.seriesNoLabel || (book.seriesNo != null ? String(book.seriesNo) : '')).trim()
    : '';
  const titleText = volumeLabel ? `${volumeLabel}. ${book.title}` : book.title;
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = React.useRef(false);
  const isShelf = size === 'shelf';
  const shelfW = Math.max(1, Math.round(tileWidthPx ?? BOOK_COVER_TILE_WIDTH_PX));
  const shelfH = Math.round(shelfW * 1.5);
  const [isEink, setIsEink] = React.useState(readEinkFlag);

  React.useEffect(() => {
    const el = document.documentElement;
    const sync = () => setIsEink(el.dataset.eink === '1');
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-eink'] });
    return () => obs.disconnect();
  }, []);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = () => {
    if (!onLongPress) return;
    longPressFired.current = false;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };

  const handleClick = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onClick?.();
  };

  React.useEffect(() => () => clearLongPress(), []);

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
      aria-label={`${selected ? 'Выбрано: ' : 'Открыть: '}${titleText}`}
      aria-pressed={selected || undefined}
      className={`text-left flex flex-col min-w-0 ${isShelf ? 'shrink-0' : 'w-full'} ${theme.focusRing} ${motion.bookPress} ${motion.colors} ${className}`}
      style={isShelf ? { width: shelfW } : undefined}
    >
      <span
        className={`book-cover shrink-0 ${isShelf ? '' : 'w-full'} ${
          selected ? 'ring-2 ring-[var(--app-link)] ring-offset-2 ring-offset-[var(--app-bg)]' : ''
        }`}
        style={isShelf ? { width: shelfW, height: shelfH } : undefined}
      >
        <span className="book-cover-inner">
          <BookCover
            bookId={book.id}
            title={book.title}
            author={book.author}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            width={isShelf ? shelfW : undefined}
            height={isShelf ? shelfH : undefined}
            className="absolute inset-0 w-full h-full max-w-full max-h-full !rounded-none !border-0"
          />
          {volumeLabel ? (
            <span
              className="absolute top-1.5 right-1.5 z-[6] min-w-6 h-6 px-1.5 rounded-md bg-black/75 text-white inline-flex items-center justify-center text-xs font-bold tabular-nums"
              aria-label={`Том ${volumeLabel}`}
            >
              {volumeLabel}
            </span>
          ) : null}
          {isFullyRead && (
            <span
              className={`absolute z-[6] w-6 h-6 rounded-full bg-[var(--app-success)] text-white flex items-center justify-center shadow border border-white/40 ${
                volumeLabel ? 'bottom-2 right-1.5' : 'top-1.5 right-1.5'
              }`}
              title="Прочитано"
              aria-label="Прочитано"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />
            </span>
          )}
          {isDownloaded && !isFullyRead && (
            <span
              className="absolute z-[6] bottom-2 left-1.5 w-6 h-6 rounded-full bg-black/65 text-white inline-flex items-center justify-center"
              title="На устройстве"
              aria-label="На устройстве"
            >
              <Download className="w-3 h-3" aria-hidden />
            </span>
          )}
          {progress > 0 && (
            <span
              className="absolute inset-x-0 bottom-0 z-[6] h-1 bg-black/35"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Прогресс чтения ${progress}%`}
            >
              <span
                className={`block h-full ${progress >= 100 ? 'bg-[var(--app-success)]' : theme.progress}`}
                style={{ width: `${progress}%` }}
              />
            </span>
          )}
          {showProgressPct && (
            <span
              className="absolute bottom-1.5 right-1.5 z-[6] rounded bg-black/70 px-1 py-px text-white tabular-nums leading-none"
              aria-hidden
            >
              <span className={`${textStyles.microBold} text-[10px]`}>{progress}%</span>
            </span>
          )}
          {/* Pre-ribbon rating (e-ink): Star + digit pill on the cover */}
          {isEink && rating > 0 && (
            <span
              className={`absolute z-[6] inline-flex items-center gap-0.5 rounded-md bg-black/75 px-1.5 py-0.5 text-white ${
                progress > 0 ? 'bottom-2 right-1.5' : 'bottom-1.5 right-1.5'
              }`}
              aria-label={`Рейтинг ${rating} из 5`}
            >
              <Star className={`w-3 h-3 fill-current ${semantic.warning}`} aria-hidden />
              <span className={`${textStyles.microBold} tabular-nums leading-none`}>{rating}</span>
            </span>
          )}
          {selected && (
            <span
              className="absolute top-1.5 right-1.5 z-[7] w-6 h-6 rounded-full bg-[var(--app-link)] text-white flex items-center justify-center"
              aria-hidden
            >
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
            </span>
          )}
        </span>
        {/* Sibling of inner — same as server `.cover` (above spine groove overlay); hidden on e-ink via CSS */}
        {!isEink ? (
          <CoverRatingBadge rating={rating} coverWidthPx={isShelf ? shelfW : undefined} />
        ) : null}
      </span>
      {showMeta && (
        <span className="flex flex-col min-w-0 gap-1.5 mt-3">
          <p className={`${textStyles.bookTitle} line-clamp-3 text-[15px] font-semibold leading-snug`}>{titleText}</p>
          {showAuthor && (
            <p className={`${textStyles.caption} ${theme.textMuted} line-clamp-2 opacity-80`}>
              {book.author || '\u00a0'}
            </p>
          )}
          {!isShelf && (
            <span className="flex flex-col mt-0.5 min-h-0">
              <BookMetaSummary book={book} compact gridAlign />
            </span>
          )}
        </span>
      )}
    </button>
  );
}
