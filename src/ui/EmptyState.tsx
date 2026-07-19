import React from 'react';

import { LucideIcon } from 'lucide-react';

import { theme } from '../lib/appTheme';

import { textStyles, radii } from './tokens';

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

    <div className={`mx-4 my-6 flex flex-col items-center justify-center px-6 py-10 text-center gap-3 border ${radii.lg} ${theme.panel}`}>

      <div className={`w-14 h-14 ${radii.full} flex items-center justify-center ${theme.iconBg}`}>

        <Icon className={`w-7 h-7 ${theme.textMuted}`} aria-hidden />

      </div>

      <p className={`${textStyles.title} ${theme.text}`}>{title}</p>

      {description && (

        <p className={`${textStyles.caption} ${theme.textMuted} max-w-xs leading-relaxed`}>{description}</p>

      )}

      {actionLabel && onAction && (

        <Button variant="secondary" onClick={onAction} className="mt-1">

          {actionLabel}

        </Button>

      )}

    </div>

  );

}

