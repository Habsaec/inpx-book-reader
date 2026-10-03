import React from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronLeft, Download, FolderPlus, Heart, MoreVertical, Star } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles, semantic, radii, motion as motionTokens } from '../../ui/tokens';
import Button from '../../ui/Button';
import IconButton from '../../ui/IconButton';
import { BookCardSkeleton, BookShelfSkeleton, TextBlockSkeleton } from '../../ui/Skeleton';
import ReadProgressBar from '../ReadProgressBar';
import { useOverlayBackHandler } from '../../hooks/useBackHandler';
import { Book, ServerConfig } from '../../types';
import { authorFacetNames, fetchBookDetails, fetchBookMeta, fetchBookReviewHtml, fetchFacetBooks, isAuthError, mapServerBook } from '../../lib/inpxClient';
import { parseBookReviews, reviewAvatarHue, reviewInitials } from '../../lib/bookReviews';
import { looksLikeHtml, sanitizeHtml } from '../../lib/sanitizeHtml';
import { bookTitleWithoutVolume, displayBookTitle, seriesLabel, seriesVolumeLabel } from '../../lib/seriesLabel';
import { booksAfterInSeries, seriesPageForVolume, seriesVolumeSortKey } from '../../lib/seriesVolumeSort';
import { isBookDownloadInFlight, isBookFinished, resolveBookPrimaryAction } from '../../lib/bookOpenPolicy';
import ReadMark from '../ReadMark';
import type { StorageDirectory } from '../../lib/storageDirectory';
import BookCover from '../BookCover';
import HorizontalBookShelf from '../HorizontalBookShelf';
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
    genresDisplay: base.genresDisplay?.length ? base.genresDisplay : extra.genresDisplay,
    series: base.series || extra.series,
    seriesDisplay: base.seriesDisplay || extra.seriesDisplay,
    seriesNo: base.seriesNo ?? extra.seriesNo,
    seriesNoLabel: base.seriesNoLabel || extra.seriesNoLabel,
  };
}

function RatingStars({ value }: { value: number }) {
  return (
    <div className="mb-1 flex justify-center gap-0.5" aria-hidden>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          className={`w-4 h-4 ${index < value ? 'fill-[var(--app-accent)] text-[var(--app-accent)]' : 'text-[var(--app-muted)]'}`}
          strokeWidth={index < value ? 0 : 1.5}
        />
      ))}
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
      className={`inline-flex items-center justify-center min-h-12 max-w-full px-2 text-center cursor-pointer ${radii.sm} ${theme.focusRing} ${motionTokens.press} ${
        muted ? `${textStyles.caption} font-normal ${theme.textMuted}` : `text-base font-medium ${theme.accentText}`
      }`}
    >
      <span className="min-w-0">{children}</span>
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
      className={`flex w-full items-center gap-3 p-2.5 text-left cursor-pointer ${radii.md} ${theme.panel} ${theme.focusRing} ${motionTokens.press}`}
    >
      <div className="book-cover w-14 shrink-0">
        <span className="book-cover-inner">
          <BookCover
            bookId={book.id}
            serverConfig={isServerConnected ? serverConfig : null}
            storageDirectory={storageDirectory}
            title={book.title}
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
  onAuthExpired?: () => void;
  shelves?: UiShelf[];
  onAddToShelf?: (bookId: string, shelfId: number | string) => void | boolean | Promise<void | boolean>;
  onCreateShelf?: (name: string) => Promise<number | string | null>;
  isBookmarked?: boolean;
  onToggleBookmark?: (bookId: string) => void;
  onOpenActions?: (book: Book) => void;
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
  onAuthExpired,
  shelves = [],
  onAddToShelf,
  onCreateShelf,
  isBookmarked = false,
  onToggleBookmark,
  onOpenActions,
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
  const [bookReviewHtml, setBookReviewHtml] = React.useState('');
  const [bookReviewLoading, setBookReviewLoading] = React.useState(false);
  const bookReviews = React.useMemo(() => parseBookReviews(bookReviewHtml), [bookReviewHtml]);
  const [moreByAuthor, setMoreByAuthor] = React.useState<Book[]>([]);
  const [authorLoading, setAuthorLoading] = React.useState(false);
  const [seriesFollow, setSeriesFollow] = React.useState<{ later: boolean; books: Book[] } | null>(null);
  const [seriesLoading, setSeriesLoading] = React.useState(false);
  const [enriched, setEnriched] = React.useState<Book | null>(null);
  const [shelfPickerOpen, setShelfPickerOpen] = React.useState(false);
  const [shelfBusy, setShelfBusy] = React.useState(false);
  const [descOpen, setDescOpen] = React.useState(false);

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
      });
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
  const sizeLabel = formatBookSize(detail.size);
  const descLong = (description || '').replace(/<[^>]+>/g, '').length > 220;
  const facts: { key: string; value: string; label: string; stars?: boolean }[] = [];
  if (coverRating > 0) facts.push({ key: 'rating', value: String(coverRating), label: 'из 5', stars: true });
  if (detail.year) facts.push({ key: 'year', value: String(detail.year), label: 'год' });
  if (sizeLabel) facts.push({ key: 'size', value: sizeLabel, label: 'размер' });
  const genreLine = detail.genresDisplay?.length
    ? detail.genresDisplay.join(', ')
    : (detail.genre && detail.genre !== 'Другое' ? detail.genre : '');
  const metaBits = [
    genreLine || null,
    formatLang(detail.lang),
    detail.ext ? detail.ext.toUpperCase() : null,
  ].filter((part): part is string => Boolean(part));
  const showShelf = Boolean(onAddToShelf || onCreateShelf);
  const volume = seriesVolumeLabel(detail);
  const showSeriesBlock = Boolean(detail.series) && (seriesLoading || Boolean(seriesFollow?.books.length));
  const showAuthorBlock = authorNames.length > 0 && (authorLoading || moreByAuthor.length > 0);
  const sectionKicker = `${textStyles.labelBold} tracking-wide ${theme.textMuted}`;

  return createPortal(
    <div
      className={`fixed inset-0 z-[450] flex flex-col overflow-hidden bg-[var(--app-bg)] ${theme.text}`}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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
              <div className="flex-1" />
              {onOpenActions ? (
                <IconButton
                  label="Ещё"
                  className="shrink-0"
                  onClick={() => onOpenActions(book)}
                >
                  <MoreVertical className="w-5 h-5" aria-hidden />
                </IconButton>
              ) : (
                <div className="w-12 shrink-0" aria-hidden />
              )}
            </header>

            <div className="px-5 pb-6 flex min-w-0 max-w-full flex-col gap-8">
              <div className="flex w-full min-w-0 flex-col items-center text-center gap-4">
                <div className="book-cover w-40">
                  <span className="book-cover-inner">
                    <BookCover
                      bookId={book.id}
                      serverConfig={isServerConnected ? serverConfig : null}
                      storageDirectory={storageDirectory}
                      variant="full"
                      title={book.title}
                      author={book.author}
                      width={160}
                      height={240}
                      className="absolute inset-0 w-full h-full !rounded-none !border-0"
                    />
                    {finished ? <ReadMark /> : null}
                  </span>
                </div>
                <div className="w-full min-w-0">
                  <h3 id="catalog-book-sheet-title" className={`${textStyles.title} font-serif ${theme.text} text-center max-w-full min-w-0 [overflow-wrap:anywhere]`}>
                    {bookTitleWithoutVolume(detail)}
                  </h3>
                  {authorNames.length ? (
                    <div className="flex flex-wrap items-center justify-center">
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
                    <div className="flex justify-center">
                      <BookSheetMetaLink
                        ariaLabel={`Серия: ${seriesLabel(detail)}`}
                        muted
                        onClick={() => onOpenSeries(detail.series!)}
                      >
                        {seriesLabel(detail)}{volume ? ` · том ${volume}` : ''}
                      </BookSheetMetaLink>
                    </div>
                  ) : null}
                </div>
                {facts.length > 0 ? (
                  <div className="flex w-full items-stretch">
                    {facts.map((fact, index) => (
                      <div
                        key={fact.key}
                        className={`flex flex-1 min-w-0 flex-col items-center justify-center px-1 py-1 text-center ${
                          index > 0 ? 'border-l border-[color:var(--app-border)]' : ''
                        }`}
                      >
                        {fact.stars ? <RatingStars value={coverRating} /> : null}
                        <div className={`${textStyles.sectionLabel} tabular-nums ${theme.text}`}>{fact.value}</div>
                        <div className={`${textStyles.caption} ${themeTextMuted}`}>{fact.label}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {progress > 0 && !finished ? <ReadProgressBar value={progress} showLabel className="w-full" /> : null}
              </div>

              <section className="space-y-2">
                <h4 className={sectionKicker}>О книге</h4>
                {descriptionIsHtml && description ? (
                  <div
                    className={`${textStyles.body} ${theme.text} leading-relaxed select-text prose prose-sm ${isAppDark ? 'prose-invert' : ''} ${descOpen || !descLong ? '' : 'line-clamp-4 overflow-hidden'}`}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
                  />
                ) : (
                  <p className={`${textStyles.body} ${theme.text} leading-relaxed select-text ${descOpen || !descLong ? '' : 'line-clamp-4'}`}>
                    {description || 'Аннотация отсутствует.'}
                  </p>
                )}
                {descLong && description ? (
                  <button
                    type="button"
                    onClick={() => setDescOpen((v) => !v)}
                    className={`${textStyles.body} min-h-12 ${theme.accentText} ${theme.focusRing} ${motionTokens.press}`}
                  >
                    {descOpen ? 'Свернуть' : 'Показать полностью'}
                  </button>
                ) : null}
                {metaBits.length ? (
                  <p className={`${textStyles.caption} ${themeTextMuted}`}>{metaBits.join(' · ')}</p>
                ) : null}
              </section>

              {showSeriesBlock ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={sectionKicker}>
                      {seriesFollow && !seriesFollow.later ? 'В этой серии' : 'Далее в серии'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => onOpenSeries(detail.series!)}
                      className={`${textStyles.body} min-h-12 px-1 ${themeAccentText} ${theme.focusRing} ${motionTokens.press}`}
                    >
                      Все
                    </button>
                  </div>
                  {seriesLoading && !seriesFollow?.books.length ? (
                    <div className="flex flex-col gap-2" aria-hidden>
                      <BookCardSkeleton />
                      <BookCardSkeleton />
                      <BookCardSkeleton />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2" role="list">
                      {seriesFollow?.books.slice(0, 5).map((item) => (
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
                </section>
              ) : null}

              {showAuthorBlock ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={sectionKicker}>Другие книги автора</h4>
                    <button
                      type="button"
                      onClick={() => onOpenAuthor(authorNames[0] || detail.author)}
                      className={`${textStyles.body} min-h-12 px-1 ${themeAccentText} ${theme.focusRing} ${motionTokens.press}`}
                    >
                      Все
                    </button>
                  </div>
                  {authorLoading && moreByAuthor.length === 0 ? (
                    <BookShelfSkeleton count={4} />
                  ) : (
                    <HorizontalBookShelf
                      books={moreByAuthor}
                      serverConfig={serverConfig}
                      storageDirectory={storageDirectory}
                      downloadedBookIds={downloadedBookIds}
                      readIds={readIds}
                      onBookClick={openBookPage}
                    />
                  )}
                </section>
              ) : null}

              {(bookReviewLoading || bookReviewHtml) && (
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
                            className={`rounded-2xl border border-[color:var(--app-border)] bg-[var(--app-surface)] px-4 py-4 ${theme.text}`}
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
              )}
            </div>
            </div>

            <div className="inpx-chrome inpx-chrome-bottom relative shrink-0 px-5 pt-3 pb-2 z-20 space-y-2">
              {downloadError && (
                <p className={`${textStyles.caption} text-center ${semantic.error}`} role="alert">{downloadError}</p>
              )}
              {primaryAction?.kind === 'download' && !isServerConnected ? (
                <p className={`${textStyles.caption} text-center ${themeTextMuted}`}>Нужен интернет для скачивания</p>
              ) : null}
              <div className="flex items-stretch gap-2">
                {primaryAction ? (
                  <Button
                    className="flex-1 min-w-0"
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
                {showShelf && !shelfPickerOpen ? (
                  <Button
                    variant="secondary"
                    className="flex-1 min-w-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShelfPickerOpen(true);
                    }}
                  >
                    <FolderPlus className="w-4 h-4 shrink-0" aria-hidden />
                    На полку
                  </Button>
                ) : null}
                {onToggleBookmark ? (
                  <IconButton
                    label={isBookmarked ? 'Убрать из избранного' : 'В избранное'}
                    aria-pressed={isBookmarked}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleBookmark(book.id);
                    }}
                    className={`shrink-0 ${isBookmarked ? theme.accentText : theme.textMuted}`}
                  >
                    <Heart className={`w-5 h-5 ${isBookmarked ? 'fill-current' : ''}`} aria-hidden />
                  </IconButton>
                ) : null}
              </div>
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
                            if (id != null && onAddToShelf) {
                              const added = await onAddToShelf(book.id, id);
                              if (added !== false) setShelfPickerOpen(false);
                            } else if (id != null) {
                              setShelfPickerOpen(false);
                            }
                          } finally {
                            setShelfBusy(false);
                          }
                        }
                      : undefined
                  }
                />
              ) : null}
            </div>
    </div>,
    document.body,
  );
}
