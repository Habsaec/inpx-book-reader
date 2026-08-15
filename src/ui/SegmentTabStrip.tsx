import React from 'react';
import { theme } from '../lib/appTheme';
import { motion as motionTokens, radii } from './tokens';

export type SegmentTabItem<T extends string> = {
  id: T;
  label: string;
};

interface SegmentTabStripProps<T extends string> {
  tabs: readonly SegmentTabItem<T>[];
  /** null = none selected (e.g. catalog root / books). */
  active: T | null;
  onChange: (id: T) => void;
  /** Optional refs for scrollIntoView (library segments). */
  tabRefs?: React.MutableRefObject<Partial<Record<T, HTMLButtonElement | null>>>;
  'aria-label'?: string;
  className?: string;
}

/**
 * Pill segment control — Material You style with sliding highlight.
 */
export default function SegmentTabStrip<T extends string>({
  tabs,
  active,
  onChange,
  tabRefs,
  'aria-label': ariaLabel,
  className = '',
}: SegmentTabStripProps<T>) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const localBtnRefs = React.useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = React.useState({ x: 0, w: 0, h: 0, ready: false });

  const measure = React.useCallback(() => {
    if (active == null) {
      setIndicator({ x: 0, w: 0, h: 0, ready: false });
      return;
    }
    const list = listRef.current;
    const btn = (tabRefs?.current[active] ?? localBtnRefs.current[active]) ?? null;
    if (!list || !btn) {
      setIndicator({ x: 0, w: 0, h: 0, ready: false });
      return;
    }
    const listRect = list.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({
      x: btnRect.left - listRect.left + list.scrollLeft,
      w: btnRect.width,
      h: btnRect.height,
      ready: true,
    });
  }, [active, tabRefs]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure, tabs]);

  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const onScroll = () => measure();
    list.addEventListener('scroll', onScroll, { passive: true });
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => measure())
        : null;
    ro?.observe(list);
    window.addEventListener('resize', measure);
    return () => {
      list.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative flex gap-1 mt-4 p-1 ${radii.button} ${theme.panel} overflow-x-auto scrollbar-none ${className}`}
    >
      {indicator.ready ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute top-1 left-0 ${radii.button} bg-[var(--app-surface)] shadow-sm ${motionTokens.segIndicator}`}
          style={{
            width: indicator.w,
            height: indicator.h,
            transform: `translateX(${indicator.x}px)`,
          }}
        />
      ) : null}
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            ref={(el) => {
              localBtnRefs.current[tab.id] = el;
              if (tabRefs) tabRefs.current[tab.id] = el;
            }}
            onClick={() => onChange(tab.id)}
            className={`relative z-[1] shrink-0 min-h-12 px-3.5 text-sm font-medium ${radii.button} ${theme.focusRing} ${motionTokens.press} ${
              isActive ? theme.segActive : theme.segInactive
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
