import React from 'react';
import { User } from 'lucide-react';
import { ServerConfig } from '../types';
import { fetchAuthorPortraitBlob, fetchCoverBlob } from '../lib/inpxClient';

const portraitCache = new Map<string, string>();
const coverFallbackCache = new Map<string, string>();

function authorInitials(name: string): string {
  const parts = name.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

interface AuthorPortraitProps {
  authorName: string;
  serverConfig: ServerConfig;
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
  className = '',
  size = 48,
  coverBookId,
}: AuthorPortraitProps) {
  const coverId = coverBookId != null && String(coverBookId).trim() ? String(coverBookId) : '';
  const [src, setSrc] = React.useState<string | null>(() => portraitCache.get(authorName) ?? null);
  const [coverSrc, setCoverSrc] = React.useState<string | null>(() =>
    coverId ? coverFallbackCache.get(coverId) ?? null : null,
  );
  const [portraitFailed, setPortraitFailed] = React.useState(false);
  const [coverFailed, setCoverFailed] = React.useState(false);

  React.useEffect(() => {
    const cached = portraitCache.get(authorName);
    if (cached) {
      setSrc(cached);
      setPortraitFailed(false);
      return;
    }

    let cancelled = false;
    setPortraitFailed(false);
    setSrc(null);

    fetchAuthorPortraitBlob(serverConfig, authorName)
      .then((blob) => {
        if (cancelled) return;
        if (!blob || blob.size < 32) {
          setPortraitFailed(true);
          return;
        }
        const url = URL.createObjectURL(blob);
        portraitCache.set(authorName, url);
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setPortraitFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authorName, serverConfig.url, serverConfig.username, serverConfig.password, serverConfig.deviceToken]);

  React.useEffect(() => {
    if (!portraitFailed || !coverId) {
      setCoverSrc(coverId ? coverFallbackCache.get(coverId) ?? null : null);
      setCoverFailed(false);
      return;
    }

    const cached = coverFallbackCache.get(coverId);
    if (cached) {
      setCoverSrc(cached);
      setCoverFailed(false);
      return;
    }

    let cancelled = false;
    setCoverFailed(false);
    setCoverSrc(null);

    fetchCoverBlob(serverConfig, coverId, 'thumb')
      .then((blob) => {
        if (cancelled) return;
        if (!blob || blob.size < 32) {
          setCoverFailed(true);
          return;
        }
        const url = URL.createObjectURL(blob);
        coverFallbackCache.set(coverId, url);
        setCoverSrc(url);
      })
      .catch(() => {
        if (!cancelled) setCoverFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    portraitFailed,
    coverId,
    serverConfig.url,
    serverConfig.username,
    serverConfig.password,
    serverConfig.deviceToken,
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
