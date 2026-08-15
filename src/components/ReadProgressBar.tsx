import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic } from '../ui/tokens';

interface ReadProgressBarProps {
  value: number;
  showLabel?: boolean;
  className?: string;
}

export default function ReadProgressBar({ value, showLabel = true, className = '' }: ReadProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  if (pct <= 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="flex-1 h-1 rounded-full bg-[var(--app-surface-container-highest)] overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Прогресс чтения ${pct}%`}
      >
        <div
          className={`h-full transition-all duration-300 ${pct >= 100 ? 'bg-[var(--app-success)]' : theme.progress}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={`${textStyles.microBold} tabular-nums shrink-0 ${theme.textMuted}`}>{pct}%</span>
      )}
    </div>
  );
}
