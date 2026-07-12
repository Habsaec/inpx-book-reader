import React from 'react';
import { fetchSearchSuggestions, type SearchSuggestions } from '../lib/inpxClient';
import type { ServerConfig } from '../types';
import type { CatalogSubTab } from '../components/catalog/catalogTypes';

export function useCatalogSearch(
  serverConfig: ServerConfig,
  isServerConnected: boolean,
  subTab: CatalogSubTab,
) {
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<SearchSuggestions | null>(null);
  const [suggestActiveIdx, setSuggestActiveIdx] = React.useState(-1);
  const suggestRequestRef = React.useRef(0);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  React.useEffect(() => {
    if (!isServerConnected || subTab === 'genres' || searchInput.trim().length < 2) {
      setSuggestions(null);
      setSuggestActiveIdx(-1);
      return;
    }
    const reqId = ++suggestRequestRef.current;
    const timer = setTimeout(async () => {
      try {
        const data = await fetchSearchSuggestions(serverConfig, searchInput.trim());
        if (reqId === suggestRequestRef.current) {
          setSuggestions(data);
          setSuggestActiveIdx(-1);
        }
      } catch {
        if (reqId === suggestRequestRef.current) {
          setSuggestions(null);
          setSuggestActiveIdx(-1);
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput, subTab, isServerConnected, serverConfig.url, serverConfig.username, serverConfig.password, serverConfig.deviceToken]);

  React.useEffect(() => {
    setSuggestions(null);
    setSuggestActiveIdx(-1);
  }, [debouncedSearch, subTab]);

  const dismissSuggestions = React.useCallback(() => {
    setSuggestions(null);
    setSuggestActiveIdx(-1);
  }, []);

  return {
    searchInput,
    setSearchInput,
    debouncedSearch,
    suggestions,
    suggestActiveIdx,
    setSuggestActiveIdx,
    dismissSuggestions,
    isSearchActive: debouncedSearch.length > 0,
  };
}
