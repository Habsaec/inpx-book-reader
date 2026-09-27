import React from "react";

import { theme } from "../lib/appTheme";

import { textStyles, elevation } from "./tokens";

import Button from "./Button";
import DragSheet from "./DragSheet";
import { SheetDragHandle } from "./SheetChrome";

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
  open,
  onClose,
}: {
  state: DialogOptions;
  open: boolean;
  onClose: (result: boolean) => void;
}) {
  const [panelEl, setPanelEl] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open || !panelEl) return;

    const focusables = () =>
      Array.from(panelEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled"),
      );

    focusables()[0]?.focus();

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
  }, [onClose, open, panelEl]);

  return (
    <DragSheet
      open={open}
      onClose={() => onClose(false)}
      labelledBy="dialog-title"
      describedBy="dialog-message"
      role="alertdialog"
      zClass="z-[600]"
      className={`w-full max-w-lg rounded-t-[var(--app-radius-lg)] rounded-b-none border-t ${theme.sheet} ${elevation.sheet} px-5 pt-3 space-y-4 overscroll-contain`}
    >
      <div ref={setPanelEl}>
        <SheetDragHandle />
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
            className={`rounded-[var(--app-radius-md)] border ${theme.panel} px-3 py-3 space-y-2`}
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
    </DragSheet>
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
  const shownRef = React.useRef(state);
  if (state) shownRef.current = state;
  const shown = state ?? shownRef.current;

  return (
    <DialogContext.Provider value={value}>
      {children}

      {shown ? (
        <DialogModal
          open={Boolean(state)}
          state={shown}
          onClose={close}
        />
      ) : null}
    </DialogContext.Provider>
  );
}
