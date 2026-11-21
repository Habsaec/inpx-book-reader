import React from 'react';
import { BookOpen } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { displayAuthorName, fetchYearReview, isAuthError, saveReadingGoal, type YearReview } from '../lib/inpxClient';
import type { ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { radii, textStyles } from '../ui/tokens';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import BookCover from './BookCover';
import { t, tn, formatNumber, getLocale } from '../i18n';

interface ProfileYearReviewProps {
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  /** Re-fetch when the profile tab is shown again (books may have been finished meanwhile). */
  refreshKey?: number;
  onAuthExpired?: () => void;
}

const monthName = (m: number, style: 'long' | 'short') =>
  new Date(2000, m - 1, 1).toLocaleString(getLocale(), { month: style });

/**
 * Profile statistics = «Итоги года» (the web profile statistics tab, GET /api/reading-stats/year):
 * year chips («Всё время» + every year with reads), the big number and the yearly goal (editable for the
 * current year), a mosaic of covers with server placeholders, a bar per month (per year for «Всё
 * время») with the busiest highlighted, first / last / favourite book, average rating and top lists.
 */
export default function ProfileYearReview({ serverConfig, storageDirectory, refreshKey = 0, onAuthExpired }: ProfileYearReviewProps) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = React.useState<number | 'all'>(thisYear);
  const [review, setReview] = React.useState<YearReview | null>(null);
  const [unsupported, setUnsupported] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    fetchYearReview(serverConfig, year)
      .then((value) => {
        if (cancelled) return;
        setReview(value);
        setUnsupported(!value);
      })
      .catch((e) => {
        if (!cancelled && isAuthError(e)) onAuthExpired?.();
      });
    return () => { cancelled = true; };
  }, [serverConfig, year, refreshKey, reloadKey, onAuthExpired]);

  if (unsupported) return null;
  if (!review || review.year !== year) return null;

  const allTime = review.allTime;
  const years = [...new Set([...(allTime ? [] : [review.year as number]), ...review.years])].sort((a, b) => b - a);
  const bars = allTime
    ? review.byYear.map((r) => ({ key: String(r.year), label: String(r.year), n: r.count, peak: r.year === review.busiestYear, year: r.year }))
    : review.byMonth.map((n, i) => ({ key: String(i), label: monthName(i + 1, 'short'), n, peak: review.busiestMonth === i + 1, year: null as number | null }));
  const maxBar = Math.max(1, ...bars.map((b) => b.n));
  const genreLabel = (g: YearReview['topGenres'][number]) => (getLocale() === 'en' && g.displayNameEn) || g.displayName || g.name;
  const goal = review.goal;

  const saveGoal = async () => {
    const value = Math.max(0, Math.min(1000, Math.floor(Number(draft) || 0)));
    setSaving(true);
    setError('');
    try {
      await saveReadingGoal(serverConfig, value, thisYear);
      setEditing(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      if (isAuthError(e)) onAuthExpired?.();
      setError(t('readingGoalCard.couldNotSaveTheGoal'));
    } finally {
      setSaving(false);
    }
  };

  const bookLine = (label: string, book: YearReview['first']) => (book ? (
    <div className="min-w-0">
      <p className={`${textStyles.caption} ${theme.textMuted}`}>{label}</p>
      <p className={`${textStyles.bodyBold} ${theme.text} line-clamp-2`}>{book.title}</p>
      {book.authors ? <p className={`${textStyles.caption} ${theme.textMuted} line-clamp-1`}>{displayAuthorName(book.authors.split(':')[0])}</p> : null}
    </div>
  ) : null);

  const topList = <T extends { count: number }>(title: string, items: T[], label: (it: T) => string) => (items.length ? (
    <section className={`p-4 ${radii.lg} ${theme.card}`}>
      <h3 className={`${textStyles.bodyBold} ${theme.text} mb-2`}>{title}</h3>
      <ol className="list-decimal pl-5 space-y-1">
        {items.map((it, i) => (
          <li key={i} className={`${textStyles.body} ${theme.text}`}>
            <span className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{label(it)}</span>
              <span className={`shrink-0 ${theme.textMuted}`}>{tn('common.booksShort', it.count)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  ) : null);

  const chip = (value: number | 'all', label: string) => (
    <button
      key={String(value)}
      type="button"
      onClick={() => setYear(value)}
      aria-pressed={value === year}
      className={`min-h-9 px-3 rounded-full border ${value === year ? 'bg-[var(--app-accent)] border-[var(--app-accent)] text-[var(--app-button-fg)]' : `border-[var(--app-border)] ${theme.textMuted}`} ${theme.focusRing}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-3 flex flex-col gap-3" aria-label={allTime ? t('yearReview.titleAll') : t('yearReview.title', { year: review.year })}>
      <section className={`p-4 ${radii.lg} ${theme.card} text-center`}>
        <p className={`${textStyles.captionBold} ${theme.accentText} uppercase tracking-wide`}>
          {allTime ? t('yearReview.titleAll') : t('yearReview.title', { year: review.year })}
        </p>
        {review.total > 0 ? (
          <>
            <p className="mt-1 text-[4rem] leading-none font-extrabold tabular-nums text-[var(--app-text)]">{formatNumber(review.total)}</p>
            <p className={`mt-1 ${textStyles.body} ${theme.textMuted}`}>
              {tn(allTime ? 'yearReview.booksAllTime' : 'yearReview.booksThisYear', review.total)}
            </p>
          </>
        ) : null}
        {!allTime && review.year === thisYear ? (
          <div className="mt-2">
            {goal ? (
              <>
                <p className={textStyles.bodyBold}>
                  {review.total >= goal
                    ? t('yearReview.goalDone', { goal })
                    : t('yearReview.goalProgress', { pct: Math.round((review.total / goal) * 100), goal })}
                </p>
                <div className="mt-2 h-2 rounded-full overflow-hidden bg-[var(--app-progress-track)]" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(review.total, goal)}>
                  <span className="block h-full rounded-full bg-[var(--app-accent)]" style={{ width: `${Math.min(100, Math.round((review.total / goal) * 100))}%` }} />
                </div>
              </>
            ) : null}
            {editing ? (
              <div className="mt-3 flex items-center justify-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('readingGoalCard.forExample40')}
                  aria-label={t('readingGoalCard.goalBooksPerYear')}
                  className={`w-28 px-3 py-2 ${radii.md} ${theme.input}`}
                />
                <Button onClick={saveGoal} loading={saving}>{t('common.save')}</Button>
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>{t('common.cancel')}</Button>
              </div>
            ) : (
              <button
                type="button"
                className={`mt-2 ${textStyles.caption} ${theme.accentText} ${theme.focusRing} ${radii.sm}`}
                onClick={() => { setDraft(goal ? String(goal) : ''); setEditing(true); }}
              >
                {goal ? t('readingGoalCard.change') : t('readingGoalCard.setAGoal')}
              </button>
            )}
            {error ? <p className={`mt-2 ${textStyles.caption} text-[var(--app-danger)]`} role="alert">{error}</p> : null}
          </div>
        ) : null}
        {years.length ? (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {chip('all', t('yearReview.allTime'))}
            {years.map((y) => chip(y, String(y)))}
          </div>
        ) : null}
      </section>

      {review.total === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={allTime ? t('yearReview.emptyAllTime') : t('yearReview.emptyTitle', { year: review.year })}
          description={t('yearReview.emptyText')}
        />
      ) : (
        <>
          <div className="grid grid-cols-5 min-[480px]:grid-cols-6 gap-1.5" aria-label={t('yearReview.mosaic')}>
            {review.covers.map((book) => (
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

          {bars.length ? (
            <section className={`p-4 ${radii.lg} ${theme.card}`}>
              <div
                className="grid gap-1 items-end h-20 justify-center"
                style={{ gridTemplateColumns: allTime ? `repeat(${bars.length}, minmax(0, 3rem))` : 'repeat(12, minmax(0, 1fr))' }}
                aria-label={allTime ? t('yearReview.byYear') : t('readingGoalCard.readByMonth')}
              >
                {bars.map((b) => {
                  const bar = (
                    <>
                      <span className="flex-1 w-full max-w-4 flex items-end rounded bg-[var(--app-progress-track)]">
                        <span
                          className="block w-full rounded"
                          style={{ height: b.n ? `${Math.max(8, Math.round((b.n / maxBar) * 100))}%` : 0, background: 'var(--app-accent)', opacity: b.peak ? 1 : 0.55 }}
                        />
                      </span>
                      <span className={`text-[0.625rem] leading-none ${theme.textMuted}`}>{b.label}</span>
                    </>
                  );
                  return b.year ? (
                    <button key={b.key} type="button" onClick={() => setYear(b.year!)} className={`flex h-full flex-col items-center gap-1 ${theme.focusRing}`} aria-label={`${b.label}: ${tn('common.booksShort', b.n)}`}>
                      {bar}
                    </button>
                  ) : (
                    <div key={b.key} className="flex h-full flex-col items-center gap-1" title={`${b.label}: ${b.n}`}>{bar}</div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className={`p-4 ${radii.lg} ${theme.card} grid gap-4 min-[480px]:grid-cols-2`}>
            {!allTime && review.busiestMonth ? (
              <div>
                <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('yearReview.busiestMonth')}</p>
                <p className={`${textStyles.bodyBold} ${theme.text}`}>{monthName(review.busiestMonth, 'long')}</p>
                <p className={`${textStyles.caption} ${theme.textMuted}`}>{tn('common.booksShort', review.byMonth[review.busiestMonth - 1] || 0)}</p>
              </div>
            ) : null}
            {allTime && review.busiestYear ? (
              <div>
                <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('yearReview.busiestYear')}</p>
                <p className={`${textStyles.bodyBold} ${theme.text}`}>{review.busiestYear}</p>
                <p className={`${textStyles.caption} ${theme.textMuted}`}>{tn('common.booksShort', review.byYear.find((r) => r.year === review.busiestYear)?.count || 0)}</p>
              </div>
            ) : null}
            {bookLine(allTime ? t('yearReview.firstEver') : t('yearReview.firstBook'), review.first)}
            {review.last && review.last.id !== review.first?.id ? bookLine(t('yearReview.lastBook'), review.last) : null}
            {review.favorite ? (
              <div className="flex gap-3 min-w-0">
                <span className="relative block w-12 shrink-0 aspect-[2/3] overflow-hidden rounded">
                  <BookCover
                    bookId={review.favorite.id}
                    serverConfig={serverConfig}
                    storageDirectory={storageDirectory}
                    variant="thumb"
                    title={review.favorite.title}
                    placeholder={review.favorite.coverLqip}
                    className="absolute inset-0 w-full h-full !rounded-none !border-0"
                  />
                </span>
                {bookLine(t('yearReview.favorite'), review.favorite)}
              </div>
            ) : null}
            {review.averageRating ? (
              <div>
                <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('yearReview.averageRating')}</p>
                <p className={`${textStyles.bodyBold} ${theme.text}`}>{review.averageRating} ★</p>
                <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('yearReview.ratedCount', { n: review.ratedCount })}</p>
              </div>
            ) : null}
          </section>

          {topList(allTime ? t('yearReview.topAuthorsAll') : t('yearReview.topAuthors'), review.topAuthors, (a) => displayAuthorName(a.displayName || a.name))}
          {topList(allTime ? t('yearReview.topGenresAll') : t('yearReview.topGenres'), review.topGenres, genreLabel)}
          {topList(allTime ? t('yearReview.topSeriesAll') : t('yearReview.topSeries'), review.topSeries, (s) => s.displayName || s.name)}
        </>
      )}
    </div>
  );
}
