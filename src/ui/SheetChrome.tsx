import React from 'react';
import { theme } from '../lib/appTheme';
import { radii } from './tokens';

/** Shared drag handle for bottom sheets */
export function SheetDragHandle() {
  return (
    <div className="flex justify-center pt-2 pb-1 shrink-0" aria-hidden>
      <div className="w-10 h-1 rounded-full bg-[color-mix(in_srgb,var(--app-text)_18%,transparent)]" />
    </div>
  );
}

export const sheetPanelClass = `${radii.lg} rounded-b-none border-t ${theme.sheet} max-h-[85vh] overflow-y-auto`;

export const sheetBackdropClass = 'fixed inset-0 z-[400] flex flex-col justify-end bg-stone-950/60';

export function sheetPanelStyle(): React.CSSProperties {
  return { paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' };
}
