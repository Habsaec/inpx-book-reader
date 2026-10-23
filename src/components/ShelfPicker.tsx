import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles, radii, motion } from '../ui/tokens';
import ShelfCreateField from './shelves/ShelfCreateField';
import type { UiShelf } from '../lib/inpxClient';

interface ShelfPickerProps {
  shelves: UiShelf[];
  /** Hide the shelf the book is already on (when opened from that shelf). */
  excludeShelfId?: number | string | null;
  onPick: (shelfId: number | string) => void;
  /** Resolve `false` when the shelf was not created, to keep the typed name. */
  onCreate?: (name: string) => void | boolean | Promise<void | boolean>;
  busy?: boolean;
}

export default function ShelfPicker({
  shelves,
  excludeShelfId,
  onPick,
  onCreate,
  busy = false,
}: ShelfPickerProps) {
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const visible = shelves.filter(
    (s) => excludeShelfId == null || String(s.id) !== String(excludeShelfId),
  );

  const submitCreate = () => {
    const next = name.trim();
    if (!next || busy) return;
    void Promise.resolve(onCreate?.(next)).then((created) => {
      if (created === false) return;
      setName('');
      setCreating(false);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {visible.length === 0 && !creating ? (
        <p className={`${textStyles.caption} ${theme.textMuted} px-1`}>Полок пока нет — создайте первую.</p>
      ) : (
        visible.map((s) => (
          <button
            key={String(s.id)}
            type="button"
            disabled={busy}
            onClick={() => onPick(s.id)}
            className={`w-full min-h-12 px-4 text-left ${radii.button} ${textStyles.bodyBold} ${theme.chip} ${theme.chipHover} ${theme.focusRing} ${motion.press} disabled:opacity-50`}
          >
            {s.name}
            {s.bookCount != null ? (
              <span className={`${textStyles.caption} ${theme.textMuted} font-medium ml-2`}>
                {s.bookCount}
              </span>
            ) : null}
          </button>
        ))
      )}
      {onCreate ? (
        <ShelfCreateField
          open={creating}
          name={name}
          busy={busy}
          onOpen={() => setCreating(true)}
          onClose={() => {
            setCreating(false);
            setName('');
          }}
          onNameChange={setName}
          onSubmit={submitCreate}
        />
      ) : null}
    </div>
  );
}
