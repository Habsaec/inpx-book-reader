import React from 'react';
import { createPortal } from 'react-dom';
import { theme } from '../lib/appTheme';
import { textStyles, radii, elevation } from './tokens';
import Button from './Button';

export interface DialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface DialogContextValue {
  confirm: (options: DialogOptions) => Promise<boolean>;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(DialogOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = React.useCallback((options: DialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <DialogContext.Provider value={{ confirm }}>
      {children}
      {state &&
        createPortal(
          <div
            className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-4 bg-black/50"
            role="presentation"
            onClick={() => close(false)}
          >
            <div
              role="alertdialog"
              aria-labelledby="dialog-title"
              aria-describedby="dialog-message"
              className={`w-full max-w-sm ${radii.lg} border ${theme.sheet} ${elevation.sheet} p-5 space-y-4`}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="dialog-title" className={`${textStyles.title} ${theme.text}`}>
                {state.title}
              </h2>
              <p id="dialog-message" className={`${textStyles.body} ${theme.textMuted} whitespace-pre-line`}>
                {state.message}
              </p>
              <div className="flex gap-2 pt-1">
                <Button variant="secondary" fullWidth onClick={() => close(false)}>
                  {state.cancelLabel ?? 'Отмена'}
                </Button>
                <Button
                  variant={state.destructive ? 'danger' : 'primary'}
                  fullWidth
                  onClick={() => close(true)}
                >
                  {state.confirmLabel ?? 'OK'}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </DialogContext.Provider>
  );
}
