import React from 'react';
import {
  Search,
  BookMarked,
  User,
  Layers3,
  Tag,
  X,
} from 'lucide-react';
import {
  CatalogBookSort,
  CatalogEntitySort,
  displayAuthorName,
  formatAuthorsFromItem,
  SearchSuggestions,
} from '../../lib/inpxClient';
import { formatSuggestCount } from '../../lib/catalogBookPool';
import { theme } from '../../lib/appTheme';
import { textStyles, motion, touchMin } from '../../ui/tokens';
import type { CatalogSubTab as SubTab } from './catalogTypes';

export type SuggestFlatItem =
  | { kind: 'book'; key: string; book: SearchSuggestions['books'][0] }
  | { kind: 'author'; key: string; author: SearchSuggestions['authors'][0] }
  | { kind: 'series'; key: string; series: SearchSuggestions['series'][0] };

interface CatalogSearchHeaderProps {
  subTab: SubTab;
  onSubTabChange: (tab: SubTab) => void;
  onClearDrilldown: () => void;
  isServerConnected: boolean;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  searchPlaceholder: string;
  showSuggestions: boolean;
  showSearchHistory: boolean;
  suggestions: SearchSuggestions | null;
  suggestFlatItems: SuggestFlatItem[];
  suggestActiveIdx: number;
  onActivateSuggest: (idx: number) => void;
  onDismissSuggestions: () => void;
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
}

export default function CatalogSearchHeader({
  subTab,
  onSubTabChange,
  onClearDrilldown,
  isServerConnected,
  searchInput,
  onSearchInputChange,
  onSearchKeyDown,
  searchPlaceholder,
  showSuggestions,
  showSearchHistory,
  suggestions,
  suggestFlatItems,
  suggestActiveIdx,
  onActivateSuggest,
  onDismissSuggestions,
  searchHistory,
  onSelectHistoryQuery,
  onRemoveHistoryQuery,
  onClearSearchHistory,
  catalogSort,
  entitySort,
  onCatalogSortChange,
  onEntitySortChange,
  searchField,
  onSearchFieldChange,
}: CatalogSearchHeaderProps) {
  const suggestDropdownRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = React.useState(false);

  React.useEffect(() => {
    if (suggestActiveIdx < 0 || !suggestDropdownRef.current) return;
    const el = suggestDropdownRef.current.querySelector(`[data-suggest-idx="${suggestActiveIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [suggestActiveIdx]);

  const themeHeader = theme.header;
  const themeTextMuted = theme.textMuted;
  const themeInput = theme.input;

  return (
    <div className={`px-4 pt-4 pb-2 shrink-0 border-b landscape:max-[500px]:px-2 landscape:max-[500px]:pt-2 landscape:max-[500px]:pb-1 ${themeHeader}`}>
      <div className="relative">
        <label htmlFor="catalog-search" className="sr-only">Поиск по каталогу</label>
        <input
          id="catalog-search"
          ref={searchInputRef}
          type="search"
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onKeyDown={onSearchKeyDown}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setSearchFocused(false);
              const active = document.activeElement;
              if (active && suggestDropdownRef.current?.contains(active)) return;
              onDismissSuggestions();
            }, 120);
          }}
          placeholder={searchPlaceholder}
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
          aria-controls={showSuggestions ? 'catalog-suggest-listbox' : undefined}
          className={`w-full border rounded-xl pl-10 pr-4 py-2.5 landscape:max-[500px]:py-1.5 text-xs ${theme.inputFocus} transition-colors ${themeInput}`}
        />
        <Search className={`w-4 h-4 ${theme.textMuted} absolute left-3.5 top-3 pointer-events-none`} aria-hidden />

        {showSearchHistory && searchFocused && searchInput.trim().length === 0 && searchHistory.length > 0 && (
          <div className={`absolute left-0 right-0 top-full mt-1 z-30 border rounded-xl shadow-lg overflow-hidden ${theme.dropdown}`} data-swipe-lock>
            <div className={`px-3 py-1.5 flex items-center justify-between ${textStyles.labelCaps} ${theme.textMuted} bg-[var(--app-panel-soft)]`}>
              <span>Недавние запросы</span>
              <button type="button" onClick={onClearSearchHistory} className={`${touchMin} inline-flex items-center px-2 ${textStyles.microBold} ${theme.accentText} rounded-lg ${theme.chipButton} ${theme.focusRing}`}>
                Очистить
              </button>
            </div>
            {searchHistory.map((query) => (
              <div key={query} className={`flex items-center border-b border-[color:var(--app-border)] ${theme.dropdownItem}`}>
                <button type="button" onClick={() => onSelectHistoryQuery(query)} className={`flex-1 text-left px-3 min-h-12 flex items-center text-xs ${theme.focusRing}`}>
                  {query}
                </button>
                <button type="button" aria-label={`Удалить запрос ${query}`} onClick={() => onRemoveHistoryQuery(query)} className={`${touchMin} inline-flex items-center justify-center shrink-0 ${theme.chipButton} ${theme.focusRing}`}>
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}

        {showSuggestions && suggestions && (
          <div
            ref={suggestDropdownRef}
            id="catalog-suggest-listbox"
            className={`absolute left-0 right-0 top-full mt-1 z-30 border rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto ${theme.dropdown}`}
            data-swipe-lock
            role="listbox"
          >
            {suggestions.books.length > 0 && (
              <div className={`px-3 py-1.5 ${textStyles.labelCaps} ${themeTextMuted} bg-[var(--app-panel-soft)]`}>
                Книги
              </div>
            )}
            {suggestions.books.slice(0, 5).map((b) => {
              const flatIdx = suggestFlatItems.findIndex((it) => it.key === `b-${b.id}`);
              return (
                <button
                  key={`b-${b.id}`}
                  type="button"
                  data-suggest-idx={flatIdx}
                  role="option"
                  aria-selected={flatIdx === suggestActiveIdx}
                  onClick={() => onActivateSuggest(flatIdx)}
                  className={`w-full text-left px-3 py-2 text-xs border-b border-[color:var(--app-border)] ${theme.dropdownItem} ${theme.focusRing} ${flatIdx === suggestActiveIdx ? theme.accentActive : ''}`}
                >
                  <span className="font-bold block truncate">{b.title}</span>
                  <span className={`block ${textStyles.micro} truncate ${themeTextMuted}`}>{formatAuthorsFromItem(b)}</span>
                </button>
              );
            })}
            {suggestions.authors.length > 0 && (
              <div className={`px-3 py-1.5 ${textStyles.labelCaps} ${themeTextMuted} bg-[var(--app-panel-soft)]`}>
                Авторы
              </div>
            )}
            {suggestions.authors.slice(0, 5).map((a) => {
              const flatIdx = suggestFlatItems.findIndex((it) => it.key === `a-${a.name}`);
              const countLabel = formatSuggestCount(a.bookCount);
              return (
                <button
                  key={`a-${a.name}`}
                  type="button"
                  data-suggest-idx={flatIdx}
                  role="option"
                  aria-selected={flatIdx === suggestActiveIdx}
                  onClick={() => onActivateSuggest(flatIdx)}
                  className={`w-full text-left px-3 py-2 text-xs border-b border-[color:var(--app-border)] ${theme.dropdownItem} ${theme.focusRing} ${flatIdx === suggestActiveIdx ? theme.accentActive : ''}`}
                >
                  <span className="font-bold block truncate">{displayAuthorName(a.name, a.displayName)}</span>
                  {countLabel ? <span className={`block ${textStyles.micro} ${themeTextMuted}`}>{countLabel}</span> : null}
                </button>
              );
            })}
            {suggestions.series.length > 0 && (
              <div className={`px-3 py-1.5 ${textStyles.labelCaps} ${themeTextMuted} bg-[var(--app-panel-soft)]`}>
                Серии
              </div>
            )}
            {suggestions.series.slice(0, 5).map((s) => {
              const flatIdx = suggestFlatItems.findIndex((it) => it.key === `s-${s.name}`);
              const countLabel = formatSuggestCount(s.bookCount);
              return (
                <button
                  key={`s-${s.name}`}
                  type="button"
                  data-suggest-idx={flatIdx}
                  role="option"
                  aria-selected={flatIdx === suggestActiveIdx}
                  onClick={() => onActivateSuggest(flatIdx)}
                  className={`w-full text-left px-3 py-2 text-xs border-b last:border-0 border-[color:var(--app-border)] ${theme.dropdownItem} ${flatIdx === suggestActiveIdx ? theme.accentActive : ''}`}
                >
                  <span className="font-bold block truncate">{s.displayName || s.name}</span>
                  {countLabel ? <span className={`block ${textStyles.micro} ${themeTextMuted}`}>{countLabel}</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isServerConnected && (
        <div className="flex gap-2 mt-2 landscape:max-[500px]:mt-1 landscape:max-[500px]:gap-1.5">
          {subTab !== 'genres' && (
            <label className={`flex-1 ${textStyles.micro} ${themeTextMuted}`}>
              <span className="block font-bold mb-0.5 landscape:max-[500px]:sr-only">Искать в</span>
              <select
                value={searchField}
                onChange={(e) => onSearchFieldChange(e.target.value as Exclude<SubTab, 'genres'>)}
                className={`w-full border rounded-lg px-2 py-1.5 text-xs ${theme.inputFocus} ${themeInput}`}
              >
                <option value="books">Книги</option>
                <option value="authors">Авторы</option>
                <option value="series">Серии</option>
              </select>
            </label>
          )}
          <label className={`flex-1 ${textStyles.micro} ${themeTextMuted}`}>
            <span className="block font-bold mb-0.5 landscape:max-[500px]:sr-only">Сортировка</span>
            <select
              value={subTab === 'books' ? catalogSort : entitySort}
              onChange={(e) => {
                if (subTab === 'books') onCatalogSortChange(e.target.value as CatalogBookSort);
                else onEntitySortChange(e.target.value as CatalogEntitySort);
              }}
              className={`w-full border rounded-lg px-2 py-1.5 text-xs ${theme.inputFocus} ${themeInput}`}
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

      <div className="flex mt-3 pt-1 landscape:max-[500px]:mt-1 landscape:max-[500px]:pt-0" role="tablist" aria-label="Раздел каталога">
        {(
          [
            { id: 'books' as const, label: 'Книги', icon: BookMarked },
            { id: 'authors' as const, label: 'Авторы', icon: User },
            { id: 'series' as const, label: 'Серии', icon: Layers3 },
            { id: 'genres' as const, label: 'Жанры', icon: Tag },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                onSubTabChange(tab.id);
                onClearDrilldown();
              }}
              className={`flex-1 min-h-12 py-2 landscape:max-[500px]:py-1.5 flex flex-col items-center justify-center gap-0.5 ${textStyles.labelBold} border-b-2 ${motion.colors} ${motion.press} ${theme.focusRing} ${
                isActive ? theme.accentBorder : `border-transparent ${theme.textMuted} hover:text-[var(--app-link)]`
              }`}
            >
              <Icon className="w-4 h-4 landscape:max-[500px]:w-3.5 landscape:max-[500px]:h-3.5" aria-hidden />
              <span className="landscape:max-[500px]:hidden">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
