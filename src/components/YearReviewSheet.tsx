import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { displayAuthorName, fetchYearReview, isAuthError, type YearReview } from '../lib/inpxClient';
import type { ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { radii, textStyles, motion as motionTokens } from '../ui/tokens';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import BookCover from './BookCover';
import EmptyState from '../ui/EmptyState';
import { BookOpen } from 'lucide-react';
import { t, tn, formatNumber, getLocale } from '../i18n';

interface YearReviewSheetProps {
  open: boolean;
  initialYear: number;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  onClose: () => void;
  onAuthExpired?: () => void;
}

const monthName = (m: number, style: 'long' | 'short') =>
  new Date(2000, m - 1, 1).toLocaleString(getLocale(), { month: style });

/**
 * «Итоги года» (from the profile goal card): the same data and layout as the web /library/year —
 * the big number, a mosaic of covers (server placeholders while they load), months with the busiest
 * one highlighted, first / last / favourite book, top authors, genres and series, other years.
 */
export default function YearReviewSheet({ open, initialYear, serverConfig, storageDirectory, onClose, onAuthExpired }: YearReviewSheetProps) {
  const [year, setYear] = React.useState(initialYear);
  const [review, setReview] = React.useState<YearReview | null>(null);
  const [failed, setFailed] = React.useState(false);

  useOverlayBackHandler(open, onClose);

  React.useEffect(() => { if (open) setYear(initialYear); }, [open, initialYear]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFailed(false);
    fetchYearReview(serverConfig, year)
      .then((value) => { if (!cancelled) { setReview(value); setFailed(!value); } })
      .catch((e) => {
        if (cancelled) return;
        if (isAuthError(e)) onAuthExpired?.();
        setFailed(true);
      });
    return () => { cancelled = true; };
  }, [open, year, serverConfig, onAuthExpired]);

  if (!open) return null;

  const current = review && review.year === year ? review : null;
  const years = current ? [...new Set([year, ...current.years])].sort((a, b) => b - a) : [year];
  const maxMonth = current ? Math.max(1, ...current.byMonth) : 1;
  const genreLabel = (g: YearReview['topGenres'][number]) =>
    (getLocale() === 'en' && g.displayNameEn) || g.displayName || g.name;

  const bookLine = (label: string, book: YearReview['first']) => (book ? (
    <div className="min-w-0">
      <p className={`${textStyles.caption} ${theme.textMuted}`}>{label}</p>
      <p className={`${textStyles.bodyBold} ${theme.text} line-clamp-2`}>{book.title}</p>
      {book.authors ? <p className={`${textStyles.caption} ${theme.textMuted} line-clamp-1`}>{displayAuthorName(book.authors.split(':')[0])}</p> : null}
    </div>
  ) : null);

  const topList = (title: string, items: Array<{ count: number }>, label: (it: never) => string) => (items.length ? (
    <section className={`p-4 ${radii.lg} ${theme.card}`}>
      <h3 className={`${textStyles.bodyBold} ${theme.text} mb-2`}>{title}</h3>
      <ol className="list-decimal pl-5 space-y-1">
        {items.map((it, i) => (
          <li key={i} className={`${textStyles.body} ${theme.text}`}>
            <span className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{label(it as never)}</span>
              <span className={`shrink-0 ${theme.textMuted}`}>{tn('common.booksShort', it.count)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  ) : null);

  return createPortal(
    <div
      className={`fixed inset-0 z-[450] flex flex-col overflow-hidden bg-[var(--app-bg)] ${theme.text}`}
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
      role="dialog"
      aria-label={t('yearReview.title', { year })}
    >
      <div className="flex-1 min-h-0 overflow-y-auto">
        <header className="sticky top-0 z-10 min-h-16 px-1 flex items-center bg-[var(--app-bg)]">
          <button
            type="button"
            aria-label={t('common.back')}
            onClick={onClose}
            className={`w-12 h-12 shrink-0 inline-flex items-center justify-center ${radii.md} ${theme.focusRing} ${motionTokens.press}`}
          >
            <ChevronLeft className="w-6 h-6" aria-hidden />
          </button>
        </header>

        <div className="mx-auto w-full max-w-[45rem] px-5 pb-8 flex flex-col gap-4">
          <div className="text-center pt-2">
            <p className={`${textStyles.captionBold} ${theme.accentText} uppercase tracking-wide`}>{t('yearReview.title', { year })}</p>
            {current ? (
              <>
                <p className="mt-1 text-[4.5rem] leading-none font-extrabold tabular-nums text-[var(--app-text)]">{formatNumber(current.total)}</p>
                <p className={`mt-1 ${textStyles.body} ${theme.textMuted}`}>{tn('yearReview.booksThisYear', current.total)}</p>
                {current.goal ? (
                  <p className={`mt-2 ${textStyles.bodyBold}`}>
                    {current.total >= current.goal
                      ? t('yearReview.goalDone', { goal: current.goal })
                      : t('yearReview.goalProgress', { pct: Math.round((current.total / current.goal) * 100), goal: current.goal })}
                  </p>
                ) : null}
              </>
            ) : null}
            {years.length > 1 ? (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYear(y)}
                    aria-pressed={y === year}
                    className={`min-h-9 px-3 rounded-full border ${y === year ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-button-fg)]' : `border-[var(--app-border)] ${theme.textMuted}`} ${theme.focusRing}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {failed && !current ? (
            <EmptyState icon={BookOpen} title={t('yearReview.unavailable')} />
          ) : null}

          {current && current.total === 0 ? (
            <EmptyState icon={BookOpen} title={t('yearReview.emptyTitle', { year })} description={t('yearReview.emptyText')} />
          ) : null}

          {current && current.total > 0 ? (
            <>
              <div className="grid grid-cols-5 min-[480px]:grid-cols-6 gap-1.5" aria-label={t('yearReview.mosaic')}>
                {current.covers.map((book) => (
                  <span key={book.id} className="relative block aspect-[2/3] overflow-hidden rounded" style={book.coverColor ? { backgroundColor: book.coverColor } : undefined}>
                    <BookCover
                      bookId={book.id}
                      serverConfig={serverConfig}
                      storageDirectory={storageDirectory}
                      variant="thumb"
                      title={book.title}
                      placeholder={book.coverLqip}
                      className="absolute inset-0 w-full h-full !rounded-none !border-0"
                    />
                  </span>
                ))}
              </div>

              <section className={`p-4 ${radii.lg} ${theme.card}`}>
                <div className="grid grid-cols-12 gap-1 items-end h-20" aria-label={t('readingGoalCard.readByMonth')}>
                  {current.byMonth.map((n, i) => (
                    <div key={i} className="flex h-full flex-col items-center gap-1">
                      <span className="flex-1 w-full max-w-4 flex items-end rounded bg-[var(--app-progress-track)]">
                        <span
                          className="block w-full rounded"
                          style={{
                            height: n ? `${Math.max(8, Math.round((n / maxMonth) * 100))}%` : 0,
                            background: 'var(--app-accent)',
                            opacity: current.busiestMonth === i + 1 ? 1 : 0.55,
                          }}
                        />
                      </span>
                      <span className={`text-[0.625rem] leading-none ${theme.textMuted}`}>{monthName(i + 1, 'short')}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className={`p-4 ${radii.lg} ${theme.card} grid gap-4 min-[480px]:grid-cols-2`}>
                {current.busiestMonth ? (
                  <div>
                    <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('yearReview.busiestMonth')}</p>
                    <p className={`${textStyles.bodyBold} ${theme.text}`}>{monthName(current.busiestMonth, 'long')}</p>
                    <p className={`${textStyles.caption} ${theme.textMuted}`}>{tn('common.booksShort', current.byMonth[current.busiestMonth - 1] || 0)}</p>
                  </div>
                ) : null}
                {bookLine(t('yearReview.firstBook'), current.first)}
                {current.last && current.last.id !== current.first?.id ? bookLine(t('yearReview.lastBook'), current.last) : null}
                {current.favorite ? (
                  <div className="flex gap-3 min-w-0">
                    <span className="relative block w-12 shrink-0 aspect-[2/3] overflow-hidden rounded">
                      <BookCover
                        bookId={current.favorite.id}
                        serverConfig={serverConfig}
                        storageDirectory={storageDirectory}
                        variant="thumb"
                        title={current.favorite.title}
                        placeholder={current.favorite.coverLqip}
                        className="absolute inset-0 w-full h-full !rounded-none !border-0"
                      />
                    </span>
                    {bookLine(t('yearReview.favorite'), current.favorite)}
                  </div>
                ) : null}
                {current.averageRating ? (
                  <div>
                    <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('yearReview.averageRating')}</p>
                    <p className={`${textStyles.bodyBold} ${theme.text}`}>{current.averageRating} ★</p>
                    <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('yearReview.ratedCount', { n: current.ratedCount })}</p>
                  </div>
                ) : null}
              </section>

              {topList(t('yearReview.topAuthors'), current.topAuthors, (a: YearReview['topAuthors'][number]) => displayAuthorName(a.displayName || a.name))}
              {topList(t('yearReview.topGenres'), current.topGenres, genreLabel)}
              {topList(t('yearReview.topSeries'), current.topSeries, (s: YearReview['topSeries'][number]) => s.displayName || s.name)}
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
