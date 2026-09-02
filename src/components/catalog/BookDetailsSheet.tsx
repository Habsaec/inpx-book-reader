import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, type DragControls } from 'motion/react';
import { BookOpen, Download, Check, Heart, MessageSquare, Star, X } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles, semantic, radii, elevation, motion as motionTokens } from '../../ui/tokens';
import Button from '../../ui/Button';
import { TextBlockSkeleton } from '../../ui/Skeleton';
import { sheetBackdropClass, sheetPanelStyle } from '../../ui/SheetChrome';
import { Book, ServerConfig } from '../../types';
import { fetchBookDetails, fetchBookReviewHtml, fetchFacetBooks, isAuthError, mapServerBook } from '../../lib/inpxClient';
import { looksLikeHtml, sanitizeHtml } from '../../lib/sanitizeHtml';
import type { StorageDirectory } from '../../lib/storageDirectory';
import BookCover from '../BookCover';
import CoverRatingBadge from '../CoverRatingBadge';
import DownloadStatusLabel from '../DownloadStatusLabel';
import HorizontalBookShelf from '../HorizontalBookShelf';
import { useOverlayBackHandler } from '../../hooks/useBackHandler';

function readEinkFlag(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.eink === '1';
}

/** Author/series in the book sheet: 16px type, 48dp row — readable and tappable on a phone. */
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
      className={`flex items-center w-full min-h-12 py-2 -mx-1 px-1.5 text-left text-base leading-snug cursor-pointer ${radii.sm} ${theme.rowPress} ${theme.focusRing} ${motionTokens.colors} ${
        muted ? `font-normal ${theme.textMuted}` : `font-medium ${theme.text}`
      }`}
    >
      <span className="min-w-0 underline decoration-[color-mix(in_srgb,currentColor_28%,transparent)] underline-offset-4">
        {children}
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
  bookmarkIds?: Set<string>;
  readIds?: Set<string>;
  onToggleBookBookmark?: (bookId: string) => void;
  onToggleRead?: (bookId: string) => void;
  isAppDark: boolean;
  onOpenAuthor: (name: string) => void;
  onOpenSeries: (name: string) => void;
  dragControls: DragControls;
  onAuthExpired?: () => void;
}

export default function BookDetailsSheet({
  book,
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
  bookmarkIds,
  readIds,
  onToggleBookBookmark,
  onToggleRead,
  isAppDark,
  onOpenAuthor,
  onOpenSeries,
  dragControls,
  onAuthExpired,
}: BookDetailsSheetProps) {
  const [annotation, setAnnotation] = React.useState<string | null>(null);
  const [annotationIsHtml, setAnnotationIsHtml] = React.useState(false);
  const [bookReviewHtml, setBookReviewHtml] = React.useState('');
  const [bookReviewLoading, setBookReviewLoading] = React.useState(false);
  const [moreByAuthor, setMoreByAuthor] = React.useState<Book[]>([]);
  const [isEink, setIsEink] = React.useState(readEinkFlag);
  const coverRating = Math.max(0, Math.min(5, Math.round(Number(book?.rating) || 0)));

  React.useEffect(() => {
    const el = document.documentElement;
    const sync = () => setIsEink(el.dataset.eink === '1');
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-eink'] });
    return () => obs.disconnect();
  }, []);

  React.useEffect(() => {
    setAnnotation(null);
    setAnnotationIsHtml(false);
    setBookReviewHtml('');
    setMoreByAuthor([]);
    if (!book || !isServerConnected) return;
    let cancelled = false;
    fetchBookDetails(serverConfig, book.id)
      .then((details) => {
        if (cancelled || !details.annotation) return;
        setAnnotation(details.annotation);
        setAnnotationIsHtml(Boolean(details.annotationIsHtml) || looksLikeHtml(details.annotation));
      })
      .catch((e) => {
        if (cancelled) return;
        if (isAuthError(e)) onAuthExpired?.();
      });
    if (book.author?.trim()) {
      void fetchFacetBooks(serverConfig, 'authors', book.author, 1, { sort: 'rating' })
        .then((data) => {
          if (cancelled) return;
          setMoreByAuthor(
            data.items
              .map((item) => mapServerBook(item, serverConfig) as Book)
              .filter((b) => b.id !== book.id)
              .slice(0, 8),
          );
        })
        .catch(() => {
          if (!cancelled) setMoreByAuthor([]);
        });
    }
    return () => { cancelled = true; };
  }, [book?.id, book?.author, isServerConnected, serverConfig]);

  React.useEffect(() => {
    setBookReviewHtml('');
    if (!book || !isServerConnected) return;
    let cancelled = false;
    setBookReviewLoading(true);
    fetchBookReviewHtml(serverConfig, book.id)
      .then((html) => { if (!cancelled) setBookReviewHtml(html); })
      .catch(() => { if (!cancelled) setBookReviewHtml(''); })
      .finally(() => { if (!cancelled) setBookReviewLoading(false); });
    return () => { cancelled = true; };
  }, [book?.id, isServerConnected, serverConfig]);

  useOverlayBackHandler(Boolean(book), onClose);

  // Не размонтируем портал при book → null: AnimatePresence держит уходящий
  // child с последними пропсами — ранний return null мгновенно убивал exit-анимацию.
  if (typeof document === 'undefined') return null;

  const description = annotation ?? book?.description ?? '';
  const descriptionIsHtml =
    (annotation != null ? annotationIsHtml : looksLikeHtml(book?.description || ''))
    && Boolean(description?.trim());

  const themeAccentBg = theme.accentBg;
  const themeAccentText = theme.accentText;
  const themeTextMuted = theme.textMuted;
  const themeSheetFooter = theme.sheetFooter;

  return createPortal(
    <AnimatePresence>
      {book && (
        <div
          className={sheetBackdropClass}
          onClick={onClose}
        >
          <motion.div
            key="book-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-book-sheet-title"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 72 || info.velocity.y > 420) onClose();
            }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full rounded-t-3xl max-h-[85vh] relative z-10 border-t flex flex-col overflow-hidden ${theme.sheet}`}
            style={sheetPanelStyle()}
          >
            <div
              className="shrink-0 h-12 px-3 cursor-grab active:cursor-grabbing touch-none relative flex items-center"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-12 shrink-0" aria-hidden />
              <div className="flex-1 flex justify-center">
                <div className="w-10 h-1 rounded-full bg-[color-mix(in_srgb,var(--app-text)_18%,transparent)]" />
              </div>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()}
                className={`w-12 h-12 shrink-0 inline-flex items-center justify-center ${radii.button} ${theme.panel} ${theme.chipButton} ${theme.focusRing} ${motionTokens.press}`}
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 flex flex-col gap-5">
              <div className="flex gap-4">
                <div className="book-cover shrink-0 w-[120px] h-[180px]">
                  <span className="book-cover-inner">
                    <BookCover
                      bookId={book.id}
                      serverConfig={isServerConnected ? serverConfig : null}
                      storageDirectory={storageDirectory}
                      variant="full"
                      title={book.title}
                      author={book.author}
                      width={120}
                      height={180}
                      className="absolute inset-0 w-full h-full !rounded-none !border-0"
                    />
                    {isEink && coverRating > 0 ? (
                      <span
                        className="absolute z-[6] bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-md bg-black/75 px-1.5 py-0.5 text-white"
                        aria-label={`Рейтинг ${coverRating} из 5`}
                      >
                        <Star className={`w-3 h-3 fill-current ${semantic.warning}`} aria-hidden />
                        <span className={`${textStyles.microBold} tabular-nums leading-none`}>{coverRating}</span>
                      </span>
                    ) : null}
                  </span>
                  {!isEink ? (
                    <CoverRatingBadge rating={coverRating} coverWidthPx={120} />
                  ) : null}
                </div>

                <div className="flex-1 space-y-3 min-w-0">
                  <div>
                    <h3 id="catalog-book-sheet-title" className={`${textStyles.bookTitle} text-xl line-clamp-3`}>
                      {book.title}
                    </h3>
                    {book.author?.trim() ? (
                      <BookSheetMetaLink
                        ariaLabel={`Автор: ${book.author}`}
                        onClick={() => onOpenAuthor(book.author)}
                      >
                        {book.author}
                      </BookSheetMetaLink>
                    ) : null}
                    {book.series ? (
                      <BookSheetMetaLink
                        ariaLabel={`Серия: ${book.series}`}
                        muted
                        onClick={() => onOpenSeries(book.series!)}
                      >
                        {book.series}{book.seriesNo ? ` · том ${book.seriesNo}` : ''}
                      </BookSheetMetaLink>
                    ) : null}
                  </div>

                  {(onToggleBookBookmark || onToggleRead) && (
                    <div className="flex items-center gap-2">
                      {onToggleBookBookmark && (
                        <button
                          type="button"
                          aria-label={bookmarkIds?.has(book.id) ? 'Убрать из избранного' : 'В избранное'}
                          aria-pressed={bookmarkIds?.has(book.id)}
                          onClick={() => onToggleBookBookmark(book.id)}
                          className={`inline-flex items-center justify-center w-12 h-12 ${radii.button} border transition-all cursor-pointer ${theme.focusRing} ${motionTokens.press} ${
                            bookmarkIds?.has(book.id)
                              ? 'bg-[color-mix(in_srgb,var(--app-danger)_15%,transparent)] border-[var(--app-danger)] text-[var(--app-danger)]'
                              : `${theme.panel} border-[color:var(--app-border)] ${theme.textMuted} hover:text-[var(--app-danger)]`
                          }`}
                        >
                          <Heart
                            className={`w-[18px] h-[18px] ${bookmarkIds?.has(book.id) ? 'fill-current' : ''}`}
                            strokeWidth={2}
                            aria-hidden
                          />
                        </button>
                      )}
                      {onToggleRead && (
                        <button
                          type="button"
                          aria-label={readIds?.has(book.id) ? 'Снять отметку прочитано' : 'Отметить прочитанным'}
                          aria-pressed={readIds?.has(book.id)}
                          onClick={() => onToggleRead(book.id)}
                          className={`inline-flex items-center justify-center w-12 h-12 ${radii.button} border transition-all cursor-pointer ${theme.focusRing} ${motionTokens.press} ${
                            readIds?.has(book.id)
                              ? 'bg-[color-mix(in_srgb,var(--app-success)_15%,transparent)] border-[var(--app-success)] text-[var(--app-success)]'
                              : `${theme.panel} border-[color:var(--app-border)] ${theme.textMuted} hover:text-[var(--app-success)]`
                          }`}
                        >
                          <Check className="w-[18px] h-[18px]" strokeWidth={2.5} aria-hidden />
                        </button>
                      )}
                    </div>
                  )}

                  {isServerConnected && (
                    <DownloadStatusLabel
                      isDownloaded={downloadedBookIds.includes(book.id)}
                      isDownloading={
                        downloadingId === book.id || Boolean(queuedBookIds?.has(book.id))
                      }
                      showNotDownloaded
                    />
                  )}

                  {(book.genresDisplay?.length || book.genre || book.year) && (
                    <p className={`${textStyles.caption} ${themeTextMuted} leading-relaxed`}>
                      {[
                        book.genresDisplay?.length
                          ? book.genresDisplay.slice(0, 4).join(', ')
                          : book.genre
                            ? `${book.genre}${book.subgenre && book.subgenre !== book.genre ? `, ${book.subgenre}` : ''}`
                            : null,
                        book.year ? String(book.year) : null,
                        book.ext?.toUpperCase(),
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>

              <div className={`${radii.lg} ${theme.panel} p-4 space-y-2`}>
                <span className={`${textStyles.sectionLabel} ${theme.text}`}>О книге</span>
                {descriptionIsHtml && description ? (
                  <div
                    className={`${textStyles.body} leading-relaxed max-h-48 overflow-y-auto select-text prose prose-sm ${isAppDark ? 'prose-invert' : ''} ${theme.text}`}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
                  />
                ) : (
                  <p className={`${textStyles.body} leading-relaxed ${theme.text} select-text`}>
                    {description || 'Аннотация отсутствует.'}
                  </p>
                )}
              </div>

              {(bookReviewLoading || bookReviewHtml) && (
                <div className={`${radii.lg} ${theme.panel} p-4 space-y-3`}>
                  <h4 className={`${textStyles.sectionLabel} ${theme.text} flex items-center gap-2`}>
                    <MessageSquare className="w-4 h-4" aria-hidden /> Отзывы
                  </h4>
                  {bookReviewLoading ? (
                    <TextBlockSkeleton lines={4} />
                  ) : (
                    <div
                      className={`text-sm leading-relaxed max-h-48 overflow-y-auto prose prose-sm ${isAppDark ? 'prose-invert' : ''}`}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(bookReviewHtml) }}
                    />
                  )}
                </div>
              )}

              {moreByAuthor.length > 0 && (
                <div className={`${radii.lg} ${theme.panel} p-4 space-y-3`}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`${textStyles.sectionLabel} ${theme.text}`}>Ещё этого автора</h4>
                    <button
                      type="button"
                      onClick={() => { onOpenAuthor(book.author); onClose(); }}
                      className={`${textStyles.captionBold} min-h-12 px-4 ${themeAccentText} ${theme.accentMuted} ${radii.button} ${theme.focusRing} ${motionTokens.press}`}
                    >
                      Все
                    </button>
                  </div>
                  <HorizontalBookShelf
                    books={moreByAuthor}
                    serverConfig={serverConfig}
                    storageDirectory={storageDirectory}
                    downloadedBookIds={downloadedBookIds}
                    onBookClick={(b) => onSelectBook?.(b)}
                  />
                </div>
              )}
            </div>

            <div className={`shrink-0 px-5 pt-4 pb-2 border-t relative z-20 ${themeSheetFooter} ${elevation.card}`}>
              {downloadError && (
                <p className={`${textStyles.caption} mb-2 text-center ${semantic.error}`} role="alert">{downloadError}</p>
              )}
              {downloadedBookIds.includes(book.id) ? (
                <Button fullWidth onClick={() => { onOpenBook(book); onClose(); }}>
                  <BookOpen className="w-4 h-4" aria-hidden /> Читать
                </Button>
              ) : downloadingId === book.id ? (
                <Button fullWidth loading disabled>
                  Загрузка…
                </Button>
              ) : queuedBookIds?.has(book.id) ? (
                <Button fullWidth disabled>
                  В очереди
                </Button>
              ) : !isServerConnected ? (
                <Button fullWidth disabled>
                  Нужен интернет для скачивания
                </Button>
              ) : (
                <Button
                  fullWidth
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(book);
                  }}
                >
                  <Download className="w-4 h-4" aria-hidden /> Скачать
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
