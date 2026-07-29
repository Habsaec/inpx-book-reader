import React from 'react';
import type { ServerConfig } from '../types';
import type { CatalogSubTab } from '../components/catalog/catalogTypes';

/**
 * Поиск запускается только явно: Enter / кнопка лупы / выбор из истории.
 */
export function useCatalogSearch(
  _serverConfig: ServerConfig,
  _isServerConnected: boolean,
  _subTab: CatalogSubTab,
) {
  const [searchInput, setSearchInput] = React.useState('');
  const [committedQuery, setCommittedQuery] = React.useState('');

  const submitSearch = React.useCallback((raw?: string) => {
    const next = (raw ?? searchInput).trim();
    setSearchInput(next);
    setCommittedQuery(next);
    return next;
  }, [searchInput]);

  const clearSearch = React.useCallback(() => {
    setSearchInput('');
    setCommittedQuery('');
  }, []);

  return {
    searchInput,
    setSearchInput,
    debouncedSearch: committedQuery,
    submitSearch,
    clearSearch,
    isSearchActive: committedQuery.length > 0,
  };
}
