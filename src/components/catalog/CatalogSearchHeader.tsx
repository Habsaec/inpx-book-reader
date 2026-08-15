import React from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import {
  CatalogBookSort,
  CatalogEntitySort,
} from '../../lib/inpxClient';
import { theme } from '../../lib/appTheme';
import { textStyles, touchMin, radii, motion } from '../../ui/tokens';
import SegmentTabStrip from '../../ui/SegmentTabStrip';
import {
  CATALOG_BROWSE_ROOT,
  CATALOG_BROWSE_TAB_LABELS,
  CATALOG_SEARCH_TAB_LABELS,
  type CatalogSubTab as SubTab,
} from './catalogTypes';

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
  /** Author/series/genre book list — use book sorts, not name/count. */
  bookListActive?: boolean;
  /** When viewing a series book list, label series sort as volumes. */
  seriesBookList?: boolean;
  /** Committed search — show Книги/Авторы/Серии instead of browse sections. */
  searchMode?: boolean;
  /** Author/series/genre entity page — hide catalog tabs & list sort (standalone feel). */
  entityPage?: boolean;
}

export default function CatalogSearchHeader({
  subTab,
  onSubTabChange,
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
  bookListActive = false,
  seriesBookList = false,
  searchMode = false,
  entityPage = false,
}: CatalogSearchHeaderProps) {
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const historyRef = React.useRef<HTMLDivElement>(null);
  const blurTimerRef = React.useRef<number | null>(null);
  const [searchFocused, setSearchFocused] = React.useState(false);

  React.useEffect(() => {
    return () => {
      if (blurTimerRef.current != null) {
        window.clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  const showSort = isServerConnected;
  const useBookSort = bookListActive || subTab === 'books';
  const sectionTabs = searchMode ? CATALOG_SEARCH_TAB_LABELS : CATALOG_BROWSE_TAB_LABELS;

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

  if (entityPage) return null;

  return (
    <div className={`px-5 pt-4 pb-3 shrink-0 ${theme.bg}`}>
      <h1 className={`${textStyles.title} mb-4`}>Каталог</h1>

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
              if (blurTimerRef.current != null) {
                window.clearTimeout(blurTimerRef.current);
              }
              blurTimerRef.current = window.setTimeout(() => {
                blurTimerRef.current = null;
                const active = document.activeElement;
                if (active && historyRef.current?.contains(active)) return;
                setSearchFocused(false);
              }, 120);
            }}
            placeholder={searchPlaceholder}
            autoComplete="off"
            className={`w-full ${radii.button} pl-12 pr-20 py-3.5 text-sm ${theme.inputFocus} transition-[colors,box-shadow] duration-200 ease-out ${theme.input}`}
          />
          <Search
            className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${theme.textMuted} pointer-events-none`}
            aria-hidden
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {searchInput.length > 0 && (
              <button
                type="button"
                aria-label="Очистить поиск"
                onClick={() => {
                  onClearSearch();
                  searchInputRef.current?.focus();
                }}
                className={`${touchMin} inline-flex items-center justify-center rounded-full ${theme.textMuted} ${theme.focusRing} ${motion.press}`}
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            )}
            <button
              type="submit"
              aria-label="Искать"
              className={`${touchMin} inline-flex items-center justify-center ${radii.button} ${theme.accentBg} text-white ${theme.focusRing} ${motion.press}`}
            >
              <Search className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </form>

        {showSearchHistory && searchFocused && searchInput.trim().length === 0 && searchHistory.length > 0 && (
          <div
            ref={historyRef}
            className={`absolute left-0 right-0 top-full mt-2 z-30 border overflow-hidden ${radii.lg} ${theme.dropdown} shadow-lg`}
          >
            <div className={`px-4 py-2.5 flex items-center justify-between ${textStyles.caption} ${theme.textMuted}`}>
              <span>Недавние запросы</span>
              <button
                type="button"
                onClick={onClearSearchHistory}
                className={`${touchMin} inline-flex items-center px-2 ${textStyles.captionBold} ${theme.accentText} ${radii.button} ${theme.focusRing}`}
              >
                Очистить
              </button>
            </div>
            {searchHistory.map((query) => (
              <div key={query} className={`flex items-center border-t border-[color:var(--app-border)] ${theme.dropdownItem}`}>
                <button
                  type="button"
                  onClick={() => onSelectHistoryQuery(query)}
                  className={`flex-1 text-left px-4 min-h-12 flex items-center text-sm ${theme.focusRing}`}
                >
                  {query}
                </button>
                <button
                  type="button"
                  aria-label={`Удалить запрос ${query}`}
                  onClick={() => onRemoveHistoryQuery(query)}
                  className={`${touchMin} inline-flex items-center justify-center shrink-0 ${theme.chipButton} ${theme.focusRing}`}
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <SegmentTabStrip
        tabs={sectionTabs}
        active={
          searchMode
            ? subTab === 'genres'
              ? 'books'
              : subTab
            : subTab === 'books'
              ? CATALOG_BROWSE_ROOT
              : subTab
        }
        aria-label={searchMode ? 'Раздел поиска' : 'Раздел каталога'}
        onChange={(id) => {
          onClearDrilldown();
          if (searchMode) {
            onSubTabChange(id);
            return;
          }
          onSubTabChange(subTab === id ? CATALOG_BROWSE_ROOT : id);
        }}
      />

      {showSort && (
        <div className="mt-4">
          <label className={`flex items-center gap-2 ${radii.lg} ${theme.panel} px-4 py-2.5`}>
            <SlidersHorizontal className={`w-4 h-4 shrink-0 ${theme.textMuted}`} aria-hidden />
            <span className={`sr-only`}>Сортировка</span>
            <select
              value={useBookSort ? catalogSort : entitySort}
              onChange={(e) => {
                if (useBookSort) onCatalogSortChange(e.target.value as CatalogBookSort);
                else onEntitySortChange(e.target.value as CatalogEntitySort);
              }}
              className={`flex-1 min-w-0 border-0 bg-transparent text-sm font-medium ${theme.text} ${theme.inputFocus}`}
            >
              {useBookSort ? (
                <>
                  <option value="recent">Сначала новые</option>
                  <option value="title">По названию</option>
                  <option value="author">По автору</option>
                  <option value="series">{seriesBookList ? 'По томам' : 'По серии'}</option>
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
