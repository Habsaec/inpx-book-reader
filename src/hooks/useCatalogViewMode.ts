import React from 'react';
import { APP_SETTING_KEYS, getAppSettingRaw, setAppSettingRaw } from '../lib/appSettings';
import {
  defaultCatalogViewMode,
  isEinkDocumentActive,
  resolveCatalogViewMode,
  type CatalogViewMode,
} from '../lib/catalogViewMode';

/** `home` — полки на главной; `books` — каталог, мои книги, «Показать всё». */
export type BooksViewScope = 'home' | 'books';

type Listener = (mode: CatalogViewMode) => void;

const listenersByScope: Record<BooksViewScope, Set<Listener>> = {
  home: new Set(),
  books: new Set(),
};

function settingKey(scope: BooksViewScope): string {
  return scope === 'home' ? APP_SETTING_KEYS.homeView : APP_SETTING_KEYS.catalogView;
}

function readStoredRaw(scope: BooksViewScope): string | null {
  return getAppSettingRaw(settingKey(scope));
}

function readResolved(scope: BooksViewScope): CatalogViewMode {
  return resolveCatalogViewMode(readStoredRaw(scope));
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

  // Unset preference follows e-ink on/off (dataset applied by useEinkMode).
  React.useEffect(() => {
    const el = document.documentElement;
    const sync = () => {
      if (readStoredRaw(scope) != null) return;
      const next = defaultCatalogViewMode(isEinkDocumentActive());
      setViewModeState(next);
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-eink'] });
    return () => obs.disconnect();
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
