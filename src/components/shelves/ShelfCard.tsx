import React from 'react';
import { theme } from '../../lib/appTheme';
import { textStyles, motion } from '../../ui/tokens';
import type { ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import ShelfCoverStack from './ShelfCoverStack';
import { useLongPress } from '../../hooks/useLongPress';

function bookCountLabel(n: number): string {
  const v = Math.max(0, Math.floor(n));
  const mod10 = v % 10;
  const mod100 = v % 100;
  if (mod10 === 1 && mod100 !== 11) return `${v} книга`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${v} книги`;
  return `${v} книг`;
}

export default function ShelfCard({
  name,
  count = 0,
  smart = false,
  previewBookIds,
  serverConfig,
  storageDirectory,
  onClick,
  onDelete,
}: {
  name: string;
  count?: number;
  smart?: boolean;
  previewBookIds?: string[];
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  const ids = (previewBookIds ?? []).map(String).filter(Boolean);
  const empty = count <= 0 && ids.length === 0;
  const countText = empty ? 'Пока нет книг' : bookCountLabel(count);
  // Delete lives on long-press: a red bin on every card was noise and an easy mis-tap.
  const press = useLongPress(() => onClick?.(), onDelete);

  return (
    <div className={`flex items-stretch border-b last:border-b-0 ${theme.divider}`}>
      <button
        type="button"
        {...press}
        aria-description={onDelete ? 'Удерживайте, чтобы удалить полку' : undefined}
        className={`flex-1 min-w-0 text-left py-4 select-none ${theme.rowPress} ${motion.press} ${theme.focusRing}`}
      >
        {serverConfig && ids.length > 0 ? (
          <ShelfCoverStack
            bookIds={ids}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
          />
        ) : null}
        <p className={`${textStyles.sectionLabel} ${theme.text} ${ids.length ? 'mt-3' : ''} truncate`}>
          {name}
        </p>
        <p className={`${textStyles.caption} ${theme.textMuted} mt-1`}>
          {smart ? `Умная · ${countText}` : countText}
        </p>
      </button>
    </div>
  );
}
