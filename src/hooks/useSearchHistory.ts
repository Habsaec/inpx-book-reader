import React from 'react';
import { APP_SETTING_KEYS, getAppSettingJson, setAppSettingJson } from '../lib/appSettings';

const MAX_ITEMS = 8;

function readHistory(): string[] {
  const parsed = getAppSettingJson<unknown>(APP_SETTING_KEYS.searchHistory, []);
  return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, MAX_ITEMS) : [];
}

export function useSearchHistory() {
  const [history, setHistory] = React.useState<string[]>(() => readHistory());

  const addQuery = React.useCallback((query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setHistory((prev) => {
      const next = [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, MAX_ITEMS);
      setAppSettingJson(APP_SETTING_KEYS.searchHistory, next);
      return next;
    });
  }, []);

  const removeQuery = React.useCallback((query: string) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item !== query);
      setAppSettingJson(APP_SETTING_KEYS.searchHistory, next);
      return next;
    });
  }, []);

  const clearHistory = React.useCallback(() => {
    setAppSettingJson(APP_SETTING_KEYS.searchHistory, []);
    setHistory([]);
  }, []);

  return { history, addQuery, removeQuery, clearHistory };
}
