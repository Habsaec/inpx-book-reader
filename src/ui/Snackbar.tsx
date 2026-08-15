import React from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, radii, touchMin, motion, elevation } from './tokens';

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
      setQueue((q) => [...q.filter((item) => item.message !== message).slice(-2), { id, message, action, variant }]);
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
    if (v === 'success') {
      return 'bg-[color-mix(in_srgb,var(--app-success)_88%,var(--app-surface))] text-[var(--app-success)] border-[color-mix(in_srgb,var(--app-success)_35%,transparent)]';
    }
    if (v === 'error') {
      return 'bg-[color-mix(in_srgb,var(--app-danger)_88%,var(--app-surface))] text-[var(--app-danger)] border-[color-mix(in_srgb,var(--app-danger)_35%,transparent)]';
    }
    return `${theme.sheet} ${theme.text} border-[color:var(--app-border)] backdrop-blur-md`;
  };

  const variantIcon = (v: SnackbarItem['variant']) => {
    if (v === 'success') return CheckCircle2;
    if (v === 'error') return AlertCircle;
    return null;
  };

  const contextValue = React.useMemo(() => ({ show }), [show]);

  return (
    <SnackbarContext.Provider value={contextValue}>
      {children}
      {queue.length > 0 &&
        createPortal(
          <div
            className="fixed left-0 right-0 z-[700] flex flex-col gap-2 px-5 pointer-events-none"
            style={{ bottom: 'max(var(--app-tab-bar-height), calc(env(safe-area-inset-bottom) + 3.5rem))' }}
            aria-live="polite"
          >
            {queue.map((item) => {
              const StatusIcon = variantIcon(item.variant);
              return (
              <div
                key={item.id}
                className={`pointer-events-auto flex items-center gap-3 px-4 py-3.5 ${radii.lg} border ${elevation.sheet} inpx-enter-y ${variantBg(item.variant)}`}
              >
                {StatusIcon && <StatusIcon className="w-5 h-5 shrink-0" aria-hidden />}
                <p className={`${textStyles.body} flex-1 min-w-0`}>{item.message}</p>
                {item.action && (
                  <button
                    type="button"
                    className={`${touchMin} inline-flex items-center justify-center px-3 ${textStyles.captionBold} shrink-0 ${radii.button} ${theme.accentMuted} ${theme.accentText} ${motion.press} ${theme.focusRing}`}
                    onClick={() => {
                      item.action!.onClick();
                      dismiss(item.id);
                    }}
                  >
                    {item.action.label}
                  </button>
                )}
                {!item.action && (
                  <button
                    type="button"
                    aria-label="Закрыть"
                    className={`${touchMin} inline-flex items-center justify-center shrink-0 ${radii.button} ${theme.panel} ${motion.press} ${theme.focusRing}`}
                    onClick={() => dismiss(item.id)}
                  >
                    <X className="w-5 h-5" aria-hidden />
                  </button>
                )}
              </div>
            );
            })}
          </div>,
          document.body,
        )}
    </SnackbarContext.Provider>
  );
}
