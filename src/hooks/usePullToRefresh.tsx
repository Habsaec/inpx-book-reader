import React from 'react';
import { RefreshCw } from 'lucide-react';
import { theme } from '../lib/appTheme';

/** Pull distance (after the 0.5 drag resistance) that triggers a refresh. */
const TRIGGER_PX = 56;
const MAX_PULL_PX = 110;
const MIN_SPIN_MS = 600;

/**
 * Pull down at the top of a scroll container to refresh. Spread `bind` on the scrolling
 * element and render `indicator` inside its positioned parent. Only a vertical pull that
 * starts at scrollTop 0 counts, so sideways tab swipes and normal scrolling are untouched.
 */
export function usePullToRefresh(onRefresh?: () => void | Promise<unknown>) {
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const start = React.useRef<{ x: number; y: number; armed: boolean } | null>(null);
  const pullRef = React.useRef(0);

  const setPullBoth = (value: number) => {
    pullRef.current = value;
    setPull(value);
  };

  const bind = {
    onTouchStart: (event: React.TouchEvent<HTMLElement>) => {
      if (!onRefresh || refreshing) return;
      const touch = event.touches[0];
      start.current = touch && event.currentTarget.scrollTop <= 0
        ? { x: touch.clientX, y: touch.clientY, armed: false }
        : null;
    },
    onTouchMove: (event: React.TouchEvent<HTMLElement>) => {
      const s = start.current;
      const touch = event.touches[0];
      if (!s || !touch) return;
      const dx = touch.clientX - s.x;
      const dy = touch.clientY - s.y;
      if (!s.armed) {
        if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || event.currentTarget.scrollTop > 0) {
          start.current = null;
          return;
        }
        s.armed = true;
      }
      setPullBoth(Math.min(MAX_PULL_PX, Math.max(0, dy * 0.5)));
    },
    onTouchEnd: () => {
      const passed = pullRef.current >= TRIGGER_PX;
      start.current = null;
      setPullBoth(0);
      if (!passed || !onRefresh) return;
      setRefreshing(true);
      const started = Date.now();
      void Promise.resolve()
        .then(() => onRefresh())
        .catch(() => {})
        .finally(() => {
          const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - started));
          window.setTimeout(() => setRefreshing(false), wait);
        });
    },
  };

  const visible = refreshing || pull > 4;
  const progress = Math.min(1, pull / TRIGGER_PX);
  const indicator = visible ? (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
      style={{
        top: 'calc(var(--app-header-offset, 4rem) + 8px)',
        transform: `translateY(${refreshing ? 8 : pull * 0.6}px)`,
      }}
      role="status"
      aria-label={refreshing ? 'Обновление' : undefined}
    >
      <span className={`w-10 h-10 rounded-full inline-flex items-center justify-center shadow-md ${theme.card}`}>
        <RefreshCw
          className={`w-5 h-5 ${theme.accentText} ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }}
          aria-hidden
        />
      </span>
    </div>
  ) : null;

  return { bind, indicator, refreshing };
}
