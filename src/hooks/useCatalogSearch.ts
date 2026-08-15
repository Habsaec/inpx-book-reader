import React from 'react';
import type { ServerConfig } from '../types';
import type { CatalogSubTab } from '../components/catalog/catalogTypes';

/** Slightly longer than one keystroke burst — fewer /api/* hits under browse rate limit. */
const LIVE_FILTER_MS = 420;

/**
 * Search box state:
 * - `liveQuery` — debounced input for instant list filtering (browse + active search)
 * - `committedQuery` — set on Enter / history; opens search mode (Книги/Авторы/Серии)
 */
export function useCatalogSearch(
  _serverConfig: ServerConfig,
  _isServerConnected: boolean,
  _subTab: CatalogSubTab,
) {
  const [searchInput, setSearchInput] = React.useState('');
  const [committedQuery, setCommittedQuery] = React.useState('');
  const [liveQuery, setLiveQuery] = React.useState('');

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setLiveQuery(searchInput.trim());
    }, LIVE_FILTER_MS);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const submitSearch = React.useCallback((raw?: string) => {
    const next = (raw ?? searchInput).trim();
    setSearchInput(next);
    setLiveQuery(next);
    setCommittedQuery(next);
    return next;
  }, [searchInput]);

  const clearSearch = React.useCallback(() => {
    setSearchInput('');
    setLiveQuery('');
    setCommittedQuery('');
  }, []);

  return {
    searchInput,
    setSearchInput,
    liveQuery,
    committedQuery,
    debouncedSearch: committedQuery,
    submitSearch,
    clearSearch,
    isSearchActive: committedQuery.length > 0,
  };
}
