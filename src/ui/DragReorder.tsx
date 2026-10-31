import React from 'react';
import { GripVertical } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import { theme } from '../lib/appTheme';
import { impactLight } from '../lib/haptics';

/**
 * Order of a list reordered by dragging (`Reorder.Group` + `DragRow`): local while dragging,
 * committed once on drop; ↑↓ on the focused handle moves and commits at once.
 */
export function useDragOrder<T extends string>(source: T[], commit: (next: T[]) => void) {
  const [order, setOrder] = React.useState(source);
  const orderRef = React.useRef(order);
  orderRef.current = order;
  const commitRef = React.useRef(commit);
  commitRef.current = commit;
  const dragging = React.useRef(false);
  const sourceKey = source.join('|');
  React.useEffect(() => {
    if (!dragging.current) setOrder(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow the saved order, not the array identity
  }, [sourceKey]);
  const start = React.useCallback(() => {
    dragging.current = true;
  }, []);
  const finish = React.useCallback(() => {
    dragging.current = false;
    if (orderRef.current.join('|') !== sourceKey) commitRef.current(orderRef.current);
  }, [sourceKey]);
  const moveBy = React.useCallback((value: T, step: -1 | 1) => {
    const next = orderRef.current.slice();
    const pos = next.indexOf(value);
    const target = pos + step;
    if (pos < 0 || target < 0 || target >= next.length) return;
    [next[pos], next[target]] = [next[target], next[pos]];
    setOrder(next);
    commitRef.current(next);
  }, []);
  return { order, setOrder, start, finish, moveBy };
}

/**
 * One row of a `Reorder.Group`: only the ⠿ handle starts a drag (`touch-none`), so the rest of
 * the row still scrolls the page, taps and long-presses as before.
 */
export function DragRow<T extends string>({
  value,
  label,
  disabled = false,
  onDragStart,
  onDragEnd,
  onMove,
  className = '',
  children,
}: {
  value: T;
  label: string;
  disabled?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (step: -1 | 1) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={value}
      as="li"
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="relative list-none rounded-[var(--app-radius-md)] bg-[var(--app-bg)]"
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 20px rgba(0,0,0,0.18)', zIndex: 2 }}
    >
      <div className={`flex items-center gap-1 ${className}`}>
        {disabled ? null : (
          <button
            type="button"
            aria-label={`${label}: перетащите или нажимайте ↑↓, чтобы изменить порядок`}
            className={`shrink-0 w-10 min-h-12 -ml-2 self-stretch inline-flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none ${theme.textMuted} ${theme.focusRing}`}
            onPointerDown={(e) => {
              impactLight();
              controls.start(e);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                onMove(e.key === 'ArrowUp' ? -1 : 1);
              }
            }}
          >
            <GripVertical className="w-5 h-5" aria-hidden />
          </button>
        )}
        {children}
      </div>
    </Reorder.Item>
  );
}
