import React from 'react';
import { RefreshCw } from 'lucide-react';
import { theme } from '../lib/appTheme';

const PULL_THRESHOLD = 72;

interface PullToRefreshProps {
  onRefresh: () => void | Promise<void>;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  scrollProps?: React.HTMLAttributes<HTMLDivElement>;
}

export default function PullToRefresh({
  onRefresh,
  children,
  className = '',
  disabled = false,
  scrollRef,
  onScroll,
  scrollProps,
}: PullToRefreshProps) {
  const localRef = React.useRef<HTMLDivElement>(null);
  const containerRef = scrollRef ?? localRef;
  const startYRef = React.useRef(0);
  const pullingRef = React.useRef(false);
  const [pullOffset, setPullOffset] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disabled || refreshing) return;
    const el = containerRef.current;
    if (el && el.scrollTop <= 0) {
      startYRef.current = e.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!pullingRef.current || disabled || refreshing) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) {
      pullingRef.current = false;
      setPullOffset(0);
      return;
    }
    const delta = (e.touches[0]?.clientY ?? 0) - startYRef.current;
    if (delta > 0) {
      setPullOffset(Math.min(delta * 0.45, 120));
    }
  };

  const finishPull = () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    if (pullOffset >= PULL_THRESHOLD && !disabled && !refreshing) {
      setRefreshing(true);
      setPullOffset(PULL_THRESHOLD * 0.6);
      void Promise.resolve(onRefresh()).finally(() => {
        if (!mountedRef.current) return;
        setRefreshing(false);
        setPullOffset(0);
      });
      return;
    }
    setPullOffset(0);
  };

  return (
    <div
      ref={containerRef}
      className={className}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={finishPull}
      onTouchCancel={finishPull}
      onScroll={onScroll}
      {...scrollProps}
    >
      {(pullOffset > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
          style={{ height: refreshing ? 48 : pullOffset }}
        >
          <RefreshCw
            className={`w-5 h-5 ${theme.accentText} ${refreshing ? 'animate-spin' : ''}`}
            style={{ transform: refreshing ? undefined : `rotate(${Math.min(pullOffset * 2, 180)}deg)` }}
            aria-hidden
          />
        </div>
      )}
      {children}
    </div>
  );
}
