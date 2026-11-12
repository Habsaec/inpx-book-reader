import React from 'react';

/**
 * Long lists mount in steps: the first `step` items at once, the next ones when the end of the
 * rendered part comes near the screen. Sorting and filtering still work on the whole list —
 * only the mounting (and the cover loads it starts) is spread out. Works inside any scroll
 * container; a hidden tab (display: none) never grows.
 */
export function useIncrementalRender<T>(items: T[], step = 60): { visible: T[]; sentinel: React.ReactNode } {
  const [count, setCount] = React.useState(step);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const total = items.length;
  const first = items[0];
  const supported = typeof IntersectionObserver !== 'undefined';

  // Another list (new sort, filter, section): start from the top again.
  React.useEffect(() => {
    setCount(step);
  }, [first, step]);

  React.useEffect(() => {
    if (!supported || count >= total) return undefined;
    const el = sentinelRef.current;
    if (!el) return undefined;
    // A fresh observer per step: it reports at once when the sentinel is still near the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCount((current) => Math.min(total, current + step));
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [count, total, step, supported]);

  if (!supported || total <= count) return { visible: items, sentinel: null };
  return {
    visible: items.slice(0, count),
    sentinel: <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />,
  };
}
