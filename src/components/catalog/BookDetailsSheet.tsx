import React from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Bookmark, CheckCircle2, ChevronLeft, Download, FolderPlus, Heart, MoreHorizontal, Star } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles, semantic, radii, motion as motionTokens } from '../../ui/tokens';
import Button from '../../ui/Button';
import { BookCardSkeleton, TextBlockSkeleton } from '../../ui/Skeleton';
import ReadProgressBar from '../ReadProgressBar';
import { useOverlayBackHandler } from '../../hooks/useBackHandler';
import { Book, ServerConfig } from '../../types';
import { authorFacetNames, fetchBookDetails, fetchBookMeta, fetchBookRating, fetchBookReviewHtml, fetchFacetBooks, isAuthError, mapServerBook, setBookRatingApi } from '../../lib/inpxClient';
import { parseBookReviews, reviewAvatarHue, reviewInitials } from '../../lib/bookReviews';
import { looksLikeHtml, sanitizeHtml } from '../../lib/sanitizeHtml';
import { bookTitleWithoutVolume, displayBookTitle, seriesLabel, seriesVolumeLabel } from '../../lib/seriesLabel';
import { booksAfterInSeries, seriesPageForVolume, seriesVolumeSortKey } from '../../lib/seriesVolumeSort';
import { isBookDownloadInFlight, isBookFinished, resolveBookPrimaryAction } from '../../lib/bookOpenPolicy';
import ReadMark from '../ReadMark';
import type { StorageDirectory } from '../../lib/storageDirectory';
import BookCover from '../BookCover';
import BookShelfGrid from '../BookShelfGrid';
import ShelfPicker from '../ShelfPicker';
import type { UiShelf } from '../../lib/inpxClient';

function formatBookSize(bytes?: number): string | null {
  const n = Number(bytes) || 0;
  if (n <= 0) return null;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} МБ`;
}

const LANG_LABELS: Record<string, string> = {
  ru: 'Русский',
  en: 'Английский',
  uk: 'Украинский',
  be: 'Белорусский',
  de: 'Немецкий',
  fr: 'Французский',
  es: 'Испанский',
  pl: 'Польский',
  bg: 'Болгарский',
  cs: 'Чешский',
  it: 'Итальянский',
};

/** Display label paired with the catalog genre code. Lists from the index stay aligned. */
function genreLinks(book: Book): Array<{ code: string; label: string }> {
  const labels = (book.genresDisplay ?? []).map((label) => label.trim()).filter(Boolean);
  const codes = (book.genreCodes ?? []).map((code) => code.trim()).filter(Boolean);
  if (codes.length) {
    return codes.map((code, index) => ({ code, label: labels[index] || code }));
  }
  const fallback = labels.length
    ? labels
    : (book.genre && book.genre !== 'Другое' ? [book.genre] : []);
  return fallback.map((label) => ({ code: label, label }));
}

function formatLang(code?: string): string | null {
  const raw = code?.trim().toLowerCase();
  if (!raw || raw === 'unknown') return null;
  return LANG_LABELS[raw] || raw.toUpperCase();
}

function mergeBookFacts(base: Book, extra: Book): Book {
  if (extra.id !== base.id) return base;
  return {
    ...base,
    year: base.year || extra.year,
    size: base.size || extra.size,
    rating: base.rating || extra.rating,
    lang: base.lang || extra.lang,
    authors: base.authors?.length ? base.authors : extra.authors,
    genresDisplay: extra.genresDisplay?.length ? extra.genresDisplay : base.genresDisplay,
    genreCodes: extra.genreCodes?.length ? extra.genreCodes : base.genreCodes,
    series: base.series || extra.series,
    seriesDisplay: base.seriesDisplay || extra.seriesDisplay,
    seriesNo: base.seriesNo ?? extra.seriesNo,
    seriesNoLabel: base.seriesNoLabel || extra.seriesNoLabel,
  };
}

function RatingStars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`Рейтинг ${value} из 5`}>
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: 5 }, (_, index) => (
          <Star
            key={index}
            className={`w-4 h-4 ${index < value ? 'fill-[var(--app-star)] text-[var(--app-star)]' : 'text-[var(--app-placeholder)]'}`}
            strokeWidth={index < value ? 0 : 1.5}
          />
        ))}
      </span>
      <span className={`${textStyles.bodyBold} tabular-nums ${theme.text}`} aria-hidden>{value}</span>
    </div>
  );
}

/** «Ваша оценка»: tap a star to rate, tap the current one again to clear (server «Мои оценки»). */
function MyRatingPicker({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div className="flex gap-0.5" role="group" aria-label="Ваша оценка">
      {Array.from({ length: 5 }, (_, index) => {
        const n = index + 1;
        const on = n <= value;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} из 5`}
            aria-pressed={on}
            onClick={() => onChange(n === value ? 0 : n)}
            className={`-m-1 p-1 ${radii.sm} ${theme.focusRing} ${motionTokens.press}`}
          >
            <Star
              className={`w-5 h-5 ${on ? 'fill-[var(--app-star)] text-[var(--app-star)]' : 'text-[var(--app-placeholder)]'}`}
              strokeWidth={on ? 0 : 1.5}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

async function loadSeriesFollow(
  config: ServerConfig,
  book: Book,
): Promise<{ later: boolean; books: Book[] } | null> {
  const series = book.series?.trim();
  if (!series) return null;
  const first = await fetchFacetBooks(config, 'series', series, 1, { sort: 'series' });
  const pageSize = first.pageSize || 24;
  const total = first.total ?? first.items.length;
  const currentNo = seriesVolumeSortKey(book);
  let items = first.items;
  const page = seriesPageForVolume(Number.isFinite(currentNo) ? currentNo : book.seriesNo, pageSize, total);
  if (page > 1) {
    const focused = await fetchFacetBooks(config, 'series', series, page, { sort: 'series' });
    items = focused.items;
    const maxNo = items.reduce((max, item) => {
      const n = seriesVolumeSortKey({ title: item.title, seriesNoLabel: String(item.seriesNo ?? '') });
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    if (Number.isFinite(currentNo) && currentNo >= maxNo && page * pageSize < total) {
      const next = await fetchFacetBooks(config, 'series', series, page + 1, { sort: 'series' });
      items = items.concat(next.items);
    }
  }
  const shelf = booksAfterInSeries(
    book,
    items.map((item) => mapServerBook(item, config, { preferredSeries: series }) as Book),
  );
  return shelf.books.length ? shelf : null;
}

/** Tappable author or series name. 48dp target, no underline. */
function BookSheetMetaLink({
  ariaLabel,
  muted,
  onClick,
  children,
}: {
  ariaLabel: string;
  muted?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`inline-flex items-center min-h-9 max-w-full text-left cursor-pointer ${radii.sm} ${theme.focusRing} ${motionTokens.press} ${
        `underline decoration-2 decoration-[color:var(--app-border)] underline-offset-[3px] ${muted ? `${textStyles.caption} font-normal ${theme.textMuted}` : `${textStyles.bodyBold} ${theme.text}`}`
      }`}
    >
      <span className="min-w-0">{children}</span>
    </button>
  );
}

function QuickAction({
  label,
  pressed,
  expanded,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex-1 min-w-0 min-h-16 py-3 px-1 flex flex-col items-center justify-center gap-1 ${textStyles.caption} ${
        pressed ? `font-bold ${theme.accentText}` : `font-medium ${theme.text}`
      } ${theme.rowPress} ${theme.focusRing} ${motionTokens.press}`}
    >
      {children}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function SeriesVolumeCard({
  book,
  serverConfig,
  storageDirectory,
  isServerConnected,
  onClick,
}: {
  book: Book;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  isServerConnected: boolean;
  onClick: () => void;
}) {
  const volume = seriesVolumeLabel(book);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 py-2.5 text-left cursor-pointer ${theme.rowPress} ${theme.focusRing} ${motionTokens.press}`}
    >
      <div className="book-cover w-12 shrink-0">
        <span className="book-cover-inner">
          <BookCover
            bookId={book.id}
            serverConfig={isServerConnected ? serverConfig : null}
            storageDirectory={storageDirectory}
            title={bookTitleWithoutVolume(book)}
            author={book.author}
            width={56}
            height={84}
            className="absolute inset-0 w-full h-full !rounded-none !border-0"
          />
        </span>
      </div>
      <span className="min-w-0 flex-1">
        {volume ? (
          <span className={`block ${textStyles.captionBold} ${theme.accentText}`}>Том {volume}</span>
        ) : null}
        <span className={`mt-0.5 block ${textStyles.bookTitle} line-clamp-2 ${theme.text}`}>
          {volume ? bookTitleWithoutVolume(book) : displayBookTitle(book)}
        </span>
        {book.author?.trim() ? (
          <span className={`mt-1 block ${textStyles.caption} ${theme.textMuted} line-clamp-1`}>{book.author}</span>
        ) : null}
      </span>
    </button>
  );
}

export interface BookDetailsSheetProps {
  book: Book | null;
  onClose: () => void;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  isServerConnected: boolean;
  downloadedBookIds: string[];
  downloadingId: string | null;
  queuedBookIds?: Set<string>;
  downloadError: string | null;
  onDownload: (book: Book) => void;
  onOpenBook: (book: Book) => void;
  /** Switch details sheet to another catalog book (e.g. «Ещё этого автора»). */
  onSelectBook?: (book: Book) => void;
  readIds?: Set<string>;
  readingProgressByBookId?: Record<string, number>;
  isAppDark: boolean;
  onOpenAuthor: (name: string) => void;
  onOpenSeries: (name: string) => void;
  /** Genre code (`sf_action`), the same value as a catalog genre page. */
  onOpenGenre?: (code: string) => void;
  onAuthExpired?: () => void;
  shelves?: UiShelf[];
  onAddToShelf?: (bookId: string, shelfId: number | string) => void | boolean | Promise<void | boolean>;
  onCreateShelf?: (name: string) => Promise<number | string | null>;
  isBookmarked?: boolean;
  onToggleBookmark?: (bookId: string) => void;
  onOpenActions?: (book: Book) => void;
  /** «Прочитано» quick action (works offline too: it queues a sync op). */
  onToggleRead?: (bookId: string) => void;
  /** «Хочу прочитать» (server list; hidden for read books, like the web book page). */
  isWant?: boolean;
  onToggleWant?: (bookId: string) => void;
}

export default function BookDetailsSheet({
  book: liveBook,
  onClose,
  serverConfig,
  storageDirectory,
  isServerConnected,
  downloadedBookIds,
  downloadingId,
  queuedBookIds,
  downloadError,
  onDownload,
  onOpenBook,
  onSelectBook,
  readIds,
  readingProgressByBookId,
  isAppDark,
  onOpenAuthor,
  onOpenSeries,
  onOpenGenre,
  onAuthExpired,
  shelves = [],
  onAddToShelf,
  onCreateShelf,
  isBookmarked = false,
  onToggleBookmark,
  onOpenActions,
  onToggleRead,
  isWant = false,
  onToggleWant,
}: BookDetailsSheetProps) {
  const bookRef = React.useRef(liveBook);
  if (liveBook) bookRef.current = liveBook;
  const book = liveBook ?? bookRef.current;
  const historyRef = React.useRef<Book[]>([]);
  const skipHistoryReset = React.useRef(false);

  const goBack = React.useCallback(() => {
    const previous = historyRef.current.pop();
    if (previous) {
      skipHistoryReset.current = true;
      onSelectBook?.(previous);
      return;
    }
    onClose();
  }, [onClose, onSelectBook]);

  const openBookPage = React.useCallback((next: Book) => {
    if (!liveBook || next.id === liveBook.id) return;
    historyRef.current.push(liveBook);
    skipHistoryReset.current = true;
    onSelectBook?.(next);
  }, [liveBook, onSelectBook]);

  React.useEffect(() => {
    if (skipHistoryReset.current) {
      skipHistoryReset.current = false;
      return;
    }
    historyRef.current = [];
  }, [liveBook?.id]);

  useOverlayBackHandler(Boolean(liveBook), goBack);
  const [annotation, setAnnotation] = React.useState<string | null>(null);
  const [annotationIsHtml, setAnnotationIsHtml] = React.useState(false);
  const [annotationLoading, setAnnotationLoading] = React.useState(false);
  const [bookReviewHtml, setBookReviewHtml] = React.useState('');
  const [bookReviewLoading, setBookReviewLoading] = React.useState(false);
  /** Personal rating; null = unknown / server without the rating API (row hidden). */
  const [myRating, setMyRating] = React.useState<number | null>(null);
  const bookReviews = React.useMemo(() => parseBookReviews(bookReviewHtml), [bookReviewHtml]);
  const [moreByAuthor, setMoreByAuthor] = React.useState<Book[]>([]);
  const [authorLoading, setAuthorLoading] = React.useState(false);
  const [seriesFollow, setSeriesFollow] = React.useState<{ later: boolean; books: Book[] } | null>(null);
  const [seriesLoading, setSeriesLoading] = React.useState(false);
  const [enriched, setEnriched] = React.useState<Book | null>(null);
  const [shelfPickerOpen, setShelfPickerOpen] = React.useState(false);
  const [shelfBusy, setShelfBusy] = React.useState(false);
  const [descOpen, setDescOpen] = React.useState(false);
  const [tab, setTab] = React.useState<'about' | 'series'>('about');

  React.useEffect(() => {
    if (!liveBook) {
      setShelfPickerOpen(false);
      return;
    }
    setAnnotation(null);
    setAnnotationIsHtml(false);
    setBookReviewHtml('');
    setMoreByAuthor([]);
    setSeriesFollow(null);
    setEnriched(null);
    setShelfPickerOpen(false);
    setDescOpen(false);
    setTab('about');
    setAnnotationLoading(isServerConnected);
    if (!isServerConnected) {
      setAuthorLoading(false);
      setSeriesLoading(false);
      return;
    }
    setAuthorLoading(authorFacetNames(liveBook).length > 0);
    setSeriesLoading(Boolean(liveBook.series?.trim()));
    let cancelled = false;
    fetchBookDetails(serverConfig, liveBook.id)
      .then((details) => {
        if (cancelled || !details.annotation) return;
        setAnnotation(details.annotation);
        setAnnotationIsHtml(Boolean(details.annotationIsHtml) || looksLikeHtml(details.annotation));
      })
      .catch((e) => {
        if (cancelled) return;
        if (isAuthError(e)) onAuthExpired?.();
      })
      .finally(() => { if (!cancelled) setAnnotationLoading(false); });
    if (liveBook.series?.trim()) {
      void loadSeriesFollow(serverConfig, liveBook)
        .then((shelf) => { if (!cancelled) setSeriesFollow(shelf); })
        .catch((e) => {
          if (cancelled) return;
          setSeriesFollow(null);
          if (isAuthError(e)) onAuthExpired?.();
        })
        .finally(() => { if (!cancelled) setSeriesLoading(false); });
    }
    void (async () => {
      let names = authorFacetNames(liveBook);
      try {
        const meta = await fetchBookMeta(serverConfig, liveBook.id);
        if (cancelled) return;
        if (meta) {
          const mapped = mapServerBook(meta, serverConfig, { preferredSeries: liveBook.series }) as Book;
          setEnriched(mapped);
          const fromMeta = authorFacetNames(mapped);
          if (fromMeta.length) names = fromMeta;
        }
      } catch (e) {
        if (!cancelled && isAuthError(e)) onAuthExpired?.();
      }
      const name = names[0];
      if (!name) {
        if (!cancelled) setAuthorLoading(false);
        return;
      }
      try {
        const data = await fetchFacetBooks(serverConfig, 'authors', name, 1, { sort: 'rating' });
        if (cancelled) return;
        setMoreByAuthor(
          data.items
            .map((item) => mapServerBook(item, serverConfig) as Book)
            .filter((item) => item.id !== liveBook.id)
            .slice(0, 8),
        );
      } catch (e) {
        if (cancelled) return;
        setMoreByAuthor([]);
        if (isAuthError(e)) onAuthExpired?.();
      } finally {
        if (!cancelled) setAuthorLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [liveBook?.id, liveBook?.author, liveBook?.series, isServerConnected, serverConfig]);

  React.useEffect(() => {
    setMyRating(null);
    if (!liveBook || !isServerConnected) return;
    let cancelled = false;
    fetchBookRating(serverConfig, liveBook.id)
      .then((value) => { if (!cancelled) setMyRating(value); })
      .catch(() => { if (!cancelled) setMyRating(null); });
    return () => { cancelled = true; };
  }, [liveBook?.id, isServerConnected, serverConfig]);

  const changeMyRating = React.useCallback((next: number) => {
    if (!liveBook) return;
    const previous = myRating;
    setMyRating(next);
    setBookRatingApi(serverConfig, liveBook.id, next).catch((e) => {
      setMyRating(previous);
      if (isAuthError(e)) onAuthExpired?.();
    });
  }, [liveBook, myRating, serverConfig, onAuthExpired]);

  React.useEffect(() => {
    if (!liveBook || !isServerConnected) return;
    setBookReviewHtml('');
    let cancelled = false;
    setBookReviewLoading(true);
    fetchBookReviewHtml(serverConfig, liveBook.id)
      .then((html) => { if (!cancelled) setBookReviewHtml(html); })
      .catch(() => { if (!cancelled) setBookReviewHtml(''); })
      .finally(() => { if (!cancelled) setBookReviewLoading(false); });
    return () => { cancelled = true; };
  }, [liveBook?.id, isServerConnected, serverConfig]);

  if (!liveBook || !book || typeof document === 'undefined') return null;

  const detail = enriched?.id === book.id ? mergeBookFacts(book, enriched) : book;
  const coverRating = Math.max(0, Math.min(5, Math.round(Number(detail.rating) || 0)));
  const authorNames = authorFacetNames(detail);

  const description = annotation ?? detail.description ?? '';
  const descriptionIsHtml =
    (annotation != null ? annotationIsHtml : looksLikeHtml(detail.description || ''))
    && Boolean(description?.trim());

  const themeAccentText = theme.accentText;
  const themeTextMuted = theme.textMuted;

  const primaryAction = book
    ? resolveBookPrimaryAction({
        hasFile: downloadedBookIds.includes(book.id),
        isDownloading: isBookDownloadInFlight(book.id, downloadingId, queuedBookIds),
        progress: readingProgressByBookId?.[book.id] ?? book.readProgress ?? 0,
        isRead: readIds?.has(book.id),
      })
    : null;
  const progress = book
    ? Math.max(0, Math.min(100, Math.round(Number(readingProgressByBookId?.[book.id] ?? book.readProgress) || 0)))
    : 0;
  const finished = book ? isBookFinished(progress, readIds?.has(book.id)) : false;
  const markedRead = Boolean(book && readIds?.has(book.id));
  // «Ещё» now only holds «Удалить с устройства» — no menu for a book that is not on the device.
  const hasMoreActions = Boolean(onOpenActions && book && downloadedBookIds.includes(book.id));
  const sizeLabel = formatBookSize(detail.size);
  const descLong = (description || '').replace(/<[^>]+>/g, '').length > 220;
  const fileLabel = [detail.ext ? detail.ext.toUpperCase() : null, sizeLabel].filter(Boolean).join(' · ');
  const langLabel = formatLang(detail.lang);
  // Format and size are technical: they sit at the end of «О книге», not next to the year.
  const facts = ([
    ['Год', detail.year ? String(detail.year) : ''],
    ['Язык', langLabel ?? ''],
  ] as const).filter(([, value]) => Boolean(value));
  const genres = genreLinks(detail);
  const showShelf = Boolean(onAddToShelf || onCreateShelf);
  const volume = seriesVolumeLabel(detail);
  const showSeriesBlock = Boolean(detail.series) && (seriesLoading || Boolean(seriesFollow?.books.length));
  const showAuthorBlock = authorNames.length > 0 && (authorLoading || moreByAuthor.length > 0);
  const sectionKicker = `${textStyles.sectionLabel} ${theme.text}`;

  return createPortal(
    <div
      className={`fixed inset-0 z-[450] flex flex-col overflow-hidden bg-[var(--app-bg)] ${theme.text}`}
      style={{
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-clip">
            <header className="inpx-book-chrome sticky top-0 z-10 min-h-16 px-1 flex items-center">
              <button
                type="button"
                aria-label="Назад"
                onClick={goBack}
                className={`w-12 h-12 shrink-0 inline-flex items-center justify-center ${radii.md} ${theme.focusRing} ${motionTokens.press}`}
              >
                <ChevronLeft className="w-6 h-6" aria-hidden />
              </button>
            </header>

            <div className="mx-auto w-full max-w-[45rem] px-5 min-[600px]:px-8 pb-8 flex min-w-0 flex-col">
              <div className="flex w-full min-w-0 items-start gap-5">
                <div className="book-cover w-32 min-[600px]:w-[11.25rem] shrink-0">
                  <span className="book-cover-inner">
                    <BookCover
                      bookId={book.id}
                      serverConfig={isServerConnected ? serverConfig : null}
                      storageDirectory={storageDirectory}
                      variant="full"
                      title={bookTitleWithoutVolume(detail)}
                      author={book.author}
                      width={120}
                      height={180}
                      className="absolute inset-0 w-full h-full !rounded-none !border-0"
                    />
                    {finished ? <ReadMark /> : null}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 id="catalog-book-sheet-title" className={`${textStyles.bookTitleHero} min-[600px]:text-[1.875rem] min-[600px]:leading-[2.3125rem] mb-1 ${theme.text}`}>
                    {bookTitleWithoutVolume(detail)}
                  </h3>
                  {authorNames.length ? (
                    <div className="mt-1 flex flex-wrap items-center gap-x-1">
                      {authorNames.map((name, index) => (
                        <React.Fragment key={name}>
                          {index > 0 ? <span className={`${textStyles.body} ${theme.textMuted}`}>,</span> : null}
                          <BookSheetMetaLink
                            ariaLabel={`Автор: ${name}`}
                            onClick={() => onOpenAuthor(name)}
                          >
                            {name}
                          </BookSheetMetaLink>
                        </React.Fragment>
                      ))}
                    </div>
                  ) : null}
                  {detail.series ? (
                    <BookSheetMetaLink
                      ariaLabel={`Серия: ${seriesLabel(detail)}`}
                      muted
                      onClick={() => onOpenSeries(detail.series!)}
                    >
                      {seriesLabel(detail)}{volume ? ` · том ${volume}` : ''}
                    </BookSheetMetaLink>
                  ) : null}
                  {coverRating > 0 || facts.length || myRating != null ? (
                    <dl className={`mt-3 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 ${textStyles.caption}`}>
                      {coverRating > 0 ? (
                        <>
                          <dt className={themeTextMuted}>Рейтинг</dt>
                          <dd><RatingStars value={coverRating} /></dd>
                        </>
                      ) : null}
                      {myRating != null ? (
                        <>
                          <dt className={themeTextMuted}>Ваша оценка</dt>
                          <dd><MyRatingPicker value={myRating} onChange={changeMyRating} /></dd>
                        </>
                      ) : null}
                      {facts.map(([label, value]) => (
                        <React.Fragment key={label}>
                          <dt className={themeTextMuted}>{label}</dt>
                          <dd className={`font-medium ${theme.text}`}>{value}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  ) : null}
                </div>
              </div>
              {progress > 0 && !finished ? <ReadProgressBar value={progress} showLabel className="w-full mt-4" /> : null}

              <div className="mt-5 space-y-2">
                {downloadError && (
                  <p className={`${textStyles.caption} ${semantic.error}`} role="alert">{downloadError}</p>
                )}
                {primaryAction?.kind === 'download' && !isServerConnected ? (
                  <p className={`${textStyles.caption} ${themeTextMuted}`}>Нужен интернет для скачивания</p>
                ) : null}
                <div className="flex items-stretch">
                  {primaryAction ? (
                    <Button
                      className="flex-1 min-w-0 min-h-12 min-[600px]:flex-none min-[600px]:min-w-[13.75rem]"
                      loading={primaryAction.kind === 'downloading'}
                      disabled={
                        primaryAction.disabled ||
                        (primaryAction.kind === 'download' && !isServerConnected)
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (primaryAction.kind === 'downloading') return;
                        if (primaryAction.kind === 'download') {
                          if (!isServerConnected) return;
                          onDownload(book);
                          return;
                        }
                        onOpenBook(book);
                        onClose();
                      }}
                    >
                      {primaryAction.kind === 'download' ? <Download className="w-4 h-4 shrink-0" aria-hidden /> : null}
                      {primaryAction.kind === 'read' || primaryAction.kind === 'continue' || primaryAction.kind === 'reread'
                        ? <BookOpen className="w-4 h-4 shrink-0" aria-hidden />
                        : null}
                      {primaryAction.label}
                    </Button>
                  ) : null}
                </div>
                {onToggleBookmark || showShelf || onToggleRead || onToggleWant || hasMoreActions ? (
                  <div className={`!mt-3.5 flex border-y ${theme.divider}`}>
                    {onToggleBookmark ? (
                      <QuickAction
                        label={isBookmarked ? 'В избранном' : 'В избранное'}
                        pressed={isBookmarked}
                        onClick={() => onToggleBookmark(book.id)}
                      >
                        <Heart className={`w-5 h-5 ${isBookmarked ? 'fill-current' : ''}`} aria-hidden />
                      </QuickAction>
                    ) : null}
                    {onToggleWant && !markedRead ? (
                      <QuickAction
                        label={isWant ? 'Отложено' : 'Хочу прочитать'}
                        pressed={isWant}
                        onClick={() => onToggleWant(book.id)}
                      >
                        <Bookmark className={`w-5 h-5 ${isWant ? 'fill-current' : ''}`} aria-hidden />
                      </QuickAction>
                    ) : null}
                    {showShelf ? (
                      <QuickAction
                        label="На полку"
                        expanded={shelfPickerOpen}
                        onClick={() => setShelfPickerOpen((open) => !open)}
                      >
                        <FolderPlus className="w-5 h-5" aria-hidden />
                      </QuickAction>
                    ) : null}
                    {onToggleRead ? (
                      <QuickAction
                        label={markedRead ? 'Прочитано' : 'В прочитанные'}
                        pressed={markedRead}
                        onClick={() => onToggleRead(book.id)}
                      >
                        <CheckCircle2 className="w-5 h-5" aria-hidden />
                      </QuickAction>
                    ) : null}
                    {hasMoreActions && onOpenActions ? (
                      <QuickAction label="Ещё" onClick={() => onOpenActions(book)}>
                        <MoreHorizontal className="w-5 h-5" aria-hidden />
                      </QuickAction>
                    ) : null}
                  </div>
                ) : null}
                {shelfPickerOpen ? (
                  <ShelfPicker
                    shelves={shelves}
                    busy={shelfBusy}
                    onPick={(id) => {
                      if (!onAddToShelf) return;
                      setShelfBusy(true);
                      void Promise.resolve(onAddToShelf(book.id, id)).then((added) => {
                        if (added !== false) setShelfPickerOpen(false);
                      }).finally(() => {
                        setShelfBusy(false);
                      });
                    }}
                    onCreate={
                      onCreateShelf
                        ? async (name) => {
                            setShelfBusy(true);
                            try {
                              const id = await onCreateShelf(name);
                              if (id == null) return false;
                              if (onAddToShelf) {
                                const added = await onAddToShelf(book.id, id);
                                if (added !== false) setShelfPickerOpen(false);
                              } else {
                                setShelfPickerOpen(false);
                              }
                              return true;
                            } finally {
                              setShelfBusy(false);
                            }
                          }
                        : undefined
                    }
                  />
                ) : null}
              </div>

              {showSeriesBlock ? (
                <div role="tablist" aria-label="Разделы книги" className="mt-7 flex gap-6 border-b border-[color:var(--app-border)]">
                  {([
                    { id: 'about' as const, label: 'О книге' },
                    { id: 'series' as const, label: 'Серия' },
                  ]).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === item.id}
                      onClick={() => setTab(item.id)}
                      className={`relative min-h-12 ${textStyles.bodyBold} ${tab === item.id ? theme.text : theme.textMuted} ${theme.focusRing}`}
                    >
                      {item.label}
                      {tab === item.id ? (
                        <span className="absolute inset-x-0 -bottom-px h-[3px] bg-[var(--app-text)]" aria-hidden />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}

              {tab === 'series' && showSeriesBlock ? (
                <section className="pt-2" role="tabpanel">
                  <p className={`py-2 ${textStyles.caption} ${themeTextMuted}`}>
                    {seriesFollow?.later ? 'Далее в серии' : 'Тома серии'}
                  </p>
                  {seriesLoading && !seriesFollow?.books.length ? (
                    <div className="flex flex-col gap-2" aria-hidden>
                      <BookCardSkeleton />
                      <BookCardSkeleton />
                      <BookCardSkeleton />
                    </div>
                  ) : (
                    <div className="flex flex-col" role="list">
                      {seriesFollow?.books.slice(0, 10).map((item) => (
                        <div key={item.id} role="listitem">
                          <SeriesVolumeCard
                            book={item}
                            serverConfig={serverConfig}
                            storageDirectory={storageDirectory}
                            isServerConnected={isServerConnected}
                            onClick={() => openBookPage(item)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="secondary" fullWidth className="mt-4" onClick={() => onOpenSeries(detail.series!)}>
                    Вся серия
                  </Button>
                </section>
              ) : (
                <div className="pt-5 flex flex-col" role={showSeriesBlock ? 'tabpanel' : undefined}>
                  <section className="space-y-3">
                    {showSeriesBlock ? null : <h4 className={sectionKicker}>О книге</h4>}
                    {descriptionIsHtml && description ? (
                      <div
                        className={`font-serif text-[1.0625rem] leading-[1.6875rem] ${theme.text} select-text prose prose-sm ${isAppDark ? 'prose-invert' : ''} ${descOpen || !descLong ? '' : 'line-clamp-4 overflow-hidden'}`}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
                      />
                    ) : !description && annotationLoading ? (
                      <TextBlockSkeleton lines={4} />
                    ) : (
                      <p className={`font-serif text-[1.0625rem] leading-[1.6875rem] ${theme.text} select-text ${descOpen || !descLong ? '' : 'line-clamp-4'}`}>
                        {description || 'Аннотация отсутствует.'}
                      </p>
                    )}
                    {descLong && description ? (
                      <button
                        type="button"
                        onClick={() => setDescOpen((v) => !v)}
                        className={`${textStyles.bodyBold} min-h-10 ${theme.accentText} ${theme.focusRing} ${motionTokens.press}`}
                      >
                        {descOpen ? 'Свернуть' : 'Читать полностью'}
                      </button>
                    ) : null}
                    {genres.length ? (
                      <ul className="flex flex-wrap gap-2 pt-1" aria-label="Жанры">
                        {genres.map((genre) => (
                          <li key={genre.code}>
                            <button
                              type="button"
                              onClick={() => onOpenGenre?.(genre.code)}
                              className={`inline-flex items-center min-h-10 px-3 ${radii.sm} ${textStyles.caption} font-medium ${theme.chip} ${theme.chipHover} ${theme.focusRing} ${motionTokens.press}`}
                            >
                              {genre.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {fileLabel ? (
                      <p className={`pt-1 ${textStyles.caption} ${themeTextMuted}`}>Файл: {fileLabel}</p>
                    ) : null}
                  </section>

                  {showAuthorBlock ? (
                    <>
                      <div className="my-6 border-t border-[color:var(--app-border)]" aria-hidden />
                      <section className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className={sectionKicker}>Другие книги автора</h4>
                          <button
                            type="button"
                            onClick={() => onOpenAuthor(authorNames[0] || detail.author)}
                            className={`${textStyles.bodyBold} min-h-10 px-1 ${themeAccentText} ${theme.focusRing} ${motionTokens.press}`}
                          >
                            Все
                          </button>
                        </div>
                        <BookShelfGrid
                          books={moreByAuthor}
                          serverConfig={serverConfig}
                          storageDirectory={storageDirectory}
                          downloadedBookIds={downloadedBookIds}
                          readIds={readIds}
                          loading={authorLoading}
                          maxRows={1}
                          onBookClick={openBookPage}
                        />
                      </section>
                    </>
                  ) : null}

                  {(bookReviewLoading || bookReviewHtml) && (
                    <>
                      <div className="my-6 border-t border-[color:var(--app-border)]" aria-hidden />
                      <section className="space-y-3">
                        <h4 className={`flex items-baseline gap-2 ${sectionKicker}`}>
                          Отзывы
                          {bookReviews.length > 0 ? (
                            <span className={`font-medium tabular-nums ${theme.textMuted}`}>{bookReviews.length}</span>
                          ) : null}
                        </h4>
                        {bookReviewLoading ? (
                          <TextBlockSkeleton lines={4} />
                        ) : bookReviews.length > 0 ? (
                          <div className="flex flex-col gap-3">
                            {bookReviews.map((review, index) => {
                              const initials = reviewInitials(review.name);
                              const hue = reviewAvatarHue(review.name || String(index));
                              return (
                                <article
                                  key={`${review.name}-${index}`}
                                  className={`${radii.md} ${theme.cardSecondary} px-4 py-4 ${theme.text}`}
                                >
                                  {review.name ? (
                                    <div className="flex items-center gap-3">
                                      <div
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                                        style={{ backgroundColor: `hsl(${hue} 42% 42%)` }}
                                        aria-hidden
                                      >
                                        {initials}
                                      </div>
                                      <div className="min-w-0">
                                        <div className={`${textStyles.bodyBold} truncate`}>{review.name}</div>
                                        {review.timeLabel ? (
                                          <div className={`${textStyles.caption} ${theme.textMuted}`}>{review.timeLabel}</div>
                                        ) : null}
                                      </div>
                                    </div>
                                  ) : null}
                                  {review.html ? (
                                    <div
                                      className={`${textStyles.body} leading-relaxed select-text prose prose-sm max-w-none [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 ${review.name ? 'mt-3' : ''} ${isAppDark ? 'prose-invert' : ''}`}
                                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(review.html) }}
                                    />
                                  ) : null}
                                </article>
                              );
                            })}
                          </div>
                        ) : (
                          <div
                            className={`${textStyles.body} leading-relaxed select-text prose prose-sm ${isAppDark ? 'prose-invert' : ''}`}
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(bookReviewHtml) }}
                          />
                        )}
                      </section>
                    </>
                  )}
                </div>
              )}
            </div>
            </div>
    </div>,
    document.body,
  );
}
