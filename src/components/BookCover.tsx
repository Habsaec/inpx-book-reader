import React from 'react';
import { ServerConfig } from '../types';
import { fetchCoverBlob } from '../lib/inpxClient';
import type { StorageDirectory } from '../lib/storageDirectory';
import { readCoverFromDirectory, saveCoverToDirectory } from '../lib/coverCache';

const blobCache = new Map<string, string>();

function cacheKey(bookId: string, variant: 'thumb' | 'full') {
  return `${variant}:${bookId}`;
}

interface BookCoverProps {
  bookId: string;
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  variant?: 'thumb' | 'full';
  title?: string;
  author?: string;
  className?: string;
  width?: number;
  height?: number;
}

export default function BookCover({
  bookId,
  serverConfig,
  storageDirectory,
  variant = 'thumb',
  title = '',
  author = '',
  className = '',
  width,
  height,
}: BookCoverProps) {
  const [src, setSrc] = React.useState<string | null>(() => blobCache.get(cacheKey(bookId, variant)) ?? null);
  const [failed, setFailed] = React.useState(false);

  const useServer =
    serverConfig &&
    serverConfig.url &&
    serverConfig.connectionStatus === 'connected';

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setFailed(false);

      const key = cacheKey(bookId, variant);
      const memCached = blobCache.get(key);
      if (memCached) {
        setSrc(memCached);
        return;
      }

      if (storageDirectory?.uri) {
        const localUrl = await readCoverFromDirectory(storageDirectory, bookId, variant);
        if (cancelled) return;
        if (localUrl) {
          blobCache.set(key, localUrl);
          setSrc(localUrl);
          return;
        }
      }

      if (!useServer) {
        setSrc(null);
        return;
      }

      try {
        const blob = await fetchCoverBlob(serverConfig!, bookId, variant);
        if (cancelled || !blob) {
          if (!cancelled) setFailed(true);
          return;
        }
        if (storageDirectory?.uri) {
          void saveCoverToDirectory(storageDirectory, bookId, blob, variant);
        }
        const url = URL.createObjectURL(blob);
        blobCache.set(key, url);
        if (!cancelled) setSrc(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    bookId,
    variant,
    useServer,
    storageDirectory?.uri,
    serverConfig?.url,
    serverConfig?.username,
    serverConfig?.password,
  ]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        className={`block object-cover border rounded pointer-events-none ${className.includes('inset-0') || className.includes('h-full') ? 'w-full h-full' : ''} ${className}`}
        loading="lazy"
        draggable={false}
      />
    );
  }

  const hue = ((author || title).charCodeAt(0) + (author || title).charCodeAt(1) || 0) % 360;
  const hue2 = (hue + 42) % 360;
  const w = width ?? (variant === 'full' ? 180 : 72);
  const h = height ?? (variant === 'full' ? 270 : 108);

  return (
    <div
      className={`flex-shrink-0 flex flex-col justify-between p-1.5 shadow-sm border border-black/10 rounded overflow-hidden pointer-events-none ${className}`}
      style={{
        width: w,
        height: h,
        background: `linear-gradient(145deg, hsl(${hue}, 72%, 52%) 0%, hsl(${hue2}, 68%, 38%) 100%)`,
      }}
    >
      {title ? (
        <>
          <span className="text-[6px] font-bold text-white/85 uppercase tracking-widest truncate opacity-80">📖</span>
          <h4 className="text-[8px] font-bold text-white line-clamp-4 text-center leading-tight">{title}</h4>
          {author ? <span className="text-[7px] font-medium text-white/70 truncate text-center">{author}</span> : null}
        </>
      ) : (
        <span className="text-white/60 text-lg m-auto">📖</span>
      )}
    </div>
  );
}
