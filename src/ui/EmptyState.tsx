import React from 'react';
import { LucideIcon } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, radii, semantic } from './tokens';
import Button from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Primary CTA for errors/offline; secondary stays muted for empty lists. */
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
    tone === 'error' ? semantic.error : tone === 'offline' ? semantic.offline : theme.textMuted;
  const borderTone =
    tone === 'error'
      ? 'border-[color-mix(in_srgb,var(--app-danger)_35%,var(--app-border))]'
      : tone === 'offline'
        ? 'border-[color-mix(in_srgb,var(--app-offline)_35%,var(--app-border))]'
        : '';

  return (
    <div
      className={`my-6 flex flex-col items-center justify-center px-6 py-10 text-center gap-3 border ${radii.lg} ${theme.panel} ${borderTone}`}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <div className={`w-14 h-14 ${radii.full} flex items-center justify-center ${theme.iconBg}`}>
        <Icon className={`w-7 h-7 ${iconTone}`} aria-hidden />
      </div>
      <p className={`${textStyles.title} ${theme.text}`}>{title}</p>
      {description && (
        <p className={`${textStyles.caption} ${theme.textMuted} max-w-xs leading-relaxed`}>{description}</p>
      )}
      {actionLabel && onAction && (
        <Button variant={actionVariant} onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
