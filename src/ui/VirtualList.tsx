import React from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  overscan?: number;
  className?: string;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
}

/**
 * Простая windowed-виртуализация для длинных списков в Android WebView.
 * Рендерит только видимые строки + overscan.
 */
export default function VirtualList<T>({
  items,
  itemHeight,
  overscan = 6,
  className = '',
  getKey,
  renderItem,
}: VirtualListProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(480);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight || 480);
    });
    ro.observe(el);
    setViewportHeight(el.clientHeight || 480);

    return () => ro.disconnect();
  }, []);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan);
  const offsetY = startIndex * itemHeight;

  if (items.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto min-h-0 ${className}`}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {items.slice(startIndex, endIndex).map((item, i) => {
            const index = startIndex + i;
            return (
              <div key={getKey(item, index)} style={{ minHeight: itemHeight }}>
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
