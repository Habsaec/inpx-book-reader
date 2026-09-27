import React from 'react';

type SheetGesture = {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
};

export const SheetGestureContext = React.createContext<SheetGesture | null>(null);

export function useSheetGesture(): SheetGesture {
  const ctx = React.useContext(SheetGestureContext);
  if (!ctx) {
    return { onPointerDown: () => {} };
  }
  return ctx;
}
