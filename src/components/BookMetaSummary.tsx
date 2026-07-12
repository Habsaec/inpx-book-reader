import React from 'react';
import { Star } from 'lucide-react';
import { theme } from '../lib/appTheme';
import type { Book } from '../types';
import { textStyles } from '../ui/tokens';

interface BookMetaSummaryProps {
  book: Book;
  compact?: boolean;
  showDescription?: boolean;
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

export default function BookMetaSummary({ book, compact = false, showDescription = false }: BookMetaSummaryProps) {
  const genres = genresLabel(book);
  const year = yearLabel(book);
  const size = sizeLabel(book.size);
  const rating = Math.max(0, Math.min(5, Math.round(Number(book.rating) || 0)));

  return (
    <span className="block min-w-0">
      {book.series && (
        <span className={`block truncate ${compact ? textStyles.micro : textStyles.label} ${theme.accentText}`}>
          {book.series}{book.seriesNo ? ` · ${book.seriesNo}` : ''}
        </span>
      )}
      {genres && (
        <span className={`block truncate mt-0.5 ${compact ? textStyles.micro : textStyles.label} ${theme.textMuted}`}>
          {genres}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-1 mt-1">
        {rating > 0 && (
          <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`Рейтинг ${rating} из 5`}>
            <Star className="w-3 h-3 fill-current" aria-hidden />
            <span className={textStyles.microBold}>{rating}</span>
          </span>
        )}
        {book.ext && <span className={`px-1.5 py-0.5 rounded-md uppercase ${textStyles.microBold} ${theme.chip}`}>{book.ext}</span>}
        {year && <span className={`px-1.5 py-0.5 rounded-md ${textStyles.microBold} ${theme.chip}`}>{year}</span>}
        {size && <span className={`px-1.5 py-0.5 rounded-md ${textStyles.microBold} ${theme.chip}`}>{size}</span>}
      </span>
      {showDescription && book.description && (
        <span className={`block mt-1 line-clamp-2 leading-snug ${textStyles.micro} ${theme.textMuted}`}>
          {book.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
        </span>
      )}
    </span>
  );
}
