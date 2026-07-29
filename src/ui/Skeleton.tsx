import React from 'react';
import { Loader2 } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, radii } from './tokens';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rect' | 'circle';
}

export default function Skeleton({ className = '', variant = 'rect' }: SkeletonProps) {
  const shape =
    variant === 'circle'
      ? 'rounded-full aspect-square'
      : variant === 'text'
        ? 'rounded h-4 w-full max-w-[80%]'
        : radii.md;
  return (
    <div
      className={`animate-pulse bg-[var(--app-panel-soft)] ${shape} ${className}`}
      aria-hidden
    />
  );
}

export function BookCardSkeleton() {
  return (
    <div className="flex gap-3 p-3 border border-[color:var(--app-border)] rounded-xl">
      <Skeleton className="w-12 h-16 shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton variant="text" className="max-w-[90%]" />
        <Skeleton variant="text" className="max-w-[60%] h-3" />
      </div>
    </div>
  );
}

export function BookListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <BookCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function BookGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="w-full aspect-[2/3]" />
          <Skeleton variant="text" className="max-w-[90%]" />
          <Skeleton variant="text" className="max-w-[55%] h-3" />
        </div>
      ))}
    </div>
  );
}

export function BookShelfSkeleton({
  count = 5,
  tileWidthPx = 110,
}: {
  count?: number;
  tileWidthPx?: number;
}) {
  return (
    <div className="flex gap-3 overflow-hidden" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="shrink-0 space-y-2" style={{ width: tileWidthPx }}>
          <Skeleton className="w-full aspect-[2/3]" />
          <Skeleton variant="text" className="max-w-full h-3" />
        </div>
      ))}
    </div>
  );
}

export function TextBlockSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2 py-2" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={i === lines - 1 ? 'max-w-[55%] h-3' : undefined}
        />
      ))}
    </div>
  );
}

export function ScreenLoader({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 min-h-[12rem]" role="status" aria-live="polite">
      <Loader2 className={`w-6 h-6 animate-spin ${theme.accentText}`} aria-hidden />
      <p className={`${textStyles.caption} ${theme.textMuted}`}>{label}</p>
    </div>
  );
}
