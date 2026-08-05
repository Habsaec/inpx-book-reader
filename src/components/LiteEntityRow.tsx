import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles, motion } from '../ui/tokens';
import { ChevronRight } from 'lucide-react';
import { ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import AuthorPortrait from './AuthorPortrait';

interface LiteEntityRowProps {
  name: string;
  count: number;
  isAppDark?: boolean;
  onClick?: () => void;
  authorKey?: string;
  serverConfig?: ServerConfig;
  storageDirectory?: StorageDirectory | null;
}

function bookCountLabel(n: number): string {
  const v = Math.max(0, Math.floor(n));
  const mod10 = v % 10;
  const mod100 = v % 100;
  if (mod10 === 1 && mod100 !== 11) return `${v} книга`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${v} книги`;
  return `${v} книг`;
}

export default function LiteEntityRow({
  name,
  count,
  isAppDark = false,
  onClick,
  authorKey,
  serverConfig,
  storageDirectory,
}: LiteEntityRowProps) {
  const borderColor = theme.divider;
  const titleColor = theme.text;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 py-3 landscape:max-[500px]:py-2 px-1 rounded-xl -mx-1 border-b last:border-b-0 text-left ${borderColor} ${theme.rowPress} ${motion.colors} ${theme.focusRing}`}
    >
      {authorKey && serverConfig ? (
        <AuthorPortrait
          authorName={authorKey}
          serverConfig={serverConfig}
          storageDirectory={storageDirectory}
          size={36}
        />
      ) : null}
      <span className={`flex-1 min-w-0 ${textStyles.bodyBold} landscape:max-[500px]:text-xs truncate ${titleColor}`}>{name}</span>
      <span className={`shrink-0 ${textStyles.caption} ${theme.textMuted}`}>
        {bookCountLabel(count)}
      </span>
      <ChevronRight className={`w-4 h-4 shrink-0 opacity-40 ${titleColor}`} aria-hidden />
    </button>
  );
}
