import React from 'react';
import { radii } from './tokens';

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
