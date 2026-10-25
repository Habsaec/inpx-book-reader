import React from 'react';
import { ArrowLeft, BookOpen, Bookmark, CheckCircle2, Download, FolderPlus, Heart, Layers3, PenLine } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { Book, ServerConfig } from '../../types';
import { displayAuthorName, type SeriesReadingProgress, type UiShelf } from '../../lib/inpxClient';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import type { AuthorGroupedState } from '../../hooks/useCatalogData';
import type { StorageDirectory } from '../../lib/storageDirectory';
import AuthorPortrait from '../AuthorPortrait';
import LiteEntityRow from '../LiteEntityRow';
import FlibustaBookRow from './FlibustaBookRow';
import QuickAction from './QuickAction';
import ShelfPicker from '../ShelfPicker';
import { textStyles, radii, elevation, motion as motionTokens } from '../../ui/tokens';

interface CatalogDrilldownPanelProps {
  selectedAuthor: string | null;
  selectedSeries: string | null;
  /** Readable name of `selectedSeries` (the lookup key is lowercase). */
  selectedSeriesDisplay?: string;
  selectedSubgenre: { parent: string; name: string } | null;
  authorOutsideSeries: boolean;
  authorGrouped: AuthorGroupedState | null;
  currentBooksCount: number;
  isServerBrowse: boolean;
  isAppDark: boolean;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  favoriteAuthors: string[];
  favoriteSeries: string[];
  onDrillDownBack: () => void;
  showBackBar?: boolean;
  onToggleFavoriteAuthor: (authorName: string) => void;
  onToggleFavoriteSeries: (seriesName: string) => void;
  onDownloadSeries?: () => void;
  seriesDownloadBusy?: boolean;
  /** «Прочитано N из M» for the open series (signed-in, newer server); null hides the block. */
  seriesProgress?: SeriesReadingProgress | null;
  /** Opens the details of the next unread volume. */
  onOpenSeriesNext?: (bookId: string) => void;
  /** Series action row (book sheet order: хочу → прочитано → избранное → полка); online only. */
  onToggleSeriesWant?: () => void;
  onToggleSeriesRead?: () => void;
  /** Whole series to a server shelf; `shelves` are server shelves only. */
  shelves?: UiShelf[];
  onAddSeriesToShelf?: (shelfId: number | string) => void | Promise<void>;
  onCreateShelfForSeries?: (name: string) => void | boolean | Promise<void | boolean>;
  seriesActionBusy?: boolean;
}

export function CatalogAuthorSeriesShelf({
  authorGrouped,
  selectedAuthor,
  isAppDark,
  onOpenSeries,
  onOpenOutsideSeries,
}: {
  authorGrouped: AuthorGroupedState;
  selectedAuthor: string;
  isAppDark: boolean;
  onOpenSeries: (seriesName: string) => void;
  onOpenOutsideSeries: () => void;
}) {
  if (!authorGrouped.series.length && !authorGrouped.standaloneBooks.length) return null;

  return (
    <div className={`mb-3 ${theme.divider}`}>
      {authorGrouped.series.map((s) => (
        <LiteEntityRow
          key={s.name}
          name={s.displayName || s.name}
          count={s.bookCount}
          isAppDark={isAppDark}
          onClick={() => onOpenSeries(s.name)}
        />
      ))}
      {authorGrouped.standaloneBooks.length > 0 && (
        <LiteEntityRow
          name="Вне серий"
          count={authorGrouped.standaloneBooks.length}
          isAppDark={isAppDark}
          onClick={onOpenOutsideSeries}
        />
      )}
    </div>
  );
}

/** Flibusta-style author list: series headers with books underneath (as on server). */
export function CatalogAuthorGroupedList({
  authorGrouped,
  serverConfig,
  storageDirectory,
  downloadedBookIds,
  downloadingId = null,
  queuedBookIds,
  readingProgressByBookId,
  readIds,
  onBookClick,
  onBookLongPress,
  onOpenSeries,
  onDownloadSeries,
  seriesDownloadBusy = false,
}: {
  authorGrouped: AuthorGroupedState;
  isAppDark?: boolean;
  isServerBrowse?: boolean;
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  downloadedBookIds: string[];
  downloadingId?: string | null;
  queuedBookIds?: Set<string>;
  readIds?: Set<string>;
  readingProgressByBookId?: Record<string, number>;
  onBookClick: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  onOpenSeries: (seriesName: string) => void;
  onDownloadSeries?: (seriesName: string) => void;
  seriesDownloadBusy?: boolean;
}) {
  const isDownloadingBook = (id: string) =>
    downloadingId === id || Boolean(queuedBookIds?.has(id));
  const hasSeriesBooks = authorGrouped.series.some((s) => (s.books?.length ?? 0) > 0);
  if (!hasSeriesBooks && !authorGrouped.standaloneBooks.length) return null;

  return (
    <div className="mb-3 flex flex-col gap-5">
      {authorGrouped.series.map((s) => {
        const books = s.books ?? [];
        if (!books.length) return null;
        return (
          <section key={s.name} className="min-w-0 py-1">
            <div className="mb-1 flex w-full items-center gap-1 min-h-12 px-0.5">
              <button
                type="button"
                onClick={() => onOpenSeries(s.name)}
                className={`flex min-h-12 min-w-0 flex-1 items-baseline justify-between gap-2 text-left ${theme.rowPress} ${theme.focusRing} ${motionTokens.press}`}
              >
                <h3 className={`${textStyles.bookTitle} truncate`}>{s.displayName || s.name}</h3>
                <span className={`shrink-0 ${textStyles.caption} ${theme.textMuted} tabular-nums`}>
                  {s.bookCount} кн.
                </span>
              </button>
              {onDownloadSeries ? (
                <button
                  type="button"
                  aria-label={`Скачать серию ${s.displayName || s.name}`}
                  disabled={seriesDownloadBusy}
                  onClick={() => onDownloadSeries(s.name)}
                  className={`shrink-0 min-h-12 min-w-12 inline-flex items-center justify-center ${theme.focusRing} ${theme.accentText} ${motionTokens.press} disabled:opacity-50`}
                >
                  <Download className="w-4 h-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <div>
              {books.map((book) => (
                <FlibustaBookRow
                  key={book.id}
                  book={book}
                  serverConfig={serverConfig}
                  storageDirectory={storageDirectory}
                  isDownloaded={downloadedBookIds.includes(book.id)}
                  isDownloading={isDownloadingBook(book.id)}
                  readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress ?? 0}
                  isRead={readIds?.has(book.id)}
                  onClick={() => onBookClick(book)}
                  onLongPress={onBookLongPress ? () => onBookLongPress(book) : undefined}
                />
              ))}
            </div>
          </section>
        );
      })}
      {authorGrouped.standaloneBooks.length > 0 && (
        <section className="min-w-0 py-1">
          <div className="mb-1 flex items-baseline justify-between gap-2 min-h-10 px-0.5">
            <h3 className={textStyles.bookTitle}>Вне серий</h3>
            <span className={`shrink-0 ${textStyles.caption} ${theme.textMuted} tabular-nums`}>
              {authorGrouped.standaloneBooks.length} кн.
            </span>
          </div>
          <div>
            {authorGrouped.standaloneBooks.map((book) => (
              <FlibustaBookRow
                key={book.id}
                book={book}
                serverConfig={serverConfig}
                storageDirectory={storageDirectory}
                isDownloaded={downloadedBookIds.includes(book.id)}
                isDownloading={isDownloadingBook(book.id)}
                readProgress={readingProgressByBookId?.[book.id] ?? book.readProgress ?? 0}
                isRead={readIds?.has(book.id)}
                onClick={() => onBookClick(book)}
                onLongPress={onBookLongPress ? () => onBookLongPress(book) : undefined}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Same numbers as the web series page: editions of one volume count once, unnumbered volumes last. */
function SeriesProgressBlock({
  progress,
  onOpenNext,
}: {
  progress: SeriesReadingProgress;
  onOpenNext?: (bookId: string) => void;
}) {
  const pct = Math.round((progress.read / Math.max(1, progress.total)) * 100);
  const next = progress.next;
  const nextTitle = next ? `${next.seriesNo ? `${next.seriesNo}. ` : ''}${next.title}` : '';
  const current = progress.current ?? null;
  const currentTitle = current ? `${current.seriesNo ? `${current.seriesNo}. ` : ''}${current.title}` : '';
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className={`${textStyles.captionBold} ${theme.text}`}>
          Прочитано {progress.read} из {progress.total}
        </p>
        {!next ? (
          <span className={`${textStyles.captionBold} text-[var(--app-success)]`}>Серия прочитана</span>
        ) : null}
      </div>
      <div
        className="h-1.5 rounded-full bg-[var(--app-progress-track,var(--app-border))] overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Прочитано ${progress.read} из ${progress.total}`}
      >
        <div className={`h-full rounded-full ${theme.progress}`} style={{ width: `${pct}%` }} />
      </div>
      {current && onOpenNext ? (
        <button
          type="button"
          onClick={() => onOpenNext(current.id)}
          className={`flex w-full min-h-12 items-center gap-2 px-4 ${radii.button} ${textStyles.captionBold} ${theme.accentBg} ${theme.focusRing} ${motionTokens.press}`}
        >
          <BookOpen className="w-4 h-4 shrink-0" aria-hidden />
          <span className="shrink-0">Продолжить</span>
          <span className="min-w-0 truncate font-normal opacity-90">· {currentTitle}</span>
          <span className="ml-auto shrink-0 tabular-nums">{Math.round(current.progress)}%</span>
        </button>
      ) : null}
      {/* One button: «Продолжить» for a started volume, otherwise «Читать следующую» right after a read volume. */}
      {next && onOpenNext && !current && next.prevRead ? (
        <button
          type="button"
          onClick={() => onOpenNext(next.id)}
          className={`flex w-full min-h-12 items-center gap-2 px-4 ${radii.button} ${textStyles.captionBold} ${theme.accentBg} ${theme.focusRing} ${motionTokens.press}`}
        >
          <BookOpen className="w-4 h-4 shrink-0" aria-hidden />
          <span className="shrink-0">Читать следующую</span>
          <span className="min-w-0 truncate font-normal opacity-90">· {nextTitle}</span>
        </button>
      ) : null}
    </div>
  );
}

export default function CatalogDrilldownPanel({
  selectedAuthor,
  selectedSeries,
  selectedSeriesDisplay,
  selectedSubgenre,
  authorOutsideSeries,
  authorGrouped,
  currentBooksCount,
  isServerBrowse,
  isAppDark,
  serverConfig,
  storageDirectory,
  favoriteAuthors,
  favoriteSeries,
  onDrillDownBack,
  showBackBar = true,
  onToggleFavoriteAuthor,
  onToggleFavoriteSeries,
  onDownloadSeries,
  seriesDownloadBusy = false,
  seriesProgress = null,
  onOpenSeriesNext,
  onToggleSeriesWant,
  onToggleSeriesRead,
  shelves = [],
  onAddSeriesToShelf,
  onCreateShelfForSeries,
  seriesActionBusy = false,
}: CatalogDrilldownPanelProps) {
  const [seriesShelfOpen, setSeriesShelfOpen] = React.useState(false);
  React.useEffect(() => { setSeriesShelfOpen(false); }, [selectedSeries]);
  const hasDrilldown = Boolean(selectedAuthor || selectedSeries || selectedSubgenre);
  if (!hasDrilldown) return null;

  const selectedAuthorLabel = displayAuthorName(authorGrouped?.authorName || selectedAuthor || '');
  const bookCount = authorOutsideSeries
    ? (authorGrouped?.standaloneBooks.length ?? currentBooksCount)
    : (authorGrouped?.total ?? currentBooksCount);

  const authorHub = Boolean(selectedAuthor && !selectedSeries && !authorOutsideSeries);
  const seriesHub = Boolean(selectedSeries);
  const outsideHub = Boolean(authorOutsideSeries && selectedAuthor);
  const genreHub = Boolean(selectedSubgenre && !selectedAuthor && !selectedSeries);

  return (
    <>
      {showBackBar ? (
      <div className={`mb-4 flex items-center gap-2 p-3 ${radii.lg} ${theme.panel}`}>
        <button
          type="button"
          onClick={onDrillDownBack}
          className={`flex items-center gap-1.5 min-h-12 px-3 ${radii.button} ${textStyles.captionBold} ${theme.accentText} ${theme.accentMuted} ${theme.focusRing} ${motionTokens.press}`}
        >
          <ArrowLeft className="w-5 h-5" aria-hidden /> Назад
        </button>
        <span className="flex-1 min-w-0" />
        <p className={`shrink-0 ${textStyles.caption} ${theme.textMuted} tabular-nums`}>
          {bookCount} кн.
        </p>
      </div>
      ) : null}

      {authorHub && (
        <div className="mb-3.5 landscape:max-[500px]:mb-2">
          <div className="flex justify-between items-start gap-3">
            <div className="flex gap-3 items-start min-w-0">
              {isServerBrowse ? (
                <AuthorPortrait
                  authorName={authorGrouped?.authorName || selectedAuthor!}
                  serverConfig={serverConfig}
                  storageDirectory={storageDirectory}
                  hasPortrait={authorGrouped?.hasPortrait}
                  size={80}
                  className="landscape:max-[500px]:!w-12 landscape:max-[500px]:!h-12"
                />
              ) : (
                <div className={`w-20 h-20 landscape:max-[500px]:w-12 landscape:max-[500px]:h-12 rounded-full flex items-center justify-center shrink-0 ${theme.accentMuted}`}>
                  <PenLine className={`w-7 h-7 landscape:max-[500px]:w-5 landscape:max-[500px]:h-5 ${theme.accentText}`} aria-hidden />
                </div>
              )}
              <div className="min-w-0 pt-0.5">
                <p className={`${textStyles.caption} ${theme.textMuted}`}>Автор</p>
                <h2 className={`text-[1.375rem] leading-7 font-extrabold tracking-[-0.02em] landscape:max-[500px]:text-base landscape:max-[500px]:leading-snug mt-0.5 ${theme.text}`}>
                  {selectedAuthorLabel}
                </h2>
                {authorGrouped && (
                  <p className={`${textStyles.caption} mt-1 ${theme.textMuted}`}>
                    {authorGrouped.series.length > 0 && `${authorGrouped.series.length} серий · `}
                    {authorGrouped.total} книг
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onToggleFavoriteAuthor(selectedAuthor!)}
              aria-label={favoriteAuthors.includes(selectedAuthor!) ? 'Убрать из избранного' : 'В избранное'}
              className={`min-h-12 min-w-12 inline-flex items-center justify-center rounded-full shrink-0 ${theme.focusRing} ${motionTokens.press} ${
                favoriteAuthors.includes(selectedAuthor!)
                  ? 'text-[var(--app-danger)]'
                  : theme.textMuted
              }`}
            >
              <Heart className={`w-5 h-5 ${favoriteAuthors.includes(selectedAuthor!) ? 'fill-[var(--app-danger)]' : ''}`} aria-hidden />
            </button>
          </div>

          {isServerBrowse && authorGrouped?.bioHtml ? (
            <div
              className={`mt-4 text-sm leading-relaxed landscape:max-[500px]:mt-2 landscape:max-[500px]:max-h-28 landscape:max-[500px]:overflow-y-auto prose prose-sm max-w-none ${isAppDark ? 'prose-invert ' : ''}${theme.divider}`}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(authorGrouped.bioHtml) }}
            />
          ) : isServerBrowse ? (
            <p className={`mt-4 ${textStyles.caption} ${theme.textMuted}`}>
              Биография автора не найдена в библиотеке.
            </p>
          ) : null}
        </div>
      )}

      {seriesHub && selectedSeries && (
        <div className="mb-3.5 landscape:max-[500px]:mb-2">
            <div className="flex justify-between items-start gap-3">
            <div className="flex gap-3 items-start min-w-0">
              <div className={`w-20 h-20 landscape:max-[500px]:w-12 landscape:max-[500px]:h-12 rounded-full flex items-center justify-center shrink-0 ${theme.accentMuted}`}>
                <Layers3 className={`w-7 h-7 landscape:max-[500px]:w-5 landscape:max-[500px]:h-5 ${theme.accentText}`} aria-hidden />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className={`${textStyles.caption} ${theme.textMuted}`}>Серия</p>
                <h2 className={`text-[1.375rem] leading-7 font-extrabold tracking-[-0.02em] landscape:max-[500px]:text-base landscape:max-[500px]:leading-snug mt-0.5 ${theme.text}`}>
                  {selectedSeriesDisplay || selectedSeries}
                </h2>
                <p className={`${textStyles.caption} mt-1 ${theme.textMuted}`}>
                  {selectedAuthor ? selectedAuthorLabel : null}
                  {selectedAuthor ? ' · ' : ''}
                  {bookCount} книг
                </p>
              </div>
            </div>
            </div>
            {(() => {
              const favorite = favoriteSeries.includes(selectedSeries);
              const fullyRead = Boolean(seriesProgress && seriesProgress.total > 0 && !seriesProgress.next);
              const want = Boolean(seriesProgress?.want);
              return (
                <div className={`mt-3 flex border-y ${theme.divider} ${seriesActionBusy ? 'opacity-60 pointer-events-none' : ''}`}>
                  {onToggleSeriesWant && seriesProgress && !fullyRead ? (
                    <QuickAction label={want ? 'Отложено' : 'Хочу прочитать'} pressed={want} onClick={onToggleSeriesWant}>
                      <Bookmark className={`w-5 h-5 ${want ? 'fill-current' : ''}`} aria-hidden />
                    </QuickAction>
                  ) : null}
                  {onToggleSeriesRead && seriesProgress ? (
                    <QuickAction label={fullyRead ? 'Прочитана' : 'В прочитанные'} pressed={fullyRead} onClick={onToggleSeriesRead}>
                      <CheckCircle2 className="w-5 h-5" aria-hidden />
                    </QuickAction>
                  ) : null}
                  <QuickAction
                    label={favorite ? 'В избранном' : 'В избранное'}
                    pressed={favorite}
                    onClick={() => onToggleFavoriteSeries(selectedSeries)}
                  >
                    <Heart className={`w-5 h-5 ${favorite ? 'fill-current' : ''}`} aria-hidden />
                  </QuickAction>
                  {onAddSeriesToShelf ? (
                    <QuickAction label="На полку" expanded={seriesShelfOpen} onClick={() => setSeriesShelfOpen((open) => !open)}>
                      <FolderPlus className="w-5 h-5" aria-hidden />
                    </QuickAction>
                  ) : null}
                </div>
              );
            })()}
            {seriesShelfOpen && onAddSeriesToShelf ? (
              <div className="mt-3">
                <ShelfPicker
                  shelves={shelves}
                  busy={seriesActionBusy}
                  onPick={(id) => {
                    void Promise.resolve(onAddSeriesToShelf(id)).then(() => setSeriesShelfOpen(false));
                  }}
                  onCreate={onCreateShelfForSeries
                    ? async (name) => {
                      const created = await onCreateShelfForSeries(name);
                      if (created !== false) setSeriesShelfOpen(false);
                      return created;
                    }
                    : undefined}
                />
              </div>
            ) : null}
            {seriesProgress && seriesProgress.total >= 2 ? (
              <SeriesProgressBlock progress={seriesProgress} onOpenNext={onOpenSeriesNext} />
            ) : null}
            {onDownloadSeries ? (
              <button
                type="button"
                onClick={onDownloadSeries}
                disabled={seriesDownloadBusy}
                className={`mt-3 flex w-full min-h-12 items-center justify-center gap-2 ${radii.button} ${textStyles.captionBold} ${theme.accentText} ${theme.accentMuted} ${theme.focusRing} ${motionTokens.press} disabled:opacity-50`}
              >
                <Download className="w-4 h-4" aria-hidden />
                {seriesDownloadBusy ? 'Добавляем в очередь…' : 'Скачать серию'}
              </button>
            ) : null}
        </div>
      )}

      {outsideHub && (
        <div className="mb-3.5 landscape:max-[500px]:mb-2">
          <div className="flex gap-3 items-start min-w-0">
            <div className={`w-20 h-20 landscape:max-[500px]:w-12 landscape:max-[500px]:h-12 rounded-full flex items-center justify-center shrink-0 ${theme.accentMuted}`}>
              <Layers3 className={`w-7 h-7 landscape:max-[500px]:w-5 landscape:max-[500px]:h-5 ${theme.accentText}`} aria-hidden />
            </div>
            <div className="min-w-0 pt-0.5">
              <p className={`${textStyles.caption} ${theme.textMuted}`}>Вне серий</p>
              <h2 className={`text-[1.375rem] leading-7 font-extrabold tracking-[-0.02em] landscape:max-[500px]:text-base landscape:max-[500px]:leading-snug mt-0.5 ${theme.text}`}>
                {selectedAuthorLabel}
              </h2>
              <p className={`${textStyles.caption} mt-1 ${theme.textMuted}`}>{bookCount} книг</p>
            </div>
          </div>
        </div>
      )}

      {genreHub && selectedSubgenre && (
        <p className={`mb-3 ${textStyles.caption} ${theme.textMuted}`}>
          {[
            selectedSubgenre.parent,
            bookCount ? `${Number(bookCount).toLocaleString('ru-RU')} книг` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}
    </>
  );
}
