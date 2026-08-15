import React from "react";

import { createPortal } from "react-dom";

import { theme } from "../lib/appTheme";

import { textStyles, radii, elevation } from "./tokens";

import Button from "./Button";

export interface DialogPositionCompare {
  localLabel: string;

  localValue: string;

  serverLabel: string;

  serverValue: string;
}

export interface DialogOptions {
  title: string;

  message: string;

  confirmLabel?: string;

  cancelLabel?: string;

  destructive?: boolean;

  positionCompare?: DialogPositionCompare;
}

interface DialogContextValue {
  confirm: (options: DialogOptions) => Promise<boolean>;
  /** Resolve the open confirm as cancelled and hide the modal (e.g. reader unmount). */
  dismiss: () => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useDialog(): DialogContextValue {
  const ctx = React.useContext(DialogContext);

  if (!ctx) throw new Error("useDialog must be used within DialogProvider");

  return ctx;
}

function DialogModal({
  state,
  onClose,
}: {
  state: DialogOptions;
  onClose: (result: boolean) => void;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled"),
      );

    const first = focusables()[0];
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (!items.length) return;

      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[600] flex items-end justify-center bg-black/50"
      role="presentation"
      onClick={() => onClose(false)}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
        className={`w-full max-w-lg rounded-t-3xl rounded-b-none border-t border-x border-[color:var(--app-border)] ${theme.sheet} ${elevation.sheet} px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 inpx-enter-y overscroll-contain`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pb-1" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-[color-mix(in_srgb,var(--app-text)_18%,transparent)]" />
        </div>
        <h2
          id="dialog-title"
          className={`${textStyles.title} ${theme.text}`}
        >
          {state.title}
        </h2>

        <p
          id="dialog-message"
          className={`${textStyles.body} ${theme.text} whitespace-pre-line`}
        >
          {state.message}
        </p>

        {state.positionCompare ? (
          <div
            className={`rounded-xl border ${theme.panel} px-3 py-3 space-y-2`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`${textStyles.caption} ${theme.textMuted}`}
              >
                {state.positionCompare.localLabel}
              </span>

              <span
                className={`${textStyles.bodyBold} ${theme.text} tabular-nums text-right`}
              >
                {state.positionCompare.localValue}
              </span>
            </div>

            <div className={`border-t ${theme.divider}`} />

            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`${textStyles.caption} ${theme.textMuted}`}
              >
                {state.positionCompare.serverLabel}
              </span>

              <span
                className={`${textStyles.bodyBold} ${theme.accentText} tabular-nums text-right`}
              >
                {state.positionCompare.serverValue}
              </span>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2 pt-1">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => onClose(false)}
          >
            {state.cancelLabel ?? "Отмена"}
          </Button>

          <Button
            variant={state.destructive ? "danger" : "primary"}
            fullWidth
            onClick={() => onClose(true)}
          >
            {state.confirmLabel ?? "OK"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<
    (DialogOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  const confirm = React.useCallback((options: DialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setState((prev) => {
        prev?.resolve(false);
        return { ...options, resolve };
      });
    });
  }, []);

  const dismiss = React.useCallback(() => {
    setState((prev) => {
      prev?.resolve(false);
      return null;
    });
  }, []);

  const close = React.useCallback((result: boolean) => {
    setState((prev) => {
      prev?.resolve(result);
      return null;
    });
  }, []);

  const value = React.useMemo(() => ({ confirm, dismiss }), [confirm, dismiss]);

  return (
    <DialogContext.Provider value={value}>
      {children}

      {state &&
        createPortal(
          <DialogModal
            state={state}
            onClose={close}
          />,
          document.body,
        )}
    </DialogContext.Provider>
  );
}
