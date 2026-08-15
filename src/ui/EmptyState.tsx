import React from 'react';
import { LucideIcon } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic, radii, elevation } from './tokens';
import Button from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: 'primary' | 'secondary';
  tone?: 'default' | 'error' | 'offline';
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionVariant = 'secondary',
  tone = 'default',
}: EmptyStateProps) {
  const iconTone =
    tone === 'error' ? semantic.error : tone === 'offline' ? semantic.offline : theme.accentText;
  const titleTone =
    tone === 'error' ? semantic.error : tone === 'offline' ? semantic.offline : theme.text;

  return (
    <div
      className={`my-6 flex flex-col items-center justify-center px-6 py-10 text-center gap-3 ${radii.lg} ${theme.card} ${elevation.card} mx-1`}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <span className={`inline-flex items-center justify-center w-14 h-14 ${radii.full} ${theme.accentMuted}`}>
        <Icon className={`w-7 h-7 ${iconTone}`} aria-hidden strokeWidth={1.75} />
      </span>
      <p className={`${textStyles.sectionLabel} ${titleTone}`}>{title}</p>
      {description && (
        <p className={`${textStyles.body} ${theme.textMuted} max-w-xs leading-relaxed`}>{description}</p>
      )}
      {actionLabel && onAction && (
        <Button variant={actionVariant} onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
