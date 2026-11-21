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

/**
 * A small library scene — a shelf with three books, one leaning — with the screen's icon in a round
 * badge: the same picture as the web empty states (`renderEmptyStateIllustration` on the server).
 * Books are tinted by the accent with fill-opacity, not color-mix() (Chrome 83 WebViews).
 */
function EmptyIllustration({ Icon }: { Icon: LucideIcon }) {
  return (
    <span className="relative mb-2 block" style={{ width: 132, height: 106 }} aria-hidden>
      <svg
        viewBox="0 0 120 96"
        width={132}
        height={106}
        fill="none"
        stroke="var(--app-muted)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse cx="58" cy="84" rx="44" ry="5" fill="var(--app-muted)" fillOpacity={0.14} stroke="none" />
        <path d="M14 80h88" />
        <rect x="24" y="36" width="14" height="44" rx="2" fill="var(--app-accent)" fillOpacity={0.16} />
        <rect x="40" y="27" width="16" height="53" rx="2" fill="var(--app-accent)" fillOpacity={0.3} />
        <rect x="60" y="41" width="12" height="39" rx="2" fill="var(--app-accent)" fillOpacity={0.1} transform="rotate(14 66 80)" />
        <path d="M28 46h6M28 70h6M44 37h8M44 71h8" />
        <circle cx="90" cy="36" r="17" fill="var(--app-surface)" stroke="var(--app-accent)" strokeOpacity={0.7} />
      </svg>
      {/* the badge circle sits at (90, 36) of 120×96 → 99, 40 px in the 132×106 box */}
      <Icon
        className="absolute text-[var(--app-accent)]"
        style={{ left: 99 - 11, top: 40 - 11, width: 22, height: 22 }}
        strokeWidth={1.75}
      />
    </span>
  );
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
      className={
        compact
          ? 'my-2 flex flex-col py-2 gap-1.5'
          : 'my-6 flex flex-col items-center text-center px-5 py-10 gap-2'
      }
      role={tone === 'error' || tone === 'offline' ? 'status' : undefined}
    >
      {compact ? (
        <Icon className={`w-5 h-5 ${iconTone}`} aria-hidden strokeWidth={1.75} />
      ) : tone === 'default' ? (
        <EmptyIllustration Icon={Icon} />
      ) : (
        <span className={`mb-2 w-16 h-16 rounded-full flex items-center justify-center ${theme.panel}`}>
          <Icon className={`w-7 h-7 ${iconTone}`} aria-hidden strokeWidth={1.75} />
        </span>
      )}
      <p className={`${textStyles.sectionLabel} ${titleTone}`}>{title}</p>
      {description && (
        <p className={`${textStyles.body} ${theme.textMuted} max-w-sm`}>{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-3">
          <Button variant={actionVariant} onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
