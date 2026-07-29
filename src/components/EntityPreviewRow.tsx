import React from 'react';
import { ChevronRight } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, motion } from '../ui/tokens';
import { ServerConfig } from '../types';
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

/** Cover strip like server `.shelf-covers-preview` — loads via auth-aware BookCover. */
function CoverStrip({
  bookIds,
  serverConfig,
}: {
  bookIds: string[];
  serverConfig: ServerConfig;
}) {
  const ids = bookIds.map(String).filter(Boolean).slice(0, 4);
  if (!ids.length) return null;
  return (
    <div className="flex items-end gap-1 mt-1.5" aria-hidden>
      {ids.map((id) => (
        <BookCover
          key={id}
          bookId={id}
          serverConfig={serverConfig}
          variant="thumb"
          width={36}
          height={52}
          className={`rounded-[3px] ${theme.coverBorder}`}
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
  /** Author portrait key; when set, shows avatar (+ optional coverBookId fallback). */
  authorKey?: string;
  coverBookId?: string | null;
  /** Series / shelf cover previews. */
  previewBookIds?: string[];
}

export default function EntityPreviewRow({
  name,
  count,
  onClick,
  serverConfig,
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
      className={`w-full flex items-center gap-3 py-3 landscape:max-[500px]:py-2 px-1 rounded-xl -mx-1 border-b last:border-b-0 text-left ${theme.divider} ${theme.rowPress} ${motion.colors} ${theme.focusRing}`}
    >
      {showAuthor ? (
        <AuthorPortrait
          authorName={authorKey!}
          serverConfig={serverConfig!}
          coverBookId={coverBookId}
          size={48}
        />
      ) : null}
      <span className="flex-1 min-w-0">
        <span className={`block ${textStyles.bodyBold} landscape:max-[500px]:text-xs truncate ${theme.text}`}>
          {name}
        </span>
        {showCount ? (
          <span className={`block ${textStyles.caption} ${theme.textMuted}`}>{bookCountLabel(count!)}</span>
        ) : null}
        {showStrip ? <CoverStrip bookIds={previewIds} serverConfig={serverConfig!} /> : null}
      </span>
      <ChevronRight className={`w-4 h-4 shrink-0 opacity-40 ${theme.text}`} aria-hidden />
    </button>
  );
}
