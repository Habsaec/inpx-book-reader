import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Heart, Layers3, PenLine, Star } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { ServerConfig } from '../../types';
import { displayAuthorName } from '../../lib/inpxClient';
import type { AuthorGroupedState } from '../../hooks/useCatalogData';
import AuthorPortrait from '../AuthorPortrait';
import LiteEntityRow from '../LiteEntityRow';
import { textStyles } from '../../ui/tokens';

interface CatalogDrilldownPanelProps {
  selectedAuthor: string | null;
  selectedSeries: string | null;
  selectedSubgenre: { parent: string; name: string } | null;
  authorOutsideSeries: boolean;
  authorGrouped: AuthorGroupedState | null;
  currentBooksCount: number;
  isServerBrowse: boolean;
  isAppDark: boolean;
  serverConfig: ServerConfig;
  favoriteAuthors: string[];
  favoriteSeries: string[];
  onDrillDownBack: () => void;
  onToggleFavoriteAuthor: (authorName: string) => void;
  onToggleFavoriteSeries: (seriesName: string) => void;
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

export default function CatalogDrilldownPanel({
  selectedAuthor,
  selectedSeries,
  selectedSubgenre,
  authorOutsideSeries,
  authorGrouped,
  currentBooksCount,
  isServerBrowse,
  isAppDark,
  serverConfig,
  favoriteAuthors,
  favoriteSeries,
  onDrillDownBack,
  onToggleFavoriteAuthor,
  onToggleFavoriteSeries,
}: CatalogDrilldownPanelProps) {
  const hasDrilldown = Boolean(selectedAuthor || selectedSeries || selectedSubgenre);
  if (!hasDrilldown) return null;

  const selectedAuthorLabel = displayAuthorName(authorGrouped?.authorName || selectedAuthor || '');
  const bookCount = authorOutsideSeries
    ? (authorGrouped?.standaloneBooks.length ?? currentBooksCount)
    : (authorGrouped?.total ?? currentBooksCount);

  return (
    <>
      <div className={`mb-3.5 flex items-center justify-between gap-3 pb-3 border-b ${theme.divider}`}>
        <div className="min-w-0">
          <button
            type="button"
            onClick={onDrillDownBack}
            className={`flex items-center gap-1 min-h-12 px-1 ${textStyles.caption} mb-1 ${theme.accentText} ${theme.focusRing}`}
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Назад
          </button>
          <h2 className={`${textStyles.caption} ${theme.textMuted}`}>
            {authorOutsideSeries ? 'Вне серий' : selectedAuthor && !selectedSeries ? 'Автор' : selectedSeries ? 'Серия' : 'Жанр'}
          </h2>
          <p className={`${textStyles.bookTitle} truncate mt-0.5`}>
            {authorOutsideSeries
              ? `${selectedAuthorLabel} » Вне серий`
              : selectedAuthor && selectedSeries
                ? `${selectedAuthorLabel} » ${selectedSeries}`
                : selectedAuthor
                  ? selectedAuthorLabel
                  : selectedSeries || (selectedSubgenre && `${selectedSubgenre.parent} » ${selectedSubgenre.name}`)}
          </p>
        </div>
        <p className={`shrink-0 ${textStyles.caption} ${theme.textMuted} tabular-nums`}>
          {bookCount} кн.
        </p>
      </div>

      {selectedAuthor && !selectedSeries && !authorOutsideSeries && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3.5 landscape:max-[500px]:mb-2"
        >
          <div className="flex justify-between items-start gap-3">
            <div className="flex gap-3 items-start min-w-0">
              {isServerBrowse ? (
                <AuthorPortrait
                  authorName={authorGrouped?.authorName || selectedAuthor}
                  serverConfig={serverConfig}
                  size={56}
                  className={`landscape:max-[500px]:!w-10 landscape:max-[500px]:!h-10 ${theme.coverBorder}`}
                />
              ) : (
                <div className={`w-14 h-14 landscape:max-[500px]:w-10 landscape:max-[500px]:h-10 rounded-full flex items-center justify-center border shrink-0 ${theme.avatarBg}`}>
                  <PenLine className={`w-6 h-6 landscape:max-[500px]:w-4 landscape:max-[500px]:h-4 ${theme.accentText}`} aria-hidden />
                </div>
              )}
              <div className="min-w-0">
                <h3 className={`${textStyles.bookTitle} landscape:max-[500px]:text-sm`}>{selectedAuthorLabel}</h3>
                {authorGrouped && (
                  <p className={`${textStyles.micro} mt-0.5 ${theme.textMuted}`}>
                    {authorGrouped.series.length > 0 && `${authorGrouped.series.length} серий · `}
                    {authorGrouped.total} книг
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onToggleFavoriteAuthor(selectedAuthor)}
              aria-label={favoriteAuthors.includes(selectedAuthor) ? 'Убрать из избранного' : 'В избранное'}
              className={`min-h-12 min-w-12 inline-flex items-center justify-center rounded-full shrink-0 ${theme.focusRing} ${
                favoriteAuthors.includes(selectedAuthor)
                  ? 'text-[var(--app-danger)]'
                  : theme.textMuted
              }`}
            >
              <Heart className={`w-5 h-5 ${favoriteAuthors.includes(selectedAuthor) ? 'fill-[var(--app-danger)]' : ''}`} aria-hidden />
            </button>
          </div>

          {isServerBrowse && authorGrouped?.bioHtml ? (
            <div
              className={`mt-3 text-xs leading-relaxed border-t pt-3 landscape:max-[500px]:mt-2 landscape:max-[500px]:pt-2 landscape:max-[500px]:max-h-28 landscape:max-[500px]:overflow-y-auto prose prose-sm max-w-none ${isAppDark ? 'prose-invert ' : ''}${theme.divider}`}
              dangerouslySetInnerHTML={{ __html: authorGrouped.bioHtml }}
            />
          ) : isServerBrowse ? (
            <p className={`mt-3 text-xs border-t pt-3 ${theme.textMuted} ${theme.divider}`}>
              Биография автора не найдена в библиотеке.
            </p>
          ) : null}
        </motion.div>
      )}

      {selectedSeries && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3.5 flex justify-between items-center gap-3"
        >
          <div className="flex gap-3 items-center min-w-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${theme.avatarBg}`}>
              <Layers3 className={`w-5 h-5 ${theme.accentText}`} aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 className={`${textStyles.bookTitle} truncate`}>{selectedSeries}</h3>
              <p className={`${textStyles.caption} ${theme.textMuted}`}>Серия</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onToggleFavoriteSeries(selectedSeries)}
            aria-label={favoriteSeries.includes(selectedSeries) ? 'Убрать серию из избранного' : 'В избранное'}
            className={`min-h-12 min-w-12 inline-flex items-center justify-center rounded-full shrink-0 ${theme.focusRing} ${
              favoriteSeries.includes(selectedSeries)
                ? 'text-[var(--app-warning)]'
                : theme.textMuted
            }`}
          >
            <Star className={`w-5 h-5 ${favoriteSeries.includes(selectedSeries) ? 'fill-[var(--app-warning)]' : ''}`} aria-hidden />
          </button>
        </motion.div>
      )}
    </>
  );
}
