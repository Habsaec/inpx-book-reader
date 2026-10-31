import React from 'react';
import { Reorder } from 'motion/react';
import { DragRow, useDragOrder } from '../../ui/DragReorder';
import { shelfOrderKey } from '../../lib/homeLayout';
import { theme } from '../../lib/appTheme';
import type { UiShelf } from '../../lib/inpxClient';

/**
 * Shelves of one kind, reordered by dragging ⠿ (or ↑↓ on it). On drop `onReorder` gets the new
 * keys (`shelf:<id>` / `smart:<id>`), which become the account `shelfOrder` — the home page
 * shows pinned shelves in the same order. Without `onReorder` (offline, unsaved local shelves)
 * the rows render as a plain list.
 */
export default function SortableShelfList({
  shelves,
  onReorder,
  renderRow,
  label,
}: {
  shelves: UiShelf[];
  onReorder?: (keys: string[]) => void;
  renderRow: (shelf: UiShelf) => React.ReactNode;
  label: string;
}) {
  const keys = shelves.map(shelfOrderKey);
  const drag = useDragOrder(keys, (next) => onReorder?.(next));
  const sortable = Boolean(onReorder) && shelves.length > 1 && shelves.every((shelf) => typeof shelf.id === 'number');
  if (!sortable) return <>{shelves.map((shelf) => <React.Fragment key={shelfOrderKey(shelf)}>{renderRow(shelf)}</React.Fragment>)}</>;

  const byKey = new Map(shelves.map((shelf) => [shelfOrderKey(shelf), shelf]));
  return (
    <Reorder.Group axis="y" as="ul" values={drag.order} onReorder={drag.setOrder} aria-label={label}>
      {drag.order.map((key) => {
        const shelf = byKey.get(key);
        if (!shelf) return null;
        return (
          <DragRow
            key={key}
            value={key}
            label={shelf.name}
            onDragStart={drag.start}
            onDragEnd={drag.finish}
            onMove={(step) => drag.moveBy(key, step)}
            className={`border-b ${theme.divider}`}
          >
            {/* The divider spans the handle too: the row's own bottom border is dropped here. */}
            <div className="flex-1 min-w-0 [&>*]:border-b-0">{renderRow(shelf)}</div>
          </DragRow>
        );
      })}
    </Reorder.Group>
  );
}
