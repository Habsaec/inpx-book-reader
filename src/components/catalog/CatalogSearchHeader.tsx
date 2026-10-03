import React from 'react';
import { createPortal } from 'react-dom';
import {
  CatalogEntitySort,
} from '../../lib/inpxClient';
import SegmentTabStrip from '../../ui/SegmentTabStrip';
import BookSortBar from './BookSortBar';
import type { ServerConfig } from '../../types';
import { usePageTitle } from '../../ui/pageTitle';
import {
  CATALOG_SEARCH_TAB_LABELS,
  type CatalogSubTab as SubTab,
} from './catalogTypes';

export type CatalogHeaderMode = 'landing' | 'browse' | 'search' | 'entity';

export const CatalogToolSlot = React.createContext<HTMLDivElement | null>(null);

interface CatalogSearchHeaderProps {
  mode: CatalogHeaderMode;
  subTab: SubTab;
  onSubTabChange: (tab: SubTab) => void;
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
  entitySort: CatalogEntitySort;
  onEntitySortChange: (sort: CatalogEntitySort) => void;
  /** Browse section title (Авторы / Серии / Жанры). */
  browseTitle?: string;
  onBrowseBack?: () => void;
  entityTitle?: string;
  entityBackLabel?: string;
  onEntityBack?: () => void;
  serverConfig?: ServerConfig;
  onPickAuthor?: (name: string) => void;
  onPickSeries?: (name: string) => void;
  onPickBook?: (book: { id: string; title: string; authors?: string; authorsDisplay?: string }) => void;
  /** False while this tab is hidden, so its title does not cover the visible screen. */
  active?: boolean;
}

export default function CatalogSearchHeader({
  mode,
  subTab,
  onSubTabChange,
  isServerConnected,
  onClearSearch,
  entitySort,
  onEntitySortChange,
  browseTitle,
  onBrowseBack,
  entityTitle,
  onEntityBack,
  active = true,
}: CatalogSearchHeaderProps) {
  const drillTitle = mode === 'entity'
    ? (entityTitle || 'Каталог')
    : mode === 'browse'
      ? (browseTitle || 'Каталог')
      : mode === 'search'
        ? 'Поиск'
        : '';
  const onBack = mode === 'entity'
    ? onEntityBack
    : mode === 'browse'
      ? onBrowseBack
      : mode === 'search'
        ? onClearSearch
        : undefined;

  usePageTitle(drillTitle, onBack, active && mode !== 'landing');
  const slot = React.useContext(CatalogToolSlot);

  const showSort =
    (mode === 'browse' || mode === 'search') &&
    isServerConnected &&
    (subTab === 'authors' || subTab === 'series');
  if (mode !== 'search' && !showSort) return null;

  const bar = (
    <>
      {mode === 'search' ? (
        <SegmentTabStrip
          tabs={CATALOG_SEARCH_TAB_LABELS}
          active={subTab === 'genres' ? 'books' : subTab}
          aria-label="Раздел поиска"
          onChange={onSubTabChange}
        />
      ) : null}
      {showSort ? (
        <div className="flex justify-end">
          <BookSortBar
            value={entitySort}
            options={[
              { id: 'count', label: 'По количеству' },
              { id: 'name', label: 'По названию' },
            ]}
            onChange={(id) => onEntitySortChange(id as CatalogEntitySort)}
            ariaLabel="Сортировка списка"
          />
        </div>
      ) : null}
    </>
  );
  if (slot) return createPortal(bar, slot);
  return <div className="px-5 py-1">{bar}</div>;
}
