import React from 'react';
import { ChevronRight } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, motion } from '../ui/tokens';
import { ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import AuthorPortrait from './AuthorPortrait';
import ShelfCoverStack from './shelves/ShelfCoverStack';

function bookCountLabel(n: number): string {
  const v = Math.max(0, Math.floor(n));
  const mod10 = v % 10;
  const mod100 = v % 100;
  if (mod10 === 1 && mod100 !== 11) return `${v} книга`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${v} книги`;
  return `${v} книг`;
}

export interface EntityPreviewRowProps {
  name: string;
  count?: number;
  onClick?: () => void;
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  authorKey?: string;
  coverBookId?: string | null;
  previewBookIds?: string[];
}

export default function EntityPreviewRow({
  name,
  count,
  onClick,
  serverConfig,
  storageDirectory,
  authorKey,
  coverBookId,
  previewBookIds,
}: EntityPreviewRowProps) {
  const showAuthor = Boolean(authorKey && serverConfig);
  const previewIds = (previewBookIds ?? []).map(String).filter(Boolean);
  const showStrip = Boolean(serverConfig && previewIds.length > 0 && !showAuthor);
  const showCount = typeof count === 'number' && Number.isFinite(count) && count >= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 min-h-12 py-3 border-b last:border-b-0 text-left ${theme.divider} ${theme.rowPress} ${motion.press} ${theme.focusRing}`}
    >
      {showAuthor ? (
        <AuthorPortrait
          authorName={authorKey!}
          serverConfig={serverConfig!}
          storageDirectory={storageDirectory}
          coverBookId={coverBookId}
          size={48}
        />
      ) : showStrip ? (
        <ShelfCoverStack
          bookIds={previewIds}
          serverConfig={serverConfig!}
          storageDirectory={storageDirectory}
        />
      ) : null}
      <span className="flex-1 min-w-0">
        <span className={`block ${textStyles.bodyBold} truncate ${theme.text}`}>
          {name}
        </span>
        {showCount ? (
          <span className={`block ${textStyles.caption} ${theme.textMuted} mt-0.5`}>{bookCountLabel(count!)}</span>
        ) : null}
      </span>
      <ChevronRight className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
    </button>
  );
}
