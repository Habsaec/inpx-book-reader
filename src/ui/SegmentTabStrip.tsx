import React from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { theme } from '../lib/appTheme';
import { motion as motionTokens, radii, textStyles } from './tokens';
import { impactLight } from '../lib/haptics';
import { useCalmMotion } from '../hooks/useCalmMotion';
import { useFollowSpring } from './useFollowSpring';

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
 * Compact segment control — quiet track, sliding highlight.
 */
export default function SegmentTabStrip<T extends string>({
  tabs,
  active,
  onChange,
  tabRefs,
  'aria-label': ariaLabel,
  className = '',
}: SegmentTabStripProps<T>) {
  const calm = useCalmMotion();
  const follow = useFollowSpring(calm);
  const listRef = React.useRef<HTMLDivElement>(null);
  const localBtnRefs = React.useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = React.useState({ w: 0, h: 0, ready: false });
  const x = useMotionValue(0);
  const scaleX = useMotionValue(1);
  const indicatorTransform = useTransform(() => `translateX(${x.get()}px) scaleX(${scaleX.get()})`);
  const widthRef = React.useRef(0);
  const seenRef = React.useRef<T | null>(null);
  const glideTarget = React.useRef<number | null>(null);

  const measure = React.useCallback(() => {
    if (active == null) {
      setIndicator({ w: 0, h: 0, ready: false });
      widthRef.current = 0;
      seenRef.current = null;
      glideTarget.current = null;
      return;
    }
    const list = listRef.current;
    const btn = (tabRefs?.current[active] ?? localBtnRefs.current[active]) ?? null;
    if (!list || !btn) {
      setIndicator({ w: 0, h: 0, ready: false });
      return;
    }
    const listRect = list.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const nextX = btnRect.left - listRect.left + list.scrollLeft;
    const nextW = btnRect.width;
    const nextH = btnRect.height;
    setIndicator((prev) => (
      prev.ready && prev.w === nextW ? prev : { w: nextW, h: nextH, ready: true }
    ));
    if (seenRef.current !== active) {
      const prevW = widthRef.current;
      if (seenRef.current != null && prevW > 0 && nextW > 0) {
        scaleX.set(prevW / nextW);
        follow(x, nextX);
        follow(scaleX, 1, 0);
        glideTarget.current = nextX;
      } else {
        x.set(nextX);
        scaleX.set(1);
        glideTarget.current = null;
      }
      seenRef.current = active;
    } else if (glideTarget.current != null && Math.abs(glideTarget.current - nextX) < 0.5) {
      widthRef.current = nextW;
      return;
    } else {
      glideTarget.current = null;
      x.set(nextX);
    }
    widthRef.current = nextW;
  }, [active, follow, scaleX, tabRefs, x]);

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
      className={`inpx-scroll-tabs relative flex gap-1 overflow-x-auto scrollbar-none ${className}`}
    >
      {indicator.ready ? (
        <motion.span
          aria-hidden
          className={`pointer-events-none absolute top-0 left-0 origin-left ${radii.md} bg-[var(--app-accent-soft)]`}
          style={{ transform: indicatorTransform, width: indicator.w, height: '100%' }}
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
            onClick={() => {
              if (tab.id !== active) impactLight();
              onChange(tab.id);
            }}
            className={`relative z-[1] shrink-0 min-h-12 px-3.5 ${textStyles.body} font-medium ${radii.md} ${theme.focusRing} ${motionTokens.press} ${
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
