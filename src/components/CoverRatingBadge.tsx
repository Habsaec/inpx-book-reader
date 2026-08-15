import React from 'react';

/** Server base cover width the fixed ribbon (17×75) was designed for. */
const SERVER_COVER_W = 176;

/** Bookmark ribbon ★ badge — matches INPX Library Server `.cover-rating-*`. */
export default function CoverRatingBadge({
  rating,
  /** Cover width in CSS px — scales ribbon to card size. */
  coverWidthPx,
  className = '',
}: {
  rating: number;
  coverWidthPx?: number;
  className?: string;
}) {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  if (n <= 0) return null;

  const w = Math.round(Number(coverWidthPx) || 0);
  const style =
    w > 0
      ? ({ ['--cover-w' as string]: `${w}px` } as React.CSSProperties)
      : undefined;

  return (
    <span
      className={`cover-rating-wrapper ${className}`.trim()}
      style={style}
      aria-label={`Рейтинг ${n} из 5`}
      data-cover-ref={SERVER_COVER_W}
    >
      <span className={`cover-rating-badge cover-rating-${n}`}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className="star-active" aria-hidden>
            ★
          </span>
        ))}
      </span>
    </span>
  );
}
