import React from 'react';
import { FolderPlus } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, radii, motion } from '../ui/tokens';
import Button from '../ui/Button';
import type { UiShelf } from '../lib/inpxClient';

interface ShelfPickerProps {
  shelves: UiShelf[];
  /** Hide the shelf the book is already on (when opened from that shelf). */
  excludeShelfId?: number | string | null;
  onPick: (shelfId: number | string) => void;
  onCreate?: (name: string) => void | Promise<void>;
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
    void Promise.resolve(onCreate?.(next)).then(() => {
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
      {onCreate && creating ? (
        <div className="flex gap-2">
          <input
            className={`flex-1 min-h-12 min-w-0 px-3 ${textStyles.body} ${radii.button} ${theme.input} ${theme.inputFocus}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitCreate();
              }
            }}
            placeholder="Название полки"
            maxLength={80}
            autoFocus
            disabled={busy}
            aria-label="Название новой полки"
          />
          <Button disabled={busy || !name.trim()} onClick={submitCreate}>
            Создать
          </Button>
        </div>
      ) : onCreate ? (
        <Button variant="secondary" fullWidth disabled={busy} onClick={() => setCreating(true)}>
          <FolderPlus className="w-4 h-4" aria-hidden />
          Новая полка
        </Button>
      ) : null}
    </div>
  );
}
