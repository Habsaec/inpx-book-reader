import React from 'react';
import { LucideIcon } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles } from './tokens';
import Button from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center gap-3">
      <Icon className={`w-10 h-10 ${theme.textMuted}`} aria-hidden />
      <p className={`${textStyles.title} ${theme.text}`}>{title}</p>
      {description && (
        <p className={`${textStyles.caption} ${theme.textMuted} max-w-xs`}>{description}</p>
      )}
      {actionLabel && onAction && (
        <Button variant="secondary" onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
