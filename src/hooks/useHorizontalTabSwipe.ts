import React from 'react';

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

interface Options {
  enabled?: boolean;
  minDistance?: number;
  maxVerticalDrift?: number;
}

/**
 * Горизонтальный свайп для переключения вкладок.
 * Не срабатывает внутри элементов с data-swipe-lock или при вертикальной прокрутке.
 */
export function useHorizontalTabSwipe<T extends string>(
  tabs: readonly T[],
  active: T,
  onChange: (tab: T) => void,
  options: Options = {}
): SwipeHandlers {
  const { enabled = true, minDistance = 72, maxVerticalDrift = 55 } = options;
  const startX = React.useRef(0);
  const startY = React.useRef(0);
  const locked = React.useRef(false);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const onTouchStart = React.useCallback((e: React.TouchEvent) => {
    if (!enabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    const target = e.target as HTMLElement;
    locked.current = !!target.closest('[data-swipe-lock]');
  }, [enabled]);

  const onTouchEnd = React.useCallback((e: React.TouchEvent) => {
    if (!enabled || locked.current) return;

    const diffX = e.changedTouches[0].clientX - startX.current;
    const diffY = e.changedTouches[0].clientY - startY.current;

    if (Math.abs(diffX) < minDistance || Math.abs(diffY) > maxVerticalDrift) return;
    if (Math.abs(diffX) <= Math.abs(diffY)) return;

    const idx = tabs.indexOf(active);
    if (idx < 0) return;

    if (diffX < 0 && idx < tabs.length - 1) {
      onChangeRef.current(tabs[idx + 1]);
    } else if (diffX > 0 && idx > 0) {
      onChangeRef.current(tabs[idx - 1]);
    }
  }, [enabled, active, tabs, minDistance, maxVerticalDrift]);

  return { onTouchStart, onTouchEnd };
}
