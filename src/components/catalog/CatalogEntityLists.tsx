import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronDown, Tag, Library, User } from 'lucide-react';
import { ServerConfig } from '../../types';
import { theme } from '../../lib/appTheme';
import LiteEntityRow from '../LiteEntityRow';
import CatalogPagination from './CatalogPagination';
import type { LocalGenreAgg } from '../../lib/catalogAggregations';
import type { AuthorSeriesSort } from '../../lib/catalogAggregations';
import type { CatalogSubTab } from './catalogTypes';
import { textStyles } from '../../ui/tokens';

export interface CatalogEntityAuthor {
  key?: string;
  name: string;
  bookCount: number;
  avgRating: number;
  totalDownloads: number;
}

export interface CatalogEntitySeries {
  key?: string;
  name: string;
  bookCount: number;
  avgRating: number;
  totalDownloads: number;
}

interface CatalogEntityListsProps {
  subTab: CatalogSubTab;
  isServerBrowse: boolean;
  isAppDark: boolean;
  serverConfig: ServerConfig;
  authors: CatalogEntityAuthor[];
  series: CatalogEntitySeries[];
  genres: LocalGenreAgg[];
  authorSortBy: AuthorSeriesSort;
  seriesSortBy: AuthorSeriesSort;
  onAuthorSortChange: (sort: AuthorSeriesSort) => void;
  onSeriesSortChange: (sort: AuthorSeriesSort) => void;
  expandedGenres: Record<string, boolean>;
  onToggleGenreExpand: (name: string) => void;
  onSelectSubgenre: (parent: string, name: string) => void;
  listPage: number;
  listPageSize: number;
  listTotal: number;
  onListPageChange: (page: number) => void;
  onOpenAuthor: (key: string) => void;
  onOpenSeries: (key: string) => void;
  selectedAuthor: string | null;
  selectedSeries: string | null;
  selectedSubgenre: { parent: string; name: string } | null;
}

function EntitySortBar({
  label,
  sortBy,
  onChange,
}: {
  label: string;
  sortBy: AuthorSeriesSort;
  onChange: (sort: AuthorSeriesSort) => void;
}) {
  return (
    <div className={`flex items-center justify-between rounded-xl p-2 border text-xs ${theme.cardSecondary}`}>
      <span className={`${theme.textMuted} font-semibold pl-1`}>{label}</span>
      <div className="flex gap-1">
        {(
          [
            { id: 'count' as const, label: 'Книг' },
            { id: 'rating' as const, label: 'Рейтинг' },
            { id: 'name' as const, label: 'А-Я' },
          ] as const
        ).map((btn) => (
          <button
            key={btn.id}
            type="button"
            onClick={() => onChange(btn.id)}
            className={`px-2 py-1 rounded-lg font-bold transition-all ${textStyles.micro} cursor-pointer ${
              sortBy === btn.id ? theme.accentActive : `${theme.chip} ${theme.chipHover}`
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CatalogEntityLists({
  subTab,
  isServerBrowse,
  isAppDark,
  serverConfig,
  authors,
  series,
  genres,
  authorSortBy,
  seriesSortBy,
  onAuthorSortChange,
  onSeriesSortChange,
  expandedGenres,
  onToggleGenreExpand,
  onSelectSubgenre,
  listPage,
  listPageSize,
  listTotal,
  onListPageChange,
  onOpenAuthor,
  onOpenSeries,
  selectedAuthor,
  selectedSeries,
  selectedSubgenre,
}: CatalogEntityListsProps) {
  const themeCardSecondary = theme.cardSecondary;
  const themeAccentText = theme.accentText;

  if (subTab === 'authors' && !selectedAuthor) {
    return (
      <div className="space-y-3">
        {!isServerBrowse && (
          <EntitySortBar label="Сортировка авторов:" sortBy={authorSortBy} onChange={onAuthorSortChange} />
        )}
        <div>
          {authors.map((author) => {
            const authorKey = String(author.key ?? author.name);
            return isServerBrowse ? (
              <LiteEntityRow
                key={authorKey}
                name={author.name}
                count={author.bookCount}
                authorKey={authorKey}
                serverConfig={serverConfig}
                isAppDark={isAppDark}
                onClick={() => onOpenAuthor(authorKey)}
              />
            ) : (
              <button
                type="button"
                key={author.name}
                onClick={() => onOpenAuthor(author.name)}
                className={`w-full border-b last:border-b-0 py-3 flex items-center justify-between text-left ${theme.rowPress} ${theme.divider} ${theme.focusRing}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border text-sm shrink-0 ${theme.iconBg}`}>
                    <User className={`w-4 h-4 ${theme.accentText}`} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-black truncate">{author.name}</h3>
                    <p className={`${textStyles.micro} ${theme.textMuted} mt-0.5`}>
                      Книг: {author.bookCount} • Скачиваний: {author.totalDownloads}
                    </p>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 shrink-0 font-mono ${textStyles.micro} ${theme.accentText} font-bold`}>
                  ★ {author.avgRating}
                  <ChevronRight className={`w-3.5 h-3.5 ${theme.textMuted}`} aria-hidden />
                </div>
              </button>
            );
          })}
        </div>
        {isServerBrowse && (
          <CatalogPagination
            page={listPage}
            pageSize={listPageSize}
            total={listTotal}
            isAppDark={isAppDark}
            onPageChange={onListPageChange}
          />
        )}
      </div>
    );
  }

  if (subTab === 'series' && !selectedSeries) {
    return (
      <div className="space-y-3">
        {!isServerBrowse && (
          <EntitySortBar label="Сортировка серий:" sortBy={seriesSortBy} onChange={onSeriesSortChange} />
        )}
        <div>
          {series.map((item) => {
            const seriesKey = String(item.key ?? item.name);
            return isServerBrowse ? (
              <LiteEntityRow
                key={seriesKey}
                name={item.name}
                count={item.bookCount}
                isAppDark={isAppDark}
                onClick={() => onOpenSeries(seriesKey)}
              />
            ) : (
              <button
                type="button"
                key={item.name}
                onClick={() => onOpenSeries(item.name)}
                className={`w-full border-b last:border-b-0 py-3 flex items-center justify-between text-left ${theme.rowPress} ${theme.divider} ${theme.focusRing}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${theme.iconBg}`}>
                    <Library className={`w-4 h-4 ${themeAccentText}`} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-black truncate">{item.name}</h3>
                    <p className={`${textStyles.label} ${theme.textMuted} mt-0.5`}>
                      Произведений: {item.bookCount} • Популярность: {item.totalDownloads}
                    </p>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 shrink-0 font-mono ${textStyles.label} ${theme.accentText} font-bold`}>
                  ★ {item.avgRating}
                  <ChevronRight className={`w-3.5 h-3.5 ${theme.textMuted}`} aria-hidden />
                </div>
              </button>
            );
          })}
        </div>
        {isServerBrowse && (
          <CatalogPagination
            page={listPage}
            pageSize={listPageSize}
            total={listTotal}
            isAppDark={isAppDark}
            onPageChange={onListPageChange}
          />
        )}
      </div>
    );
  }

  if (subTab === 'genres' && !selectedSubgenre) {
    return (
      <div className="space-y-2.5">
        {genres.map((genreItem) => {
          const isExpanded = !!expandedGenres[genreItem.name];
          const subgenresList = Object.values(genreItem.subgenres);
          return (
            <div key={genreItem.name} className={`border rounded-2xl overflow-hidden ${themeCardSecondary}`}>
              <button
                type="button"
                onClick={() => onToggleGenreExpand(genreItem.name)}
                aria-expanded={isExpanded}
                className={`w-full px-4 py-3 flex items-center justify-between text-left border-b transition-colors ${theme.panel} ${theme.chipHover} ${theme.focusRing}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Tag className={`w-4 h-4 ${themeAccentText}`} aria-hidden />
                  <div>
                    <h3 className="text-xs font-black">{genreItem.name}</h3>
                    <p className={`${textStyles.micro} ${theme.textMuted} mt-0.5`}>
                      {subgenresList.length} поджанров • {genreItem.count} книг(и)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`${textStyles.microBold} px-1.5 py-0.5 rounded-full bg-[var(--app-panel-soft)]`}>
                    ★ {genreItem.avgRating}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className={`w-4 h-4 ${theme.textMuted}`} aria-hidden />
                  ) : (
                    <ChevronRight className={`w-4 h-4 ${theme.textMuted}`} aria-hidden />
                  )}
                </div>
              </button>
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden divide-y bg-black/5 divide-[color:var(--app-border)]"
                  >
                    {subgenresList.map((sub) => (
                      <button
                        type="button"
                        key={sub.name}
                        onClick={() => onSelectSubgenre(genreItem.name, sub.name)}
                        className={`w-full px-4 py-2.5 pl-8 flex items-center justify-between text-left text-xs ${theme.rowPress} ${theme.focusRing}`}
                      >
                        <div>
                          <span className="font-bold">{sub.name}</span>
                          <span className={`${textStyles.micro} ${theme.textMuted} ml-1.5`}>({sub.count} кн.)</span>
                        </div>
                        <div className={`flex items-center gap-1.5 ${textStyles.microBold} ${theme.accentText}`}>
                          ★ {sub.avgRating}
                          <ChevronRight className={`w-3.5 h-3.5 ${theme.textMuted}/40`} aria-hidden />
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}
