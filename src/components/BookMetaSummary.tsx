import React from 'react';
import { Star } from 'lucide-react';
import { theme } from '../lib/appTheme';
import type { Book } from '../types';
import { textStyles, semantic } from '../ui/tokens';

interface BookMetaSummaryProps {
  book: Book;
  compact?: boolean;
  showDescription?: boolean;
  /** Reserve fixed rows so adjacent grid cards stay level */
  gridAlign?: boolean;
}

function genresLabel(book: Book): string {
  if (book.genresDisplay?.length) return book.genresDisplay.slice(0, 3).join(', ');
  return [book.genre, book.subgenre && book.subgenre !== book.genre ? book.subgenre : null]
    .filter(Boolean)
    .join(', ');
}

function yearLabel(book: Book): string {
  if (book.year) return String(book.year);
  const match = String(book.date || '').match(/\b(18|19|20)\d{2}\b/);
  return match?.[0] || '';
}

function sizeLabel(size?: number): string {
  if (!size || size <= 0) return '';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  return `${Math.max(1, Math.round(size / 1024))} КБ`;
}

export default function BookMetaSummary({
  book,
  compact = false,
  showDescription = false,
  gridAlign = false,
}: BookMetaSummaryProps) {
  const genres = genresLabel(book);
  const year = yearLabel(book);
  const size = sizeLabel(book.size);
  const rating = Math.max(0, Math.min(5, Math.round(Number(book.rating) || 0)));
  const seriesText = book.series
    ? `${book.series}${book.seriesNo ? ` · ${book.seriesNo}` : ''}`
    : '';

  if (gridAlign) {
    return (
      <span className="flex flex-col flex-1 min-h-0 min-w-0">
        <span
          className={`block truncate min-h-[1.125rem] ${textStyles.micro} ${seriesText ? theme.accentText : 'invisible'}`}
          aria-hidden={!seriesText}
        >
          {seriesText || '\u00a0'}
        </span>
        <span
          className={`block truncate mt-0.5 min-h-[1.125rem] ${textStyles.micro} ${genres ? theme.textMuted : 'invisible'}`}
          aria-hidden={!genres}
        >
          {genres || '\u00a0'}
        </span>
        <span className="flex flex-wrap items-center gap-1 mt-auto pt-1 min-h-[1.5rem]">
          {rating > 0 && (
            <span className={`inline-flex items-center gap-0.5 ${semantic.warning}`} aria-label={`Рейтинг ${rating} из 5`}>
              <Star className="w-3 h-3 fill-current" aria-hidden />
              <span className={textStyles.microBold}>{rating}</span>
            </span>
          )}
          {book.ext && <span className={`${textStyles.micro} ${theme.textMuted}`}>{book.ext}</span>}
          {rating === 0 && year ? <span className={`${textStyles.micro} ${theme.textMuted}`}>{year}</span> : null}
        </span>
      </span>
    );
  }

  return (
    <span className="block min-w-0">
      {seriesText && (
        <span className={`block truncate ${compact ? textStyles.micro : textStyles.label} ${theme.accentText}`}>
          {seriesText}
        </span>
      )}
      {genres && (
        <span className={`block truncate mt-0.5 ${compact ? textStyles.micro : textStyles.label} ${theme.textMuted}`}>
          {genres}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-1.5 mt-1">
        {rating > 0 && (
          <span className={`inline-flex items-center gap-0.5 ${semantic.warning}`} aria-label={`Рейтинг ${rating} из 5`}>
            <Star className="w-3 h-3 fill-current" aria-hidden />
            <span className={textStyles.micro}>{rating}</span>
          </span>
        )}
        {book.ext && <span className={`${textStyles.micro} ${theme.textMuted}`}>{book.ext}</span>}
        {year && <span className={`${textStyles.micro} ${theme.textMuted}`}>{year}</span>}
        {size && <span className={`${textStyles.micro} ${theme.textMuted}`}>{size}</span>}
      </span>
      {showDescription && book.description && (
        <span className={`block mt-1 line-clamp-2 leading-snug ${textStyles.micro} ${theme.textMuted}`}>
          {book.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
        </span>
      )}
    </span>
  );
}
