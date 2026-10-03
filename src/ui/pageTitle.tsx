import React from 'react';

export type PageTitleEntry = {
  title: string;
  onBack: (() => void) | null;
};

type Api = {
  push: (entry: PageTitleEntry) => number;
  pop: (id: number) => void;
  top: PageTitleEntry | null;
  subscribe: (listener: () => void) => () => void;
};

const PageTitleContext = React.createContext<Api | null>(null);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const stack = React.useRef<{ id: number; entry: PageTitleEntry }[]>([]);
  const seq = React.useRef(0);
  const listeners = React.useRef(new Set<() => void>());

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
    };
  }, []);

  return <PageTitleContext.Provider value={api}>{children}</PageTitleContext.Provider>;
}

/** Puts this screen's title in the shell bar. `onBack` may change every render. */
export function usePageTitle(title: string, onBack?: () => void, enabled = true) {
  const api = React.useContext(PageTitleContext);
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;

  React.useLayoutEffect(() => {
    if (!api || !enabled || !title) return;
    const id = api.push({
      title,
      onBack: () => onBackRef.current?.(),
    });
    return () => api.pop(id);
  }, [api, enabled, title]);
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
