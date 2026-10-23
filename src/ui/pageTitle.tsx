import React from 'react';

export type PageTitleEntry = {
  title: string;
  onBack: (() => void) | null;
  /** Query shown by this screen — prefills the shell search when it opens. */
  searchQuery?: string;
};

type Api = {
  push: (entry: PageTitleEntry) => number;
  pop: (id: number) => void;
  top: PageTitleEntry | null;
  subscribe: (listener: () => void) => () => void;
  /** Shell registers how to open its search field; screens call `openSearch`. */
  setSearchOpener: (opener: (() => void) | null) => void;
  openSearch: () => void;
};

const PageTitleContext = React.createContext<Api | null>(null);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const stack = React.useRef<{ id: number; entry: PageTitleEntry }[]>([]);
  const seq = React.useRef(0);
  const listeners = React.useRef(new Set<() => void>());
  const searchOpener = React.useRef<(() => void) | null>(null);

  const api = React.useMemo<Api>(() => {
    const notify = () => {
      listeners.current.forEach((listener) => listener());
    };
    return {
      push(entry) {
        const id = ++seq.current;
        stack.current = [...stack.current, { id, entry }];
        notify();
        return id;
      },
      pop(id) {
        stack.current = stack.current.filter((item) => item.id !== id);
        notify();
      },
      get top() {
        const items = stack.current;
        return items.length ? items[items.length - 1].entry : null;
      },
      subscribe(listener) {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
      setSearchOpener(opener) {
        searchOpener.current = opener;
      },
      openSearch() {
        searchOpener.current?.();
      },
    };
  }, []);

  return <PageTitleContext.Provider value={api}>{children}</PageTitleContext.Provider>;
}

/** Puts this screen's title in the shell bar. `onBack` may change every render. */
export function usePageTitle(
  title: string,
  onBack?: () => void,
  enabled = true,
  searchQuery?: string,
) {
  const api = React.useContext(PageTitleContext);
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;

  React.useLayoutEffect(() => {
    if (!api || !enabled || !title) return;
    const id = api.push({
      title,
      onBack: () => onBackRef.current?.(),
      searchQuery,
    });
    return () => api.pop(id);
  }, [api, enabled, title, searchQuery]);
}

export function usePageTitleTop(): PageTitleEntry | null {
  const api = React.useContext(PageTitleContext);
  const [top, setTop] = React.useState<PageTitleEntry | null>(null);
  React.useEffect(() => {
    if (!api) return;
    const read = () => setTop(api.top);
    read();
    return api.subscribe(read);
  }, [api]);
  return top;
}

/** Opens the shell search field (prefilled with the screen's `searchQuery`). */
export function useOpenShellSearch(): () => void {
  const api = React.useContext(PageTitleContext);
  return React.useCallback(() => api?.openSearch(), [api]);
}

/** Shell side of `useOpenShellSearch`. */
export function useShellSearchOpener(opener: () => void) {
  const api = React.useContext(PageTitleContext);
  const ref = React.useRef(opener);
  ref.current = opener;
  React.useEffect(() => {
    if (!api) return;
    api.setSearchOpener(() => ref.current());
    return () => api.setSearchOpener(null);
  }, [api]);
}
