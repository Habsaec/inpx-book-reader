import React from 'react';
import { animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from 'motion/react';
import { createPortal } from 'react-dom';
import { useCalmMotion } from '../hooks/useCalmMotion';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { impactLight } from '../lib/haptics';
import { releaseVelocity, rubberband, sheetTarget } from '../lib/sheetPhysics';
import { SheetGestureContext } from './sheetGesture';
import { sheetPanelStyle } from './SheetChrome';
import { createOpeningClickGuard } from './openingClickGuard';

type DragSheetProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
  describedBy?: string;
  role?: 'dialog' | 'alertdialog';
  /** Stacking. Filters sit under other sheets. */
  zClass?: string;
  /** Long-press that opened the sheet must not dismiss on finger-up. */
  swallowOpeningPointer?: boolean;
};

function offscreenOf(panel: HTMLElement | null): number {
  const height = panel?.offsetHeight ?? 0;
  return Math.max(height, Math.round(window.innerHeight * 0.45));
}

function canScrollY(el: HTMLElement): boolean {
  const overflow = getComputedStyle(el).overflowY;
  if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'overlay') return false;
  return el.scrollHeight > el.clientHeight + 1;
}

/** Nearest vertical scroller between the finger and the sheet panel. */
function nearestScrollable(start: EventTarget | null, panel: HTMLElement | null): HTMLElement | null {
  if (!(start instanceof HTMLElement) || !panel) return null;
  let el: HTMLElement | null = start;
  while (el) {
    if (canScrollY(el)) return el;
    if (el === panel) break;
    el = el.parentElement;
  }
  return null;
}

export default function DragSheet({
  open,
  onClose,
  children,
  className = '',
  labelledBy,
  describedBy,
  role = 'dialog',
  zClass = 'z-[500]',
  swallowOpeningPointer = false,
}: DragSheetProps) {
  const calm = useCalmMotion();
  const calmRef = React.useRef(calm);
  calmRef.current = calm;
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  const panelRef = React.useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const closedRef = React.useRef(Math.round(window.innerHeight * 0.45));
  const animRef = React.useRef<AnimationPlaybackControls | null>(null);
  const genRef = React.useRef(0);
  const settledClosed = React.useRef(false);
  const armedRef = React.useRef(!swallowOpeningPointer);
  const blockBackdropClick = React.useRef(false);
  const [mounted, setMounted] = React.useState(open);

  const panelTransform = useTransform(y, (value) => `translateY(${value}px)`);
  const scrimOpacity = useTransform(y, (value) => {
    const limit = Math.max(1, closedRef.current);
    const progress = 1 - Math.min(1, Math.max(0, value / limit));
    return 0.5 * progress;
  });

  const stop = React.useCallback(() => {
    genRef.current += 1;
    animRef.current?.stop();
    animRef.current = null;
  }, []);

  const springTo = React.useCallback((
    target: number,
    velocity: number,
    bounce: number,
    done?: () => void,
  ) => {
    stop();
    if (calmRef.current) {
      y.set(target === 0 ? 0 : target);
      done?.();
      return;
    }
    const token = genRef.current;
    animRef.current = animate(y, target, {
      type: 'spring',
      bounce,
      duration: 0.3,
      velocity,
      onComplete: () => {
        if (token !== genRef.current) return;
        done?.();
      },
    });
  }, [stop, y]);

  const requestClose = React.useCallback((velocity = 0) => {
    const dest = offscreenOf(panelRef.current);
    closedRef.current = dest;
    const flicked = Math.abs(velocity) > 50;
    springTo(dest, velocity, flicked ? 0.2 : 0, () => {
      settledClosed.current = true;
      onCloseRef.current();
    });
  }, [springTo]);

  React.useEffect(() => {
    if (open) {
      settledClosed.current = false;
      setMounted(true);
      return;
    }
    if (!mounted) return;
    if (settledClosed.current) {
      setMounted(false);
      return;
    }
    const dest = offscreenOf(panelRef.current);
    closedRef.current = dest;
    springTo(dest, 0, 0, () => setMounted(false));
  }, [open, mounted, springTo]);

  const springToRef = React.useRef(springTo);
  springToRef.current = springTo;

  React.useLayoutEffect(() => {
    if (!open || !mounted) return;
    const dest = offscreenOf(panelRef.current);
    closedRef.current = dest;
    if (calmRef.current) {
      y.set(0);
      return;
    }
    y.set(dest);
    springToRef.current(0, 0, 0);
  }, [open, mounted, y]);

  useOverlayBackHandler(open && mounted, () => requestClose(0));

  React.useEffect(() => {
    if (!open || !swallowOpeningPointer) {
      armedRef.current = open;
      return;
    }
    armedRef.current = false;
    const guard = createOpeningClickGuard();
    const syncArmed = () => {
      armedRef.current = guard.isArmed();
    };
    const onUp = () => {
      guard.notePointerUp();
      syncArmed();
    };
    const onDown = () => {
      guard.notePointerDown();
      syncArmed();
    };
    const onClick = (event: Event) => {
      if (!guard.consumeReleaseClick()) return;
      event.stopPropagation();
      event.preventDefault();
      syncArmed();
    };
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('click', onClick, true);
    };
  }, [open, swallowOpeningPointer]);

  const dragCleanup = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => {
    dragCleanup.current?.();
  }, []);

  const startTracking = React.useCallback((
    handle: HTMLElement,
    clientY: number,
    pointerId: number,
    timeStamp: number,
  ) => {
    dragCleanup.current?.();
    handle.setPointerCapture(pointerId);
    stop();
    const origin = y.get();
    const samples: { y: number; t: number }[] = [{ y: origin, t: timeStamp }];

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const raw = origin + (ev.clientY - clientY);
      const limit = offscreenOf(panelRef.current);
      const next = raw < 0 ? -rubberband(-raw, limit) : raw;
      y.set(next);
      samples.push({ y: next, t: ev.timeStamp });
      if (samples.length > 8) samples.shift();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      dragCleanup.current?.();
      blockBackdropClick.current = true;
      window.setTimeout(() => {
        blockBackdropClick.current = false;
      }, 50);
      const velocity = releaseVelocity(samples);
      const current = y.get();
      const dest = offscreenOf(panelRef.current);
      closedRef.current = dest;
      const targetY = sheetTarget(current, velocity, dest);
      const moved = Math.abs(current - origin) > 8 || Math.abs(velocity) > 50;
      if (targetY === 0) {
        if (moved) impactLight();
        const flicked = Math.abs(velocity) > 50;
        springTo(0, velocity, flicked ? 0.2 : 0);
        return;
      }
      if (moved) impactLight();
      springTo(dest, velocity, Math.abs(velocity) > 50 ? 0.2 : 0, () => {
        settledClosed.current = true;
        onCloseRef.current();
      });
    };
    const detach = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      if (dragCleanup.current === detach) dragCleanup.current = null;
    };
    dragCleanup.current = detach;
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }, [springTo, stop, y]);

  const onPointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (calmRef.current || !open) return;
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [role="switch"]')) return;
    startTracking(event.currentTarget, event.clientY, event.pointerId, event.timeStamp);
  }, [open, startTracking]);

  const onContentPointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (calmRef.current || !open || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [role="switch"], [data-sheet-grab]')) return;
    const panel = panelRef.current;
    if (!panel) return;

    const scroller = nearestScrollable(target, panel);
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const originScroll = scroller?.scrollTop ?? 0;

    const detach = () => {
      panel.removeEventListener('pointermove', move);
      panel.removeEventListener('pointerup', done);
      panel.removeEventListener('pointercancel', done);
    };
    const done = () => detach();
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dy = ev.clientY - startY;
      if (dy < -10) {
        detach();
        return;
      }
      if (dy < 10) return;
      const liveTop = scroller?.scrollTop ?? 0;
      if (originScroll > 1 || liveTop > 1) {
        detach();
        return;
      }
      detach();
      if (scroller) scroller.scrollTop = 0;
      startTracking(panel, ev.clientY, pointerId, ev.timeStamp);
    };
    panel.addEventListener('pointermove', move);
    panel.addEventListener('pointerup', done);
    panel.addEventListener('pointercancel', done);
  }, [open, startTracking]);

  const gesture = React.useMemo(() => ({ onPointerDown }), [onPointerDown]);

  if (!mounted || typeof document === 'undefined') return null;

  const dismissFromScrim = () => {
    if (blockBackdropClick.current) {
      blockBackdropClick.current = false;
      return;
    }
    if (swallowOpeningPointer && !armedRef.current) return;
    requestClose(0);
  };

  return createPortal(
    <div className={`fixed inset-0 ${zClass} overscroll-contain`}>
      <motion.div
        className="absolute inset-0 bg-black"
        style={{ opacity: calm ? 0.5 : scrimOpacity }}
        onClick={dismissFromScrim}
      />
      <motion.div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={`absolute inset-x-0 bottom-0 ${className}`}
        style={{ transform: calm ? 'translateY(0px)' : panelTransform, ...sheetPanelStyle() }}
        onPointerDown={onContentPointerDown}
        onClick={(event) => event.stopPropagation()}
      >
        <SheetGestureContext.Provider value={gesture}>
          {children}
        </SheetGestureContext.Provider>
      </motion.div>
    </div>,
    document.body,
  );
}
