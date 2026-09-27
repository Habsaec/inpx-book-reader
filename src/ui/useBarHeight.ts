import React from 'react';

/** Height of an overlay bar, including when it mounts later. */
export function useBarHeight() {
  const [el, setEl] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);

  React.useLayoutEffect(() => {
    if (!el) {
      setHeight(0);
      return;
    }
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [el]);

  return [setEl, height, el] as const;
}
