import React from 'react';
import { createPortal } from 'react-dom';
import { theme } from '../lib/appTheme';
import { textStyles, radii } from './tokens';
import Button from './Button';

export interface SnackbarAction {
  label: string;
  onClick: () => void;
}

interface SnackbarItem {
  id: string;
  message: string;
  action?: SnackbarAction;
  variant?: 'default' | 'success' | 'error';
}

interface SnackbarContextValue {
  show: (message: string, action?: SnackbarAction, variant?: SnackbarItem['variant']) => void;
}

const SnackbarContext = React.createContext<SnackbarContextValue | null>(null);

export function useSnackbar(): SnackbarContextValue {
  const ctx = React.useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbar must be used within SnackbarProvider');
  return ctx;
}

const AUTO_HIDE_MS = 5000;

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = React.useState<SnackbarItem[]>([]);
  const timers = React.useRef<Map<string, number>>(new Map());

  const dismiss = React.useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setQueue((q) => q.filter((item) => item.id !== id));
  }, []);

  const show = React.useCallback(
    (message: string, action?: SnackbarAction, variant: SnackbarItem['variant'] = 'default') => {
      const id = `snack_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setQueue((q) => [...q.slice(-2), { id, message, action, variant }]);
      const timer = window.setTimeout(() => dismiss(id), action ? AUTO_HIDE_MS * 2 : AUTO_HIDE_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  React.useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const variantBg = (v: SnackbarItem['variant']) => {
    if (v === 'success') return 'bg-emerald-800/95 text-white';
    if (v === 'error') return 'bg-red-900/95 text-white';
    return `${theme.sheet} ${theme.text} border-[color:var(--app-border)]`;
  };

  return (
    <SnackbarContext.Provider value={{ show }}>
      {children}
      {queue.length > 0 &&
        createPortal(
          <div
            className="fixed left-0 right-0 z-[450] flex flex-col gap-2 px-4 pointer-events-none"
            style={{ bottom: 'max(5rem, calc(env(safe-area-inset-bottom) + 4.5rem))' }}
            aria-live="polite"
          >
            {queue.map((item) => (
              <div
                key={item.id}
                className={`pointer-events-auto flex items-center gap-3 px-4 py-3 ${radii.lg} border shadow-lg ${variantBg(item.variant)}`}
              >
                <p className={`${textStyles.body} flex-1 min-w-0`}>{item.message}</p>
                {item.action && (
                  <button
                    type="button"
                    className={`${textStyles.captionBold} shrink-0 uppercase tracking-wide ${theme.focusRing}`}
                    onClick={() => {
                      item.action!.onClick();
                      dismiss(item.id);
                    }}
                  >
                    {item.action.label}
                  </button>
                )}
                {!item.action && (
                  <Button variant="ghost" className="!min-h-8 !min-w-8 !px-2 shrink-0" onClick={() => dismiss(item.id)}>
                    ✕
                  </Button>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </SnackbarContext.Provider>
  );
}
