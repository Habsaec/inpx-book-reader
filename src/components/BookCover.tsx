import React from 'react';
import { ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { peekCoverMemory, resolveCoverUrl } from '../lib/coverCache';
/** Same assets as INPX Library Server `public/book-fallback.png` / `book-fallback-light.png`
 *  (dark leather, light parchment) — bundled for the APK, picked by `html[data-theme]` in index.css. */
import bookFallbackPng from '../assets/book-fallback.png';
import bookFallbackLightPng from '../assets/book-fallback-light.png';
import { useCustomCoverFallbackUrl } from '../lib/coverFallbackStyle';

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
  // An image uploaded in the server admin replaces both bundled ones; offline or broken → bundled.
  const customUrl = useCustomCoverFallbackUrl();
  const [customFailed, setCustomFailed] = React.useState(false);
  React.useEffect(() => setCustomFailed(false), [customUrl]);
  const useCustom = Boolean(customUrl) && !customFailed;

  return (
    <div
      className={`relative overflow-hidden rounded pointer-events-none border border-black/10 ${fill ? 'w-full h-full min-h-0' : 'flex-shrink-0'} ${className}`}
      style={{
        ...(fill ? undefined : { width: w, height: h }),
        containerType: 'size',
        background: imgOk ? undefined : 'var(--inpx-cover-fallback-bg)',
      }}
    >
      {useCustom ? (
        <img
          src={customUrl!}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
          onError={() => setCustomFailed(true)}
        />
      ) : imgOk && (
        <>
          <img
            src={bookFallbackPng}
            alt=""
            className="inpx-cover-fallback-dark absolute inset-0 w-full h-full object-cover"
            draggable={false}
            onError={() => setImgOk(false)}
          />
          <img
            src={bookFallbackLightPng}
            alt=""
            className="inpx-cover-fallback-light absolute inset-0 w-full h-full object-cover"
            draggable={false}
            onError={() => setImgOk(false)}
          />
        </>
      )}
      <span className="inpx-cover-fallback-overlay absolute inset-0" aria-hidden />
      {(title || author) && (
        <span
          className="absolute flex flex-col items-center justify-start gap-[0.35em] text-center overflow-hidden box-border z-[1] [text-wrap:balance]"
          // The plain field between the ornaments of book-fallback*.png — same box as the server
          // (styles.css .cover-fallback-copy, COVER_TITLE_SAMPLE_BOX 19–89% × 21–70%).
          style={{
            inset: '21% 11% 30% 19%',
            // Server «Положение надписи»: x in 1cqi steps, y in 1.5cqi steps.
            // `transform`, not the `translate` property: Chrome 83 WebViews ignore the latter.
            transform: 'translate(calc(var(--inpx-cover-title-x, 0) * 1cqi), calc(var(--inpx-cover-title-y, 0) * 1.5cqi))',
          }}
        >
          {title ? (
            <span
              className="inpx-cover-fallback-title w-full font-bold line-clamp-6 [overflow-wrap:anywhere]"
              style={{
                fontSize: 'calc(clamp(9px, 7cqi, 18px) * var(--inpx-cover-title-scale, 1))',
                lineHeight: 1.14,
                letterSpacing: '0.015em',
              }}
            >
              {title}
            </span>
          ) : null}
          {author ? (
            <span
              className="inpx-cover-fallback-author w-full italic line-clamp-2 [overflow-wrap:anywhere]"
              style={{
                fontSize: 'clamp(7px, 4.2cqi, 12px)',
                lineHeight: 1.22,
                letterSpacing: '0.02em',
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
  const [src, setSrc] = React.useState<string | null>(() => peekCoverMemory(bookId, variant));
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setFailed(false);
    const mem = peekCoverMemory(bookId, variant);
    setSrc(mem);
    if (mem) return;

    let request = 0;
    async function load() {
      const token = ++request;
      try {
        const url = await resolveCoverUrl({
          bookId,
          variant,
          directory: storageDirectory,
          config: serverConfig,
        });
        if (cancelled || token !== request) return;
        if (url) {
          setFailed(false);
          setSrc(url);
          return;
        }
        setSrc(null);
        setFailed(true);
      } catch {
        if (!cancelled && token === request) {
          setSrc(null);
          setFailed(true);
        }
      }
    }

    void load();
    const onReady = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id !== bookId) return;
      void load();
    };
    window.addEventListener('inpx-local-cover', onReady);
    return () => {
      cancelled = true;
      window.removeEventListener('inpx-local-cover', onReady);
    };
  }, [
    bookId,
    variant,
    storageDirectory?.uri,
    serverConfig?.url,
    serverConfig?.username,
    serverConfig?.password,
    serverConfig?.deviceToken,
    serverConfig?.connectionStatus,
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
