import React from 'react';
import { theme } from '../../lib/appTheme';
import { textStyles, motion } from '../../ui/tokens';
import type { ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import ShelfCoverStack from './ShelfCoverStack';

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
  previewBookIds,
  serverConfig,
  storageDirectory,
  onClick,
}: {
  name: string;
  count?: number;
  previewBookIds?: string[];
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  onClick?: () => void;
}) {
  const ids = (previewBookIds ?? []).map(String).filter(Boolean);
  const empty = count <= 0 && ids.length === 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left py-4 border-b last:border-b-0 ${theme.divider} ${theme.rowPress} ${motion.press} ${theme.focusRing}`}
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
        {empty ? 'Пока нет книг' : bookCountLabel(count)}
      </p>
    </button>
  );
}
