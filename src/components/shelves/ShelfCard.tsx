import React from 'react';
import { theme } from '../../lib/appTheme';
import { textStyles, motion } from '../../ui/tokens';
import type { ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import ShelfCoverStack from './ShelfCoverStack';
import { useLongPress } from '../../hooks/useLongPress';
import ShelfHomeToggle from './ShelfHomeToggle';
import { Search } from 'lucide-react';
import { t, tn } from '../../i18n';

function bookCountLabel(n: number): string {
  return tn('common.booksCount', Math.max(0, Math.floor(n)));
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
  onHome = false,
  onToggleHome,
}: {
  name: string;
  count?: number;
  smart?: boolean;
  previewBookIds?: string[];
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  onClick?: () => void;
  onDelete?: () => void;
  onHome?: boolean;
  onToggleHome?: () => void;
}) {
  const ids = (previewBookIds ?? []).map(String).filter(Boolean);
  const empty = count <= 0 && ids.length === 0;
  const countText = empty ? t('shelfCard.noBooksYet') : bookCountLabel(count);
  // Delete lives on long-press: a red bin on every card was noise and an easy mis-tap.
  const press = useLongPress(() => onClick?.(), onDelete);

  return (
    <div className={`flex items-stretch border-b last:border-b-0 ${theme.divider}`}>
      <button
        type="button"
        {...press}
        aria-description={onDelete ? t('common.holdToDeleteTheShelf') : undefined}
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
          {smart ? <Search className={`inline w-5 h-5 mr-1.5 -mt-1 ${theme.accentText}`} aria-label={t('common.smartShelf')} /> : null}
          {name}
        </p>
        <p className={`${textStyles.caption} ${theme.textMuted} mt-1`}>
          {smart ? t('shelfCard.smart', { countText }) : countText}
        </p>
      </button>
      {onToggleHome ? <ShelfHomeToggle name={name} onHome={onHome} onToggle={onToggleHome} /> : null}
    </div>
  );
}
