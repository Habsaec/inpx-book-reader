import React from 'react';
import { ArrowLeft, BookOpen, Bookmark, CheckCircle2, Download, FolderPlus, Heart, Layers3, PenLine, ThumbsDown } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { Book, ServerConfig } from '../../types';
import { displayAuthorName, type SeriesInfo, type SeriesReadingProgress, type UiShelf } from '../../lib/inpxClient';
import { sameSeriesName } from '../../lib/seriesLabel';
import { sanitizeHtml } from '../../lib/sanitizeHtml';
import type { AuthorGroupedState } from '../../hooks/useCatalogData';
import type { StorageDirectory } from '../../lib/storageDirectory';
import AuthorPortrait from '../AuthorPortrait';
import LiteEntityRow from '../LiteEntityRow';
import FlibustaBookRow from './FlibustaBookRow';
import QuickAction from './QuickAction';
import ShelfPicker from '../ShelfPicker';
import { textStyles, radii, elevation, motion as motionTokens } from '../../ui/tokens';
import { t, tn, formatNumber, getLocale } from '../../i18n';

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
  /** «Не рекомендовать» authors (server names); null hides the button. */
  notRecommendedAuthors?: string[] | null;
  onSetAuthorNotRecommended?: (authorName: string, on: boolean) => void | Promise<void>;
  onToggleFavoriteSeries: (seriesName: string) => void;
  onDownloadSeries?: () => void;
  seriesDownloadBusy?: boolean;
  /** «Прочитано N из M» for the open series (signed-in, newer server); null hides the block. */
  seriesProgress?: SeriesReadingProgress | null;
  /** Opens the details of the next unread volume. */
  onOpenSeriesNext?: (bookId: string) => void;
  /** Authors, genres, languages, years of the open series (`/api/series-info`); null hides the block. */
  seriesInfo?: SeriesInfo | null;
  /** Opens an author page (series authors). */
  onOpenAuthor?: (authorName: string) => void;
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
          name={t('common.outsideSeries')}
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
                  {tn('common.booksShort', s.bookCount)}
                </span>
              </button>
              {onDownloadSeries ? (
                <button
                  type="button"
                  aria-label={t('catalogDrilldownPanel.downloadSeries', { p: s.displayName || s.name })}
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
            <h3 className={textStyles.bookTitle}>{t('common.outsideSeries')}</h3>
            <span className={`shrink-0 ${textStyles.caption} ${theme.textMuted} tabular-nums`}>
              {tn('common.booksShort', authorGrouped.standaloneBooks.length)}
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

function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([getLocale()], { type: 'language' }).of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch { /* unknown code */ }
  return code.toUpperCase();
}

/** Series facts like the web series hero: authors (open their pages), genres, languages, INPX years, volumes. */
function SeriesInfoBlock({
  info,
  onOpenAuthor,
}: {
  info: SeriesInfo;
  onOpenAuthor?: (authorName: string) => void;
}) {
  const years = info.yearFrom == null
    ? ''
    : info.yearTo != null && info.yearTo !== info.yearFrom ? `${info.yearFrom}–${info.yearTo}` : String(info.yearFrom);
  const rows: Array<[string, string]> = [];
  if (info.genres.length) rows.push([t('catalogDrilldownPanel.seriesGenres'), info.genres.map((g) => g.displayName).join(', ')]);
  if (info.languages.length) rows.push([t('catalogDrilldownPanel.seriesLanguages'), info.languages.map((l) => languageName(l.code)).join(', ')]);
  if (years) rows.push([t('catalogDrilldownPanel.seriesYears'), years]);
  if (info.volumeCount > 0 && info.volumeCount !== info.bookCount) {
    rows.push([t('catalogDrilldownPanel.seriesVolumes'), formatNumber(info.volumeCount)]);
  }
  const moreAuthors = info.authorCount - info.authors.length;
  return (
    <div className="mt-3 space-y-2">
      {info.authors.length ? (
        <div>
          <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('catalogDrilldownPanel.seriesAuthors')}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {info.authors.map((a) => (
              <button
                key={a.name}
                type="button"
                disabled={!onOpenAuthor}
                onClick={() => onOpenAuthor?.(a.name)}
                className={`min-h-10 px-3 rounded-full ${textStyles.captionBold} ${theme.accentText} ${theme.accentMuted} ${theme.focusRing} ${motionTokens.press}`}
              >
                {displayAuthorName(a.displayName || a.name)}
              </button>
            ))}
            {moreAuthors > 0 ? (
              <span className={`self-center ${textStyles.caption} ${theme.textMuted}`}>
                {t('catalogDrilldownPanel.seriesMoreAuthors', { n: formatNumber(moreAuthors) })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {rows.map(([label, value]) => (
        <p key={label} className={`${textStyles.caption} ${theme.text}`}>
          <span className={theme.textMuted}>{label}: </span>{value}
        </p>
      ))}
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
          {t('common.readOf', { read: progress.read, total: progress.total })}
        </p>
        {!next ? (
          <span className={`${textStyles.captionBold} text-[var(--app-success)]`}>{t('catalogDrilldownPanel.seriesFinished')}</span>
        ) : null}
      </div>
      <div
        className="h-1.5 rounded-full bg-[var(--app-progress-track,var(--app-border))] overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('catalogDrilldownPanel.readOf', { read: progress.read, total: progress.total })}
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
          <span className="shrink-0">{t('common.continue')}</span>
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
          <span className="shrink-0">{t('catalogDrilldownPanel.readTheNextOne')}</span>
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
  notRecommendedAuthors = null,
  onSetAuthorNotRecommended,
  onToggleFavoriteSeries,
  onDownloadSeries,
  seriesDownloadBusy = false,
  seriesProgress = null,
  onOpenSeriesNext,
  seriesInfo = null,
  onOpenAuthor,
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
  // Server spelling of the author (`authorName` of the grouped list) is what the list stores.
  const notRecommendName = authorGrouped?.authorName || selectedAuthor || '';
  const notRecommended = Boolean(
    notRecommendName && notRecommendedAuthors?.some((a) => a.toLowerCase() === notRecommendName.toLowerCase()),
  );

  return (
    <>
      {showBackBar ? (
      <div className={`mb-4 flex items-center gap-2 p-3 ${radii.lg} ${theme.panel}`}>
        <button
          type="button"
          onClick={onDrillDownBack}
          className={`flex items-center gap-1.5 min-h-12 px-3 ${radii.button} ${textStyles.captionBold} ${theme.accentText} ${theme.accentMuted} ${theme.focusRing} ${motionTokens.press}`}
        >
          <ArrowLeft className="w-5 h-5" aria-hidden /> {t('common.back')}
        </button>
        <span className="flex-1 min-w-0" />
        <p className={`shrink-0 ${textStyles.caption} ${theme.textMuted} tabular-nums`}>
          {tn('common.booksShort', bookCount)}
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
                <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('common.author')}</p>
                <h2 className={`text-[1.375rem] leading-7 font-extrabold tracking-[-0.02em] landscape:max-[500px]:text-base landscape:max-[500px]:leading-snug mt-0.5 ${theme.text}`}>
                  {selectedAuthorLabel}
                </h2>
                {authorGrouped && (
                  <p className={`${textStyles.caption} mt-1 ${theme.textMuted}`}>
                    {authorGrouped.series.length > 0 && `${tn('common.seriesCount', authorGrouped.series.length)} · `}
                    {tn('common.booksCount', authorGrouped.total)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onToggleFavoriteAuthor(selectedAuthor!)}
              aria-label={favoriteAuthors.includes(selectedAuthor!) ? t('common.removeFromFavorites') : t('common.addToFavorites')}
              className={`min-h-12 min-w-12 inline-flex items-center justify-center rounded-full shrink-0 ${theme.focusRing} ${motionTokens.press} ${
                favoriteAuthors.includes(selectedAuthor!)
                  ? 'text-[var(--app-danger)]'
                  : theme.textMuted
              }`}
            >
              <Heart className={`w-5 h-5 ${favoriteAuthors.includes(selectedAuthor!) ? 'fill-[var(--app-danger)]' : ''}`} aria-hidden />
            </button>
            {notRecommendedAuthors && onSetAuthorNotRecommended && isServerBrowse ? (
              <button
                type="button"
                onClick={() => void onSetAuthorNotRecommended(notRecommendName, !notRecommended)}
                aria-pressed={notRecommended}
                aria-label={notRecommended ? t('catalogDrilldownPanel.notRecommended') : t('catalogDrilldownPanel.notRecommend')}
                title={t('catalogDrilldownPanel.notRecommendHint')}
                className={`min-h-12 min-w-12 inline-flex items-center justify-center rounded-full shrink-0 ${theme.focusRing} ${motionTokens.press} ${
                  notRecommended ? theme.accentText : theme.textMuted
                }`}
              >
                <ThumbsDown className={`w-5 h-5 ${notRecommended ? 'fill-current' : ''}`} aria-hidden />
              </button>
            ) : null}
            </div>
          </div>

          {isServerBrowse && authorGrouped?.bioHtml ? (
            <div
              className={`mt-4 text-sm leading-relaxed landscape:max-[500px]:mt-2 landscape:max-[500px]:max-h-28 landscape:max-[500px]:overflow-y-auto prose prose-sm max-w-none ${isAppDark ? 'prose-invert ' : ''}${theme.divider}`}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(authorGrouped.bioHtml) }}
            />
          ) : isServerBrowse ? (
            <p className={`mt-4 ${textStyles.caption} ${theme.textMuted}`}>
              {t('catalogDrilldownPanel.noAuthorBiographyInThe')}
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
                <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('common.series')}</p>
                <h2 className={`text-[1.375rem] leading-7 font-extrabold tracking-[-0.02em] landscape:max-[500px]:text-base landscape:max-[500px]:leading-snug mt-0.5 ${theme.text}`}>
                  {selectedSeriesDisplay || selectedSeries}
                </h2>
                <p className={`${textStyles.caption} mt-1 ${theme.textMuted}`}>
                  {selectedAuthor ? selectedAuthorLabel : null}
                  {selectedAuthor ? ' · ' : ''}
                  {tn('common.booksCount', bookCount)}
                </p>
              </div>
            </div>
            </div>
            {seriesInfo ? <SeriesInfoBlock info={seriesInfo} onOpenAuthor={onOpenAuthor} /> : null}
            {(() => {
              const favorite = favoriteSeries.some((name) => sameSeriesName(name, selectedSeries));
              const fullyRead = Boolean(seriesProgress && seriesProgress.total > 0 && !seriesProgress.next);
              const want = Boolean(seriesProgress?.want);
              return (
                <div className={`mt-3 flex border-y ${theme.divider} ${seriesActionBusy ? 'opacity-60 pointer-events-none' : ''}`}>
                  {onToggleSeriesWant && seriesProgress && !fullyRead ? (
                    <QuickAction label={want ? t('common.savedForLater') : t('common.wantToRead')} pressed={want} onClick={onToggleSeriesWant}>
                      <Bookmark className={`w-5 h-5 ${want ? 'fill-current' : ''}`} aria-hidden />
                    </QuickAction>
                  ) : null}
                  {onToggleSeriesRead && seriesProgress ? (
                    <QuickAction label={fullyRead ? t('catalogDrilldownPanel.finished') : t('common.markAsRead')} pressed={fullyRead} onClick={onToggleSeriesRead}>
                      <CheckCircle2 className="w-5 h-5" aria-hidden />
                    </QuickAction>
                  ) : null}
                  <QuickAction
                    label={favorite ? t('common.inFavorites') : t('common.addToFavorites')}
                    pressed={favorite}
                    onClick={() => onToggleFavoriteSeries(selectedSeries)}
                  >
                    <Heart className={`w-5 h-5 ${favorite ? 'fill-current' : ''}`} aria-hidden />
                  </QuickAction>
                  {onAddSeriesToShelf ? (
                    <QuickAction label={t('common.addToShelf')} expanded={seriesShelfOpen} onClick={() => setSeriesShelfOpen((open) => !open)}>
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
                {seriesDownloadBusy ? t('catalogDrilldownPanel.addingToTheQueue') : t('catalogDrilldownPanel.downloadSeriesButton')}
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
              <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('common.outsideSeries')}</p>
              <h2 className={`text-[1.375rem] leading-7 font-extrabold tracking-[-0.02em] landscape:max-[500px]:text-base landscape:max-[500px]:leading-snug mt-0.5 ${theme.text}`}>
                {selectedAuthorLabel}
              </h2>
              <p className={`${textStyles.caption} mt-1 ${theme.textMuted}`}>{tn('common.booksCount', bookCount)}</p>
            </div>
          </div>
        </div>
      )}

      {genreHub && selectedSubgenre && (
        <p className={`mb-3 ${textStyles.caption} ${theme.textMuted}`}>
          {[
            selectedSubgenre.parent,
            bookCount ? tn('common.booksCount', Number(bookCount), { n: formatNumber(Number(bookCount)) }) : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}
    </>
  );
}
