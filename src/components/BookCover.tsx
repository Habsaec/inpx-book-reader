import React from 'react';
import { ServerConfig } from '../types';
import { fetchCoverBlob } from '../lib/inpxClient';
import type { StorageDirectory } from '../lib/storageDirectory';
import { readCoverFromDirectory, saveCoverToDirectory } from '../lib/coverCache';
/** Same asset as INPX Library Server `public/book-fallback.png` — bundled for APK. */
import bookFallbackPng from '../assets/book-fallback.png';

const blobCache = new Map<string, string>();

function cacheKey(bookId: string, variant: 'thumb' | 'full') {
  return `${variant}:${bookId}`;
}

function fillsParent(className: string): boolean {
  return (
    className.includes('inset-0') ||
    className.includes('h-full') ||
    className.includes('w-full') ||
    className.includes('absolute')
  );
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

function CoverFallback({
  title,
  author,
  className,
  width,
  height,
  variant,
}: {
  title: string;
  author: string;
  className: string;
  width?: number;
  height?: number;
  variant: 'thumb' | 'full';
}) {
  const fill = fillsParent(className);
  const w = width ?? (variant === 'full' ? 180 : 72);
  const h = height ?? (variant === 'full' ? 270 : 108);
  const [imgOk, setImgOk] = React.useState(true);

  return (
    <div
      className={`relative overflow-hidden rounded pointer-events-none border border-black/10 ${fill ? 'w-full h-full min-h-0' : 'flex-shrink-0'} ${className}`}
      style={{
        ...(fill ? undefined : { width: w, height: h }),
        containerType: 'size',
        background: imgOk ? undefined : 'linear-gradient(180deg, #181410 0%, #100e0b 100%)',
      }}
    >
      {imgOk && (
        <img
          src={bookFallbackPng}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
          onError={() => setImgOk(false)}
        />
      )}
      <span
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(13, 13, 20, 0.18) 0%, rgba(13, 13, 20, 0.48) 100%)',
        }}
        aria-hidden
      />
      {(title || author) && (
        <span
          className="absolute flex flex-col items-center justify-start gap-[0.35em] text-center overflow-hidden box-border z-[1]"
          style={{ inset: '11% 15% 28%' }}
        >
          {title ? (
            <span
              className="w-full font-bold text-[#f6f1e6] line-clamp-6 [overflow-wrap:anywhere]"
              style={{
                fontSize: 'clamp(9px, 7cqi, 18px)',
                lineHeight: 1.14,
                letterSpacing: '0.015em',
                textShadow: '0 1px 3px rgba(0,0,0,.65), 0 0 1px rgba(0,0,0,.4)',
              }}
            >
              {title}
            </span>
          ) : null}
          {author ? (
            <span
              className="w-full italic text-[#f6f1e6]/80 line-clamp-2 [overflow-wrap:anywhere]"
              style={{
                fontSize: 'clamp(7px, 4.2cqi, 12px)',
                lineHeight: 1.22,
                letterSpacing: '0.02em',
                textShadow: '0 1px 2px rgba(0,0,0,.55)',
              }}
            >
              {author}
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
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
        setFailed(true);
        return;
      }

      try {
        const blob = await fetchCoverBlob(serverConfig!, bookId, variant);
        if (cancelled || !blob || blob.size < 32) {
          if (!cancelled) {
            setSrc(null);
            setFailed(true);
          }
          return;
        }
        if (storageDirectory?.uri) {
          void saveCoverToDirectory(storageDirectory, bookId, blob, variant);
        }
        const url = URL.createObjectURL(blob);
        blobCache.set(key, url);
        if (!cancelled) setSrc(url);
      } catch {
        if (!cancelled) {
          setSrc(null);
          setFailed(true);
        }
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
    const fill = fillsParent(className);
    return (
      <img
        src={src}
        alt=""
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        className={`block object-cover border rounded pointer-events-none ${fill ? 'w-full h-full max-w-full max-h-full' : ''} ${className}`}
        style={fill ? { objectFit: 'cover', width: '100%', height: '100%' } : undefined}
        loading="lazy"
        draggable={false}
        onError={() => {
          setFailed(true);
          setSrc(null);
        }}
      />
    );
  }

  return (
    <CoverFallback
      title={title}
      author={author}
      className={className}
      width={width}
      height={height}
      variant={variant}
    />
  );
}
