import React from 'react';
import { User } from 'lucide-react';
import { ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import {
  peekCoverMemory,
  peekPortraitMemory,
  resolveAuthorPortraitUrl,
  resolveCoverUrl,
} from '../lib/coverCache';

function authorInitials(name: string): string {
  const parts = name.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

interface AuthorPortraitProps {
  authorName: string;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  className?: string;
  size?: number;
  /** Fallback: cover of most popular book (server favorites parity). */
  coverBookId?: string | null;
}

function AvatarFrame({
  size,
  className,
  children,
}: {
  size: number;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden rounded-full border bg-[var(--app-panel-soft)] ${className}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size, maxWidth: size, maxHeight: size }}
      aria-hidden
    >
      {children}
    </span>
  );
}

export default function AuthorPortrait({
  authorName,
  serverConfig,
  storageDirectory,
  className = '',
  size = 48,
  coverBookId,
}: AuthorPortraitProps) {
  const coverId = coverBookId != null && String(coverBookId).trim() ? String(coverBookId) : '';
  const [src, setSrc] = React.useState<string | null>(() => peekPortraitMemory(authorName));
  const [coverSrc, setCoverSrc] = React.useState<string | null>(() =>
    coverId ? peekCoverMemory(coverId, 'thumb') : null,
  );
  const [portraitFailed, setPortraitFailed] = React.useState(false);
  const [coverFailed, setCoverFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setPortraitFailed(false);

    const mem = peekPortraitMemory(authorName);
    if (mem) {
      setSrc(mem);
      return;
    }
    setSrc(null);

    void resolveAuthorPortraitUrl({
      authorName,
      directory: storageDirectory,
      config: serverConfig,
    }).then((url) => {
      if (cancelled) return;
      if (url) {
        setSrc(url);
        return;
      }
      setPortraitFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [
    authorName,
    storageDirectory?.uri,
    serverConfig.url,
    serverConfig.username,
    serverConfig.password,
    serverConfig.deviceToken,
    serverConfig.connectionStatus,
  ]);

  React.useEffect(() => {
    if (!portraitFailed || !coverId) {
      setCoverSrc(coverId ? peekCoverMemory(coverId, 'thumb') : null);
      setCoverFailed(false);
      return;
    }

    let cancelled = false;
    setCoverFailed(false);

    const mem = peekCoverMemory(coverId, 'thumb');
    if (mem) {
      setCoverSrc(mem);
      return;
    }
    setCoverSrc(null);

    void resolveCoverUrl({
      bookId: coverId,
      variant: 'thumb',
      directory: storageDirectory,
      config: serverConfig,
    }).then((url) => {
      if (cancelled) return;
      if (url) {
        setCoverSrc(url);
        return;
      }
      setCoverFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [
    portraitFailed,
    coverId,
    storageDirectory?.uri,
    serverConfig.url,
    serverConfig.username,
    serverConfig.password,
    serverConfig.deviceToken,
    serverConfig.connectionStatus,
  ]);

  if (src && !portraitFailed) {
    return (
      <AvatarFrame size={size} className={className}>
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      </AvatarFrame>
    );
  }

  if (portraitFailed && coverSrc && !coverFailed) {
    return (
      <AvatarFrame size={size} className={className}>
        <img
          src={coverSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          onError={() => setCoverFailed(true)}
        />
      </AvatarFrame>
    );
  }

  return (
    <AvatarFrame size={size} className={className}>
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold text-[var(--app-muted)]"
        style={{ fontSize: Math.max(10, Math.round(size * 0.28)) }}
      >
        {portraitFailed ? (
          <User style={{ width: size * 0.45, height: size * 0.45 }} className="opacity-60" />
        ) : (
          authorInitials(authorName)
        )}
      </span>
    </AvatarFrame>
  );
}
