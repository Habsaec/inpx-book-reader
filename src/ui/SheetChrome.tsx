import React from 'react';
import { theme } from '../lib/appTheme';
import { useSheetGesture } from './sheetGesture';

/** Grab zone. Buttons inside it do not start a drag. */
export function SheetGrabRegion({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { onPointerDown } = useSheetGesture();
  return (
    <div data-sheet-grab="" className={`touch-none ${className}`} onPointerDown={onPointerDown}>
      {children}
    </div>
  );
}

/** Shared drag handle for bottom sheets. */
export function SheetDragHandle() {
  return (
    <SheetGrabRegion className="flex justify-center pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing">
      <div
        className="w-10 h-1 rounded-full bg-[color-mix(in_srgb,var(--app-text)_18%,transparent)]"
        aria-hidden
      />
    </SheetGrabRegion>
  );
}

export const sheetPanelClass = `rounded-t-[var(--app-radius-lg)] rounded-b-none border-t ${theme.sheet} max-h-[85vh] overflow-y-auto`;

/** Sheets below dialogs (600) and snackbars (700). */
export const sheetBackdropClass = 'fixed inset-0 z-[500] flex flex-col justify-end bg-black/50 overscroll-contain';

export function sheetPanelStyle(): React.CSSProperties {
  return { paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' };
}
