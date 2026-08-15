import React from 'react';
import { ChevronRight } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, motion, radii, elevation } from '../ui/tokens';
import { ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import AuthorPortrait from './AuthorPortrait';
import BookCover from './BookCover';

function bookCountLabel(n: number): string {
  const v = Math.max(0, Math.floor(n));
  const mod10 = v % 10;
  const mod100 = v % 100;
  if (mod10 === 1 && mod100 !== 11) return `${v} книга`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${v} книги`;
  return `${v} книг`;
}

function CoverStrip({
  bookIds,
  serverConfig,
  storageDirectory,
}: {
  bookIds: string[];
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
}) {
  const ids = bookIds.map(String).filter(Boolean).slice(0, 4);
  if (!ids.length) return null;
  return (
    <div className="flex items-end gap-1.5 mt-2" aria-hidden>
      {ids.map((id) => (
        <BookCover
          key={id}
          bookId={id}
          serverConfig={serverConfig}
          storageDirectory={storageDirectory}
          variant="thumb"
          width={36}
          height={52}
          className={`rounded-lg ${theme.coverBorder}`}
        />
      ))}
    </div>
  );
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
      className={`w-full flex items-center gap-4 p-4 mb-3 ${radii.lg} ${theme.card} ${elevation.card} text-left ${theme.rowPress} ${motion.press} ${theme.focusRing}`}
    >
      {showAuthor ? (
        <AuthorPortrait
          authorName={authorKey!}
          serverConfig={serverConfig!}
          storageDirectory={storageDirectory}
          coverBookId={coverBookId}
          size={48}
        />
      ) : null}
      <span className="flex-1 min-w-0">
        <span className={`block ${textStyles.bodyBold} truncate ${theme.text}`}>
          {name}
        </span>
        {showCount ? (
          <span className={`block ${textStyles.caption} ${theme.textMuted} mt-0.5`}>{bookCountLabel(count!)}</span>
        ) : null}
        {showStrip ? (
          <CoverStrip
            bookIds={previewIds}
            serverConfig={serverConfig!}
            storageDirectory={storageDirectory}
          />
        ) : null}
      </span>
      <ChevronRight className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
    </button>
  );
}
