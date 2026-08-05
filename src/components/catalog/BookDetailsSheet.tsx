import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, type DragControls } from 'motion/react';
import { BookOpen, Download, Check, Heart, MessageSquare, CloudUpload, X } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles, semantic, touchMin } from '../../ui/tokens';
import Button from '../../ui/Button';
import { TextBlockSkeleton } from '../../ui/Skeleton';
import { sheetBackdropClass, sheetPanelStyle } from '../../ui/SheetChrome';
import { Book, ServerConfig } from '../../types';
import { fetchBookDetails, fetchBookReviewHtml } from '../../lib/inpxClient';
import { looksLikeHtml, sanitizeHtml } from '../../lib/sanitizeHtml';
import type { StorageDirectory } from '../../lib/storageDirectory';
import BookCover from '../BookCover';
import DownloadStatusLabel from '../DownloadStatusLabel';
import { useOverlayBackHandler } from '../../hooks/useBackHandler';

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
  bookmarkIds?: Set<string>;
  readIds?: Set<string>;
  onToggleBookBookmark?: (bookId: string) => void;
  onToggleRead?: (bookId: string) => void;
  isAppDark: boolean;
  onOpenAuthor: (name: string) => void;
  onOpenSeries: (name: string) => void;
  dragControls: DragControls;
  hasPendingSync?: boolean;
  onOpenSyncCenter?: () => void;
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
  bookmarkIds,
  readIds,
  onToggleBookBookmark,
  onToggleRead,
  isAppDark,
  onOpenAuthor,
  onOpenSeries,
  dragControls,
  hasPendingSync = false,
  onOpenSyncCenter,
}: BookDetailsSheetProps) {
  const [annotation, setAnnotation] = React.useState<string | null>(null);
  const [annotationIsHtml, setAnnotationIsHtml] = React.useState(false);
  const [bookReviewHtml, setBookReviewHtml] = React.useState('');
  const [bookReviewLoading, setBookReviewLoading] = React.useState(false);

  React.useEffect(() => {
    setAnnotation(null);
    setAnnotationIsHtml(false);
    setBookReviewHtml('');
    if (!book || !isServerConnected) return;
    let cancelled = false;
    fetchBookDetails(serverConfig, book.id)
      .then((details) => {
        if (cancelled || !details.annotation) return;
        setAnnotation(details.annotation);
        setAnnotationIsHtml(Boolean(details.annotationIsHtml) || looksLikeHtml(details.annotation));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [book?.id, isServerConnected, serverConfig]);

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

  useOverlayBackHandler(!!book, onClose);

  if (typeof document === 'undefined' || !book) return null;

  const description = annotation ?? book.description;
  const descriptionIsHtml =
    (annotation != null ? annotationIsHtml : looksLikeHtml(book.description || ''))
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
              className="shrink-0 pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none relative"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-12 h-1.5 bg-[var(--app-panel-soft)]/40 rounded-full mx-auto" />
              <button
                type="button"
                aria-label="Закрыть"
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()}
                className={`absolute right-3 top-1 ${touchMin} inline-flex items-center justify-center rounded-lg ${theme.chipButton} ${theme.focusRing}`}
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-3 flex flex-col gap-4">
              <div className="flex gap-4">
                <BookCover
                  bookId={book.id}
                  serverConfig={isServerConnected ? serverConfig : null}
                  storageDirectory={storageDirectory}
                  variant="full"
                  title={book.title}
                  author={book.author}
                  width={120}
                  height={180}
                  className={`shrink-0 ${theme.coverBorder}`}
                />

                <div className="flex-1 space-y-2 min-w-0 text-xs">
                  <h3 id="catalog-book-sheet-title" className={`${textStyles.bookTitle} text-lg line-clamp-3`}>
                    {book.title}
                  </h3>

                  {(onToggleBookBookmark || onToggleRead) && (
                    <div className="flex items-center gap-2">
                      {onToggleBookBookmark && (
                        <button
                          type="button"
                          aria-label={bookmarkIds?.has(book.id) ? 'Убрать из избранного' : 'В избранное'}
                          aria-pressed={bookmarkIds?.has(book.id)}
                          onClick={() => onToggleBookBookmark(book.id)}
                          className={`inline-flex items-center justify-center w-12 h-12 rounded-xl border transition-colors cursor-pointer ${theme.focusRing} ${
                            bookmarkIds?.has(book.id)
                              ? 'bg-[color-mix(in_srgb,var(--app-danger)_15%,transparent)] border-[var(--app-danger)] text-[var(--app-danger)]'
                              : `border-[color:var(--app-border)] ${theme.textMuted} hover:text-[var(--app-danger)] hover:border-[color-mix(in_srgb,var(--app-danger)_40%,var(--app-border))] active:scale-[0.98]`
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
                          className={`inline-flex items-center justify-center w-12 h-12 rounded-xl border transition-colors cursor-pointer ${theme.focusRing} ${
                            readIds?.has(book.id)
                              ? 'bg-[color-mix(in_srgb,var(--app-success)_15%,transparent)] border-[var(--app-success)] text-[var(--app-success)]'
                              : `border-[color:var(--app-border)] ${theme.textMuted} hover:text-[var(--app-success)] hover:border-[color-mix(in_srgb,var(--app-success)_40%,var(--app-border))] active:scale-[0.98]`
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

                  {hasPendingSync && onOpenSyncCenter && (
                    <button
                      type="button"
                      onClick={onOpenSyncCenter}
                      className={`inline-flex items-center gap-1 mt-1 ${textStyles.microBold} ${semantic.warning} ${theme.focusRing}`}
                    >
                      <CloudUpload className="w-3 h-3" aria-hidden />
                      Ожидает синхронизации
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenAuthor(book.author)}
                    className={`block text-left ${textStyles.body} ${themeAccentText} ${theme.focusRing}`}
                  >
                    {book.author}
                  </button>

                  {book.series && (
                    <button
                      type="button"
                      onClick={() => onOpenSeries(book.series!)}
                      className={`block text-left ${textStyles.caption} ${themeTextMuted} ${theme.focusRing}`}
                    >
                      {book.series}{book.seriesNo ? ` · том ${book.seriesNo}` : ''}
                    </button>
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

              <div className="space-y-1.5">
                <span className={`${textStyles.bodyBold} ${theme.textMuted}`}>О книге</span>
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
                <div className="space-y-2 pt-1">
                  <h4 className={`${textStyles.bodyBold} ${themeTextMuted} flex items-center gap-1.5`}>
                    <MessageSquare className="w-4 h-4" aria-hidden /> Рецензия
                  </h4>
                  {bookReviewLoading ? (
                    <TextBlockSkeleton lines={4} />
                  ) : (
                    <div
                      className={`text-sm leading-relaxed max-h-48 overflow-y-auto prose prose-sm ${isAppDark ? 'prose-invert' : ''}`}
                      dangerouslySetInnerHTML={{ __html: bookReviewHtml }}
                    />
                  )}
                </div>
              )}
            </div>

            <div className={`shrink-0 px-5 pt-3 pb-1 border-t relative z-20 ${themeSheetFooter}`}>
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
