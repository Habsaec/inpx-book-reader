import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, type DragControls } from 'motion/react';
import { BookOpen, Download, Check, Heart, MessageSquare, CloudUpload } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles, semantic } from '../../ui/tokens';
import { Book, ServerConfig } from '../../types';
import { fetchBookDetails, fetchBookReviewHtml } from '../../lib/inpxClient';
import BookCover from '../BookCover';
import DownloadStatusLabel from '../DownloadStatusLabel';

export interface BookDetailsSheetProps {
  book: Book | null;
  onClose: () => void;
  serverConfig: ServerConfig;
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
  const [bookReviewHtml, setBookReviewHtml] = React.useState('');
  const [bookReviewLoading, setBookReviewLoading] = React.useState(false);

  React.useEffect(() => {
    setAnnotation(null);
    setBookReviewHtml('');
    if (!book || !isServerConnected) return;
    let cancelled = false;
    fetchBookDetails(serverConfig, book.id)
      .then((details) => {
        if (cancelled || !details.annotation) return;
        setAnnotation(details.annotation);
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

  if (typeof document === 'undefined' || !book) return null;

  const description = annotation ?? book.description;

  const themeAccentBg = theme.accentBg;
  const themeAccentText = theme.accentText;
  const themeTextMuted = theme.textMuted;
  const themeSheetFooter = theme.sheetFooter;

  return createPortal(
    <AnimatePresence>
      {book && (
        <div
          className="fixed inset-0 bg-stone-950/60 flex items-end justify-center z-[9999]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            type="button"
            className="absolute inset-0 border-0 p-0 bg-transparent cursor-pointer"
            aria-label="Закрыть"
            onClick={onClose}
          />

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
            className={`w-full max-w-lg rounded-t-3xl max-h-[90vh] relative z-10 border-t flex flex-col overflow-hidden ${theme.sheet}`}
          >
            <div
              className="shrink-0 pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-12 h-1.5 bg-[var(--app-panel-soft)]/40 rounded-full mx-auto" />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-3 flex flex-col gap-4">
              <div className="flex gap-4">
                <BookCover
                  bookId={book.id}
                  serverConfig={isServerConnected ? serverConfig : null}
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
                          className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border transition-colors cursor-pointer ${theme.focusRing} ${
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
                          className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border transition-colors cursor-pointer ${theme.focusRing} ${
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

                  <div className={`leading-relaxed ${themeTextMuted}`}>
                    <span className={`font-bold ${theme.text}`}>Автор: </span>
                    <button
                      type="button"
                      onClick={() => onOpenAuthor(book.author)}
                      className={`hover:underline font-semibold active:opacity-80 ${themeAccentText} ${theme.focusRing}`}
                    >
                      {book.author}
                    </button>
                  </div>

                  {book.genresDisplay?.length ? (
                    <div className={`leading-relaxed ${themeTextMuted}`}>
                      <span className={`font-bold ${theme.text}`}>Жанры: </span>
                      {book.genresDisplay.slice(0, 6).join(', ')}
                    </div>
                  ) : book.genre ? (
                    <div className={`leading-relaxed ${themeTextMuted}`}>
                      <span className={`font-bold ${theme.text}`}>Жанры: </span>
                      {book.genre}{book.subgenre && book.subgenre !== book.genre ? `, ${book.subgenre}` : ''}
                    </div>
                  ) : null}

                  {book.series && (
                    <div className={`leading-relaxed ${themeTextMuted}`}>
                      <span className={`font-bold ${theme.text}`}>Серия: </span>
                      <button
                        type="button"
                        onClick={() => onOpenSeries(book.series!)}
                        className={`hover:underline font-semibold active:opacity-80 ${themeAccentText} ${theme.focusRing}`}
                      >
                        {book.series}{book.seriesNo ? ` #${book.seriesNo}` : ''}
                      </button>
                    </div>
                  )}

                  {book.year && (
                    <div className={themeTextMuted}>Год: <strong>{book.year} г.</strong></div>
                  )}

                  <div className={`flex gap-1.5 pt-1 ${textStyles.micro}`}>
                    <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${theme.chip}`}>{book.ext}</span>
                    {book.size ? (
                      <span className={`px-2 py-0.5 rounded-full font-bold ${theme.chip}`}>
                        {(book.size / 1024).toFixed(0)} КБ
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <span className={`text-xs ${theme.textMuted} uppercase tracking-wider font-extrabold`}>Аннотация</span>
                <p className={`${textStyles.caption} leading-relaxed opacity-90 pr-1 select-text`}>
                  {description || 'Аннотация отсутствует.'}
                </p>
              </div>

              <div className="space-y-3 pt-1 border-t border-[color:var(--app-border)]/15">
                <h4 className={`text-xs uppercase tracking-wider ${theme.textMuted} font-extrabold flex items-center gap-1`}>
                  <MessageSquare className="w-3.5 h-3.5" aria-hidden /> Рецензия
                </h4>
                {bookReviewLoading ? (
                  <p className={`text-xs ${theme.textMuted} italic text-center py-4`}>Загрузка…</p>
                ) : bookReviewHtml ? (
                  <div
                    className={`text-xs leading-relaxed max-h-48 overflow-y-auto prose prose-sm ${isAppDark ? 'prose-invert' : ''}`}
                    dangerouslySetInnerHTML={{ __html: bookReviewHtml }}
                  />
                ) : (
                  <p className={`text-xs ${theme.textMuted} italic text-center py-4`}>Рецензия не найдена</p>
                )}
              </div>
            </div>

            <div className={`shrink-0 px-5 pt-3 pb-4 border-t ${themeSheetFooter}`}>
              {downloadError && (
                <p className={`text-xs mb-2 text-center ${themeTextMuted}`} role="alert">{downloadError}</p>
              )}
              {downloadedBookIds.includes(book.id) ? (
                <button
                  type="button"
                  onClick={() => {
                    onOpenBook(book);
                    onClose();
                  }}
                  className={`w-full font-extrabold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer text-white active:scale-[0.99] transition-transform ${themeAccentBg} ${theme.focusRing}`}
                >
                  <BookOpen className="w-4 h-4" aria-hidden /> Читать
                </button>
              ) : downloadingId === book.id ? (
                <button
                  type="button"
                  disabled
                  aria-busy="true"
                  className="w-full font-extrabold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 text-white bg-[var(--app-muted)] cursor-not-allowed opacity-80"
                >
                  <span className="w-2 h-2 bg-white rounded-full animate-ping" aria-hidden />
                  Загрузка…
                </button>
              ) : queuedBookIds?.has(book.id) ? (
                <button
                  type="button"
                  disabled
                  className="w-full font-extrabold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 text-white bg-[var(--app-muted)] cursor-not-allowed opacity-70"
                >
                  В очереди
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onDownload(book)}
                  className={`w-full font-extrabold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer text-white active:scale-[0.99] transition-transform ${themeAccentBg} ${theme.focusRing}`}
                >
                  <Download className="w-4 h-4" aria-hidden /> Скачать
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
