import React from 'react';
import { animate, type AnimationPlaybackControls, type MotionValue } from 'motion/react';

/** Critically damped spring. Retargets from the live value and keeps velocity. */
export function useFollowSpring(calm: boolean) {
  const anims = React.useRef(new Map<MotionValue<number>, AnimationPlaybackControls>());

  React.useEffect(() => () => {
    anims.current.forEach((ctrl) => ctrl.stop());
    anims.current.clear();
  }, []);

  return React.useCallback((value: MotionValue<number>, target: number, velocity = value.getVelocity()) => {
    anims.current.get(value)?.stop();
    if (calm) {
      value.set(target);
      anims.current.delete(value);
      return;
    }
    const ctrl = animate(value, target, {
      type: 'spring',
      bounce: 0,
      duration: 0.3,
      velocity,
    });
    anims.current.set(value, ctrl);
  }, [calm]);
}
