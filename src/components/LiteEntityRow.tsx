import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles, motion, radii, elevation } from '../ui/tokens';
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
  onClick,
  authorKey,
  serverConfig,
  storageDirectory,
}: LiteEntityRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-4 mb-3 ${radii.lg} ${theme.card} ${elevation.card} text-left ${theme.rowPress} ${motion.press} ${theme.focusRing}`}
    >
      {authorKey && serverConfig ? (
        <AuthorPortrait
          authorName={authorKey}
          serverConfig={serverConfig}
          storageDirectory={storageDirectory}
          size={36}
        />
      ) : null}
      <span className={`flex-1 min-w-0 ${textStyles.bodyBold} landscape:max-[500px]:text-xs truncate ${theme.text}`}>{name}</span>
      <span className={`shrink-0 ${textStyles.caption} ${theme.textMuted}`}>
        {bookCountLabel(count)}
      </span>
      <ChevronRight className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
    </button>
  );
}
