import React from 'react';
import { APP_SETTING_KEYS, getAppSettingRaw, setAppSettingRaw } from '../lib/appSettings';
import { resolveCatalogViewMode, type BooksViewScope, type CatalogViewMode } from '../lib/catalogViewMode';

export type { BooksViewScope };

type Listener = (mode: CatalogViewMode) => void;

const listenersByScope: Record<BooksViewScope, Set<Listener>> = {
  home: new Set(),
  books: new Set(),
};

function settingKey(scope: BooksViewScope): string {
  return scope === 'home' ? APP_SETTING_KEYS.homeView : APP_SETTING_KEYS.catalogView;
}

function readResolved(scope: BooksViewScope): CatalogViewMode {
  return resolveCatalogViewMode(getAppSettingRaw(settingKey(scope)), scope);
}

export function useCatalogViewMode(scope: BooksViewScope = 'books', libraryReady = true) {
  const [viewMode, setViewModeState] = React.useState<CatalogViewMode>(() => readResolved(scope));

  React.useEffect(() => {
    if (!libraryReady) return;
    setViewModeState(readResolved(scope));
  }, [libraryReady, scope]);

  React.useEffect(() => {
    const onChange: Listener = (mode) => setViewModeState(mode);
    listenersByScope[scope].add(onChange);
    return () => {
      listenersByScope[scope].delete(onChange);
    };
  }, [scope]);

  const setViewMode = React.useCallback(
    (next: CatalogViewMode) => {
      const mode: CatalogViewMode = next === 'list' ? 'list' : 'grid';
      setAppSettingRaw(settingKey(scope), mode);
      setViewModeState(mode);
      for (const listener of listenersByScope[scope]) {
        listener(mode);
      }
    },
    [scope],
  );

  return { viewMode, setViewMode };
}
