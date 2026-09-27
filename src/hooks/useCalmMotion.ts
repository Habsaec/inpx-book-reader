import React from 'react';
import { useReducedMotion } from 'motion/react';

/** Reduced motion or e-ink: cross-fade, no slides or springs. */
export function useCalmMotion(): boolean {
  const reduce = useReducedMotion();
  const [eink, setEink] = React.useState(false);

  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => setEink(root.dataset.eink === '1');
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ['data-eink'] });
    return () => obs.disconnect();
  }, []);

  return Boolean(reduce || eink);
}
