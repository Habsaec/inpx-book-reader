import React from 'react';
import { ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import {
  peekCoverMemory,
  peekPortraitMemory,
  isPortraitMissCached,
  resolveAuthorPortraitUrl,
  resolveCoverUrl,
} from '../lib/coverCache';

/**
 * Placeholder letters: first letter of the NAME + first letter of the SURNAME. The author key is the INPX form
 * `Surname,Name,Patronymic` (→ «ФД» for Достоевский,Фёдор); a plain «Name Surname» uses its first two words;
 * a single word gives its first two letters (same rule as the web `authorInitials`).
 */
export function authorInitials(name: string): string {
  const raw = (name || '').split(':')[0].trim();
  const letter = (word: string | undefined) => (word ?? '').match(/\p{L}/u)?.[0]?.toLocaleUpperCase() ?? '';
  if (raw.includes(',')) {
    const [surname, given] = raw.split(',').map((part) => part.trim());
    const pair = `${letter(given)}${letter(surname)}`;
    if (pair) return pair;
  }
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${letter(words[0])}${letter(words[1])}`;
  return (words[0] ?? '').replace(/[^\p{L}]/gu, '').slice(0, 2).toLocaleUpperCase() || '?';
}

interface AuthorPortraitProps {
  authorName: string;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  className?: string;
  size?: number;
  /** Fallback: cover of most popular book (server favorites parity). */
  coverBookId?: string | null;
  /** Skip network when server says author has no portrait (grouped endpoint). */
  hasPortrait?: boolean;
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
      className={`relative inline-block shrink-0 overflow-hidden rounded-full bg-[var(--app-card-bg)] ${className}`}
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
  hasPortrait,
}: AuthorPortraitProps) {
  const coverId = coverBookId != null && String(coverBookId).trim() ? String(coverBookId) : '';
  const skipPortraitFetch = hasPortrait === false || isPortraitMissCached(authorName);
  const [src, setSrc] = React.useState<string | null>(() =>
    skipPortraitFetch ? null : peekPortraitMemory(authorName),
  );
  const [coverSrc, setCoverSrc] = React.useState<string | null>(() =>
    coverId ? peekCoverMemory(coverId, 'thumb') : null,
  );
  const [portraitFailed, setPortraitFailed] = React.useState(false);
  const [coverFailed, setCoverFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setPortraitFailed(false);

    if (skipPortraitFetch) {
      setSrc(null);
      setPortraitFailed(true);
      return () => {
        cancelled = true;
      };
    }

    const mem = peekPortraitMemory(authorName);
    if (mem) {
      setSrc(mem);
      return () => {
        cancelled = true;
      };
    }
    setSrc(null);

    void resolveAuthorPortraitUrl({
      authorName,
      directory: storageDirectory,
      config: serverConfig,
      hasPortrait,
    }).then((url) => {
      if (cancelled) return;
      if (url) {
        setSrc(url);
        return;
      }
      setPortraitFailed(true);
    }).catch(() => {
      if (!cancelled) setPortraitFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [
    authorName,
    hasPortrait,
    skipPortraitFetch,
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
      return () => {
        cancelled = true;
      };
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
    }).catch(() => {
      if (!cancelled) setCoverFailed(true);
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
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          onError={() => {
            setPortraitFailed(true);
            setSrc(null);
          }}
        />
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
        {authorInitials(authorName)}
      </span>
    </AvatarFrame>
  );
}
