import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronDown, Tag, Library, User, Inbox } from 'lucide-react';
import { ServerConfig } from '../../types';
import { theme } from '../../lib/appTheme';
import type { StorageDirectory } from '../../lib/storageDirectory';
import LiteEntityRow from '../LiteEntityRow';
import CatalogPagination from './CatalogPagination';
import type { LocalGenreAgg } from '../../lib/catalogAggregations';
import type { AuthorSeriesSort } from '../../lib/catalogAggregations';
import type { CatalogSubTab } from './catalogTypes';
import { textStyles } from '../../ui/tokens';
import EmptyState from '../../ui/EmptyState';

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
  storageDirectory?: StorageDirectory | null;
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
    <div className="flex items-center justify-between gap-2 py-1">
      <span className={`${textStyles.caption} ${theme.textMuted}`}>{label}</span>
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
            className={`min-h-12 px-2.5 rounded-full transition-colors ${textStyles.caption} cursor-pointer ${
              sortBy === btn.id ? `${theme.accentText} font-semibold` : theme.textMuted
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
  storageDirectory,
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
  const themeAccentText = theme.accentText;

  if (subTab === 'authors' && !selectedAuthor) {
    return (
      <div className="space-y-3">
        {!isServerBrowse && (
          <EntitySortBar label="Сортировка авторов:" sortBy={authorSortBy} onChange={onAuthorSortChange} />
        )}
        {authors.length === 0 ? (
          <EmptyState icon={User} title="Список авторов пуст" description="Попробуйте обновить каталог или изменить поиск" />
        ) : (
          <>
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
                    storageDirectory={storageDirectory}
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
                        <h3 className={`${textStyles.bodyBold} truncate`}>{author.name}</h3>
                        <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>
                          {author.bookCount} кн.
                        </p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 shrink-0 ${textStyles.caption} ${theme.textMuted}`}>
                      ★ {author.avgRating}
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden />
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
          </>
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
        {series.length === 0 ? (
          <EmptyState icon={Library} title="Список серий пуст" description="Попробуйте обновить каталог или изменить поиск" />
        ) : (
          <>
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
                    <h3 className={`${textStyles.bodyBold} truncate`}>{item.name}</h3>
                    <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>
                      {item.bookCount} кн.
                    </p>
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 shrink-0 ${textStyles.caption} ${theme.textMuted}`}>
                  ★ {item.avgRating}
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden />
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
          </>
        )}
      </div>
    );
  }

  if (subTab === 'genres' && !selectedSubgenre) {
    return (
      <div className="space-y-2.5">
        {genres.length === 0 ? (
          <EmptyState icon={Inbox} title="Список жанров пуст" description="Попробуйте обновить каталог" />
        ) : (
          genres.map((genreItem) => {
          const isExpanded = !!expandedGenres[genreItem.name];
          const subgenresList = Object.entries(genreItem.subgenres);
          return (
            <div key={genreItem.name} className={`border-b last:border-b-0 ${theme.divider}`}>
              <button
                type="button"
                onClick={() => onToggleGenreExpand(genreItem.name)}
                aria-expanded={isExpanded}
                className={`w-full py-3 flex items-center justify-between text-left ${theme.rowPress} ${theme.focusRing}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Tag className={`w-4 h-4 ${themeAccentText}`} aria-hidden />
                  <div>
                    <h3 className={`${textStyles.bodyBold}`}>{genreItem.name}</h3>
                    <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>
                      {genreItem.count} кн. · {subgenresList.length} поджанров
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
                    {subgenresList.map(([genreCode, sub]) => (
                      <button
                        type="button"
                        key={genreCode}
                        onClick={() => onSelectSubgenre(genreItem.name, genreCode)}
                        className={`w-full min-h-12 px-4 py-3 pl-8 flex items-center justify-between text-left text-xs ${theme.rowPress} ${theme.focusRing}`}
                      >
                        <div>
                          <span className={textStyles.bodyBold}>{sub.name}</span>
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
        })
        )}
      </div>
    );
  }

  return null;
}
