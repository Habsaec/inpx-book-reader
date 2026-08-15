import React from 'react';
import { Loader2 } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, radii, elevation } from './tokens';

interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'block';
  /** Shorter alias for compact meta lines under covers */
  blockSize?: 'sm' | 'md' | 'lg';
}

export default function Skeleton({ className = '', variant = 'rect', blockSize = 'md' }: SkeletonProps) {
  const blockHeights = { sm: 'h-2.5', md: 'h-3.5', lg: 'h-4' } as const;
  const shape =
    variant === 'circle'
      ? 'rounded-full aspect-square'
      : variant === 'block'
        ? `rounded-xl ${blockHeights[blockSize]} w-full`
        : radii.lg;
  return (
    <div
      className={`inpx-skeleton-pulse bg-[color-mix(in_srgb,var(--app-panel-soft)_82%,var(--app-border))] ${shape} ${className}`}
      aria-hidden
    />
  );
}

export function BookCardSkeleton() {
  return (
    <div className={`flex gap-4 p-4 mb-3 ${radii.lg} ${theme.card} ${elevation.card}`}>
      <Skeleton className="w-[72px] h-[108px] shrink-0" />
      <div className="flex-1 space-y-3 py-1">
        <Skeleton variant="block" blockSize="lg" className="max-w-[92%]" />
        <Skeleton variant="block" blockSize="md" className="max-w-[68%]" />
        <Skeleton variant="block" blockSize="sm" className="max-w-[42%]" />
      </div>
    </div>
  );
}

export function BookListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: count }, (_, i) => (
        <BookCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function BookGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 min-[480px]:grid-cols-4 min-[640px]:grid-cols-5 gap-4 w-full min-w-0" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="min-w-0 w-full space-y-3">
          <Skeleton className="w-full aspect-[2/3]" />
          <Skeleton variant="block" blockSize="lg" className="max-w-[95%]" />
          <Skeleton variant="block" blockSize="md" className="max-w-[72%]" />
          <Skeleton variant="block" blockSize="sm" className="max-w-[48%]" />
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
    <div className="flex gap-4 overflow-hidden" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="shrink-0 space-y-3" style={{ width: tileWidthPx }}>
          <Skeleton className="w-full aspect-[2/3]" />
          <Skeleton variant="block" blockSize="md" className="max-w-full" />
          <Skeleton variant="block" blockSize="sm" className="max-w-[70%]" />
        </div>
      ))}
    </div>
  );
}

export function TextBlockSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 py-2" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          variant="block"
          blockSize={i === lines - 1 ? 'sm' : 'md'}
          className={i === lines - 1 ? 'max-w-[55%]' : i === 0 ? 'max-w-full' : 'max-w-[85%]'}
        />
      ))}
    </div>
  );
}

export function ScreenLoader({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 min-h-[12rem] inpx-screen-enter" role="status" aria-live="polite">
      <span className={`inline-flex items-center justify-center w-14 h-14 ${radii.full} ${theme.accentMuted}`}>
        <Loader2 className={`w-6 h-6 animate-spin ${theme.accentText}`} aria-hidden />
      </span>
      <p className={`${textStyles.body} ${theme.textMuted}`}>{label}</p>
    </div>
  );
}
