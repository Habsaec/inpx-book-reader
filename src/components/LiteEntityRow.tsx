import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles, motion } from '../ui/tokens';
import { ChevronRight } from 'lucide-react';
import { ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import AuthorPortrait from './AuthorPortrait';
import { tn } from '../i18n';

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
  return tn('common.booksCount', Math.max(0, Math.floor(n)));
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
      className={`w-full flex items-center gap-3.5 min-h-[3.75rem] py-2.5 px-0.5 text-left border-b ${theme.divider} ${theme.rowPress} ${motion.press} ${theme.focusRing}`}
    >
      {authorKey && serverConfig ? (
        <AuthorPortrait
          authorName={authorKey}
          serverConfig={serverConfig}
          storageDirectory={storageDirectory}
          size={44}
        />
      ) : null}
      <span className="flex-1 min-w-0">
        <span className={`block ${textStyles.bodyBold} landscape:max-[500px]:text-xs truncate ${theme.text}`}>{name}</span>
        <span className={`block ${textStyles.caption} ${theme.textMuted}`}>{bookCountLabel(count)}</span>
      </span>
      <ChevronRight className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
    </button>
  );
}
