import React from 'react';
import { User } from 'lucide-react';
import { ServerConfig } from '../types';
import { fetchAuthorPortraitBlob } from '../lib/inpxClient';

const portraitCache = new Map<string, string>();

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
}

export default function AuthorPortrait({
  authorName,
  serverConfig,
  className = '',
  size = 48,
}: AuthorPortraitProps) {
  const [src, setSrc] = React.useState<string | null>(() => portraitCache.get(authorName) ?? null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const cached = portraitCache.get(authorName);
    if (cached) {
      setSrc(cached);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setFailed(false);
    setSrc(null);

    fetchAuthorPortraitBlob(serverConfig, authorName)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setFailed(true);
          return;
        }
        const url = URL.createObjectURL(blob);
        portraitCache.set(authorName, url);
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authorName, serverConfig.url, serverConfig.username, serverConfig.password]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`rounded-full object-cover border shrink-0 bg-[var(--app-panel-soft)] ${className}`}
      />
    );
  }

  return (
    <div
      className={`rounded-full border shrink-0 flex items-center justify-center font-black text-[var(--app-text-muted)] bg-[var(--app-panel-soft)] ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.28)) }}
      aria-hidden
    >
      {failed ? <User style={{ width: size * 0.45, height: size * 0.45 }} className="opacity-60" /> : authorInitials(authorName)}
    </div>
  );
}
