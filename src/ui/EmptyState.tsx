import React from 'react';
import { LucideIcon } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic } from './tokens';
import Button from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: 'primary' | 'secondary';
  tone?: 'default' | 'error' | 'offline';
  /** Section-level (home/catalog), not a full-screen placeholder. */
  compact?: boolean;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionVariant = 'secondary',
  tone = 'default',
  compact = false,
}: EmptyStateProps) {
  const iconTone =
    tone === 'error' ? semantic.error : tone === 'offline' ? semantic.offline : theme.textMuted;
  const titleTone =
    tone === 'error' ? semantic.error : tone === 'offline' ? semantic.offline : theme.text;

  return (
    <div
      className={compact ? 'my-2 flex flex-col py-2 gap-1.5' : 'my-6 flex flex-col px-5 py-8 gap-2'}
      role={tone === 'error' || tone === 'offline' ? 'status' : undefined}
    >
      <Icon className={`w-5 h-5 ${iconTone}`} aria-hidden strokeWidth={1.75} />
      <p className={`${textStyles.sectionLabel} ${titleTone}`}>{title}</p>
      {description && (
        <p className={`${textStyles.body} ${theme.textMuted} max-w-sm`}>{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-2">
          <Button variant={actionVariant} onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
