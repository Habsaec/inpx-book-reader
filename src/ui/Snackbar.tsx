import React from 'react';
import { Toaster, toast } from 'sonner';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, radii, touchMin, motion as motionTokens, elevation } from './tokens';

export interface SnackbarAction {
  label: string;
  onClick: () => void;
}

type SnackbarVariant = 'default' | 'success' | 'error';

const AUTO_HIDE_MS = 2200;
const AUTO_HIDE_ACTION_MS = 4000;
const ABOVE_TAB = 'max(var(--app-tab-bar-height), calc(env(safe-area-inset-bottom) + 3.5rem))';

const SnackbarContext = React.createContext(false);

function variantClass(variant: SnackbarVariant): string {
  if (variant === 'success') {
    return 'bg-[var(--app-surface)] text-[var(--app-success)] border-[color:var(--app-border)]';
  }
  if (variant === 'error') {
    return 'bg-[var(--app-surface)] text-[var(--app-danger)] border-[color:var(--app-border)]';
  }
  return `${theme.sheet} ${theme.text} border-[color:var(--app-border)]`;
}

function SnackbarCard({
  id,
  message,
  action,
  variant,
}: {
  id: string | number;
  message: string;
  action?: SnackbarAction;
  variant: SnackbarVariant;
}) {
  const StatusIcon = variant === 'success' ? CheckCircle2 : variant === 'error' ? AlertCircle : null;
  return (
    <div className={`inpx-snackbar pointer-events-auto flex items-center gap-3 px-4 py-3 w-full ${radii.lg} border ${elevation.sheet} ${variantClass(variant)}`}>
      {StatusIcon ? <StatusIcon className="w-5 h-5 shrink-0" aria-hidden /> : null}
      <p className={`${textStyles.body} flex-1 min-w-0`}>{message}</p>
      {action ? (
        <button
          type="button"
          className={`${touchMin} inline-flex items-center justify-center px-3 ${textStyles.captionBold} shrink-0 ${radii.button} ${theme.accentMuted} ${theme.accentText} ${motionTokens.press} ${theme.focusRing}`}
          onClick={() => {
            action.onClick();
            toast.dismiss(id);
          }}
        >
          {action.label}
        </button>
      ) : (
        <button
          type="button"
          aria-label="Закрыть"
          className={`${touchMin} inline-flex items-center justify-center shrink-0 ${radii.button} ${theme.panel} ${motionTokens.press} ${theme.focusRing}`}
          onClick={() => toast.dismiss(id)}
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
      )}
    </div>
  );
}

function showSnackbar(
  message: string,
  action?: SnackbarAction,
  variant: SnackbarVariant = 'default',
  durationMs?: number,
) {
  toast.custom(
    (id) => <SnackbarCard id={id} message={message} action={action} variant={variant} />,
    {
      id: message,
      duration: durationMs ?? (action ? AUTO_HIDE_ACTION_MS : AUTO_HIDE_MS),
      unstyled: true,
    },
  );
}

const snackbarApi = { show: showSnackbar };

export function useSnackbar() {
  const ready = React.useContext(SnackbarContext);
  if (!ready) throw new Error('useSnackbar must be used within SnackbarProvider');
  return snackbarApi;
}

function useToasterTheme(): 'light' | 'dark' {
  const [mode, setMode] = React.useState<'light' | 'dark'>(() => (
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  ));

  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => setMode(root.dataset.theme === 'light' ? 'light' : 'dark');
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return mode;
}

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const toasterTheme = useToasterTheme();
  return (
    <SnackbarContext.Provider value={true}>
      {children}
      <Toaster
        theme={toasterTheme}
        position="bottom-center"
        expand
        visibleToasts={3}
        gap={8}
        duration={AUTO_HIDE_MS}
        swipeDirections={['bottom']}
        containerAriaLabel="Уведомления"
        offset={{ bottom: ABOVE_TAB, left: '1.25rem', right: '1.25rem' }}
        mobileOffset={{ bottom: ABOVE_TAB, left: '1.25rem', right: '1.25rem' }}
      />
    </SnackbarContext.Provider>
  );
}
