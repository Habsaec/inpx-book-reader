import React from 'react';
import { Search, X, ArrowLeft } from 'lucide-react';
import {
  CatalogBookSort,
  CatalogEntitySort,
} from '../../lib/inpxClient';
import { theme } from '../../lib/appTheme';
import { textStyles, touchMin } from '../../ui/tokens';
import type { CatalogSubTab as SubTab } from './catalogTypes';

interface CatalogSearchHeaderProps {
  subTab: SubTab;
  onSubTabChange: (tab: SubTab) => void;
  onClearDrilldown: () => void;
  isServerConnected: boolean;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onSubmitSearch: () => void;
  onClearSearch: () => void;
  searchPlaceholder: string;
  showSearchHistory: boolean;
  searchHistory: string[];
  onSelectHistoryQuery: (query: string) => void;
  onRemoveHistoryQuery: (query: string) => void;
  onClearSearchHistory: () => void;
  catalogSort: CatalogBookSort;
  entitySort: CatalogEntitySort;
  onCatalogSortChange: (sort: CatalogBookSort) => void;
  onEntitySortChange: (sort: CatalogEntitySort) => void;
  searchField: Exclude<SubTab, 'genres'>;
  onSearchFieldChange: (field: Exclude<SubTab, 'genres'>) => void;
  browseModeActive?: boolean;
  onLeaveBrowse?: () => void;
}

export default function CatalogSearchHeader({
  subTab,
  onClearDrilldown,
  isServerConnected,
  searchInput,
  onSearchInputChange,
  onSubmitSearch,
  onClearSearch,
  searchPlaceholder,
  showSearchHistory,
  searchHistory,
  onSelectHistoryQuery,
  onRemoveHistoryQuery,
  onClearSearchHistory,
  catalogSort,
  entitySort,
  onCatalogSortChange,
  onEntitySortChange,
  browseModeActive = false,
  onLeaveBrowse,
}: CatalogSearchHeaderProps) {
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const historyRef = React.useRef<HTMLDivElement>(null);
  const [searchFocused, setSearchFocused] = React.useState(false);

  const showSort = isServerConnected && (subTab === 'books' || browseModeActive);
  const browseLabel =
    subTab === 'authors'
      ? 'Авторы'
      : subTab === 'series'
        ? 'Серии'
        : subTab === 'genres'
          ? 'Жанры'
          : subTab === 'books'
            ? 'Книги'
            : null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmitSearch();
      searchInputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setSearchFocused(false);
      searchInputRef.current?.blur();
    }
  };

  return (
    <div className={`px-4 pt-3 pb-2 shrink-0 ${theme.bg}`}>
      <div className="relative">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitSearch();
            searchInputRef.current?.blur();
          }}
        >
          <label htmlFor="catalog-search" className="sr-only">Поиск книг, авторов и серий</label>
          <input
            id="catalog-search"
            ref={searchInputRef}
            type="search"
            enterKeyHint="search"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              window.setTimeout(() => {
                const active = document.activeElement;
                if (active && historyRef.current?.contains(active)) return;
                setSearchFocused(false);
              }, 120);
            }}
            placeholder={searchPlaceholder}
            autoComplete="off"
            className={`w-full border rounded-xl pl-4 pr-20 py-3 text-sm ${theme.inputFocus} transition-colors ${theme.input}`}
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {searchInput.length > 0 && (
              <button
                type="button"
                aria-label="Очистить поиск"
                onClick={() => {
                  onClearSearch();
                  searchInputRef.current?.focus();
                }}
                className={`${touchMin} inline-flex items-center justify-center rounded-full ${theme.textMuted} ${theme.focusRing}`}
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            )}
            <button
              type="submit"
              aria-label="Искать"
              className={`${touchMin} inline-flex items-center justify-center rounded-full ${theme.accentText} ${theme.focusRing}`}
            >
              <Search className="w-5 h-5" aria-hidden />
            </button>
          </div>
        </form>

        {showSearchHistory && searchFocused && searchInput.trim().length === 0 && searchHistory.length > 0 && (
          <div
            ref={historyRef}
            className={`absolute left-0 right-0 top-full mt-1 z-30 border rounded-xl overflow-hidden ${theme.dropdown}`}
          >
            <div className={`px-3 py-1.5 flex items-center justify-between ${textStyles.caption} ${theme.textMuted}`}>
              <span>Недавние запросы</span>
              <button type="button" onClick={onClearSearchHistory} className={`${touchMin} inline-flex items-center px-2 ${textStyles.caption} ${theme.accentText} rounded-lg ${theme.focusRing}`}>
                Очистить
              </button>
            </div>
            {searchHistory.map((query) => (
              <div key={query} className={`flex items-center border-b border-[color:var(--app-border)] ${theme.dropdownItem}`}>
                <button type="button" onClick={() => onSelectHistoryQuery(query)} className={`flex-1 text-left px-3 min-h-12 flex items-center text-sm ${theme.focusRing}`}>
                  {query}
                </button>
                <button type="button" aria-label={`Удалить запрос ${query}`} onClick={() => onRemoveHistoryQuery(query)} className={`${touchMin} inline-flex items-center justify-center shrink-0 ${theme.chipButton} ${theme.focusRing}`}>
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {browseModeActive && browseLabel && onLeaveBrowse && (
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => {
              onClearDrilldown();
              onLeaveBrowse();
            }}
            className={`inline-flex items-center gap-1.5 min-h-10 px-2 rounded-lg ${textStyles.bodyBold} ${theme.accentText} ${theme.focusRing}`}
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Назад
          </button>
          <span className={`${textStyles.bodyBold} ${theme.text}`}>{browseLabel}</span>
        </div>
      )}

      {showSort && (
        <div className="mt-3">
          <label className={`block ${textStyles.caption} ${theme.textMuted}`}>
            <span className="sr-only">Сортировка</span>
            <select
              value={subTab === 'books' ? catalogSort : entitySort}
              onChange={(e) => {
                if (subTab === 'books') onCatalogSortChange(e.target.value as CatalogBookSort);
                else onEntitySortChange(e.target.value as CatalogEntitySort);
              }}
              className={`w-full border rounded-xl px-3 py-2 text-sm ${theme.inputFocus} ${theme.input}`}
            >
              {subTab === 'books' ? (
                <>
                  <option value="recent">Сначала новые</option>
                  <option value="title">По названию</option>
                  <option value="author">По автору</option>
                  <option value="series">По серии</option>
                  <option value="rating">По рейтингу</option>
                </>
              ) : subTab === 'genres' ? (
                <>
                  <option value="count">По количеству</option>
                  <option value="name">По названию</option>
                </>
              ) : (
                <>
                  <option value="count">По количеству книг</option>
                  <option value="name">По названию</option>
                </>
              )}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
