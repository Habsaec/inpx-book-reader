import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { readBinaryFileFromDirectory, arrayBufferToBase64 } from '../lib/bookStorage';
import { debugSessionLog } from '../lib/debugSessionLog';
import { ReaderNative } from '../lib/readerNative';
import { getSafeAreaInsets, postSafeAreaToWindow, prepareReaderSafeArea, type SafeAreaInsets } from '../lib/safeArea';
import { useBackHandler } from '../hooks/useBackHandler';
import { theme } from '../lib/appTheme';
import { ScreenLoader } from '../ui/Skeleton';
import { applyReaderOrientationLock } from '../lib/readerOrientation';
import { APP_SETTING_KEYS, getAppSettingJson } from '../lib/appSettings';
import { applyIframeReaderStore, primeReaderLocalStorage, readOfflineReaderData } from '../lib/offlineReaderStore';
import {
  CROSS_DEVICE_POSITION_ACCEPT,
  CROSS_DEVICE_POSITION_DECLINE,
  formatPositionProgressLabel,
  resolvePositionDisplayMeta,
} from '../lib/syncMerge';
import { useDialog } from '../ui/Dialog';
import type { ReaderFontFamily } from './reader/readerTypes';

interface ReaderPrefs {
  orientationLock: 'auto' | 'portrait' | 'landscape';
}

function readReaderPrefs(): ReaderPrefs {
  const p = getAppSettingJson<Partial<{ orientationLock?: string }>>(APP_SETTING_KEYS.readerPrefs, {});
  const orientationLock =
    p.orientationLock === 'portrait' || p.orientationLock === 'landscape' ? p.orientationLock : 'auto';
  return { orientationLock };
}

export interface LocalBookFile {
  storageUri: string;
  localFileName: string;
}

export interface FoliateReaderConfig {
  bookId: string;
  bookExt?: string;
  bookTitle?: string;
  initialPosition?: string | null;
  localFile: LocalBookFile;
  einkActive?: boolean;
}

interface FoliateReaderProps extends FoliateReaderConfig {
  onClose: () => void;
  /** Вызывается после применения store из iframe (закладки/заметки/позиция). */
  onStoreSynced?: () => void;
}

export function readLocalReaderPosition(bookId: string): string | null {
  const data = readOfflineReaderData(bookId);
  return data.position ? String(data.position) : null;
}

/** @deprecated use readLocalReaderPosition */
export const readOfflineReaderPosition = readLocalReaderPosition;

export function writeFoliateReaderSession(config: FoliateReaderConfig) {
  seedReaderThemeFromApp();
  localStorage.setItem(
    'INPX_READER_CONFIG',
    JSON.stringify({
      bookId: config.bookId,
      bookExt: config.bookExt || 'fb2',
      bookTitle: config.bookTitle || '',
      initialPosition: config.initialPosition || null,
      storageUri: config.localFile.storageUri,
      localFileName: config.localFile.localFileName,
      einkActive: Boolean(config.einkActive),
    }),
  );
}

/** Align reader light/dark/sepia with app theme; keep night/eink prefs. */
function seedReaderThemeFromApp() {
  try {
    const appTheme = document.documentElement.dataset.theme;
    if (appTheme !== 'light' && appTheme !== 'dark' && appTheme !== 'sepia') return;
    const raw = localStorage.getItem('reader-settings');
    const settings = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const current = typeof settings.theme === 'string' ? settings.theme : '';
    if (current === 'night' || current === 'eink') return;
    if (current === appTheme) return;
    settings.theme = appTheme;
    localStorage.setItem('reader-settings', JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export default function FoliateReader({
  bookId,
  bookExt = 'fb2',
  bookTitle = 'Книга',
  initialPosition,
  localFile,
  einkActive = false,
  onClose,
  onStoreSynced,
}: FoliateReaderProps) {
  const dialog = useDialog();
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const positionPromptRef = React.useRef<string | null>(null);
  const positionPromptBusyRef = React.useRef(false);
  const positionPromptQueueRef = React.useRef<MessageEvent[]>([]);
  const flushAckRef = React.useRef<{
    resolve: () => void;
    timer: number;
  } | null>(null);
  const [iframeSrc, setIframeSrc] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState('');
  const readerPrefsRef = React.useRef(readReaderPrefs());
  const iframeOriginRef = React.useRef<string | null>(null);
  const lastHapticAtRef = React.useRef(0);

  React.useEffect(() => {
    if (!iframeSrc) {
      iframeOriginRef.current = null;
      return;
    }
    try {
      iframeOriginRef.current = new URL(iframeSrc, window.location.href).origin;
    } catch {
      iframeOriginRef.current = window.location.origin;
    }
  }, [iframeSrc]);

  const isTrustedReaderMessage = React.useCallback((event: MessageEvent): boolean => {
    if (event.source !== iframeRef.current?.contentWindow) return false;
    const expected = iframeOriginRef.current;
    if (expected && event.origin !== expected && event.origin !== 'null') return false;
    return true;
  }, []);

  const runPositionPrompt = React.useCallback(async (event: MessageEvent) => {
    const requestId = String(event.data.requestId || '');
    const source = event.source as Window;
    const flatToc = Array.isArray(event.data.flatToc) ? event.data.flatToc : null;
    try {
      const localLine = formatPositionProgressLabel(
        Number(event.data.localFraction) || 0,
        Number(event.data.localProgress) || 0,
        resolvePositionDisplayMeta({
          fraction: Number(event.data.localFraction) || 0,
          progress: Number(event.data.localProgress) || 0,
          fb2Href: event.data.localFb2Href,
          position: event.data.localPosition,
          paginatorPage: event.data.localPaginatorPage,
          paginatorPages: event.data.localPaginatorPages,
          sectionIndex: event.data.localSectionIndex,
          textOffset: event.data.localTextOffset,
          textQuote: event.data.localTextQuote,
          textSectionLength: event.data.localTextSectionLength,
        }, flatToc),
      );
      const serverLine = formatPositionProgressLabel(
        Number(event.data.serverFraction) || 0,
        Number(event.data.serverProgress) || 0,
        resolvePositionDisplayMeta({
          fraction: Number(event.data.serverFraction) || 0,
          progress: Number(event.data.serverProgress) || 0,
          fb2Href: event.data.serverFb2Href,
          position: event.data.serverPosition,
          paginatorPage: event.data.serverPaginatorPage,
          paginatorPages: event.data.serverPaginatorPages,
          sectionIndex: event.data.serverSectionIndex,
          textOffset: event.data.serverTextOffset,
          textQuote: event.data.serverTextQuote,
          textSectionLength: event.data.serverTextSectionLength,
        }, flatToc),
      );
      const accepted = await dialog.confirm({
        title: 'Позиция чтения',
        message: String(event.data.message || 'Ранее вы уже читали эту книгу на другом устройстве. Перейти на сохранённую позицию?'),
        positionCompare: {
          localLabel: 'Сейчас',
          localValue: localLine,
          serverLabel: 'На другом устройстве',
          serverValue: serverLine,
        },
        confirmLabel: CROSS_DEVICE_POSITION_ACCEPT,
        cancelLabel: CROSS_DEVICE_POSITION_DECLINE,
      });
      source.postMessage({
        type: 'inpx-reader-position-prompt-response',
        requestId,
        accepted,
      }, '*');
    } finally {
      positionPromptBusyRef.current = false;
      if (positionPromptRef.current === requestId) positionPromptRef.current = null;
      const next = positionPromptQueueRef.current.shift();
      if (next) {
        const nextId = String(next.data.requestId || '');
        if (nextId) {
          positionPromptRef.current = nextId;
          positionPromptBusyRef.current = true;
          void runPositionPrompt(next);
        }
      }
    }
  }, [dialog]);

  const enqueuePositionPrompt = React.useCallback((event: MessageEvent) => {
    const requestId = String(event.data.requestId || '');
    if (!requestId || positionPromptRef.current === requestId) return;
    if (positionPromptBusyRef.current) {
      if (!positionPromptQueueRef.current.some((queued) => String(queued.data.requestId || '') === requestId)) {
        positionPromptQueueRef.current.push(event);
      }
      return;
    }
    positionPromptRef.current = requestId;
    positionPromptBusyRef.current = true;
    void runPositionPrompt(event);
  }, [runPositionPrompt]);

  React.useEffect(() => {
    void applyReaderOrientationLock(readerPrefsRef.current.orientationLock);
    return () => {
      void applyReaderOrientationLock('auto');
    };
  }, []);

  const safeAreaRef = React.useRef<SafeAreaInsets>({ top: 0, bottom: 0, left: 0, right: 0 });

  const storageUri = localFile.storageUri;
  const localFileName = localFile.localFileName;

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

    void ReaderNative.setSystemTextSelectionMenuEnabled({ enabled: false });
    return () => {
      void ReaderNative.setSystemTextSelectionMenuEnabled({ enabled: true });
    };
  }, []);

  React.useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    void (async () => {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.show();
      } catch {
        // ignore
      }
    })();

    return () => {
      // Свайп подсветки перехватывает касания в dispatchTouchEvent на всё приложение,
      // поэтому вне читалки он обязан быть выключен — иначе ломает прокрутку списков.
      void ReaderNative.setLightSwipe({ enabled: false }).catch(() => {});
      void ReaderNative.setBrightness({ level: -1 }).catch(() => {});
      void (async () => {
        try {
          await StatusBar.show();
          await StatusBar.setOverlaysWebView({ overlay: true });
        } catch {
          // ignore
        }
      })();
    };
  }, []);

  const flushReaderPositionAndWait = React.useCallback((timeoutMs = 2000): Promise<void> => {
    return new Promise((resolve) => {
      if (flushAckRef.current) {
        clearTimeout(flushAckRef.current.timer);
        flushAckRef.current.resolve();
      }
      const timer = window.setTimeout(() => {
        flushAckRef.current = null;
        resolve();
      }, timeoutMs);
      flushAckRef.current = { resolve, timer };
      iframeRef.current?.contentWindow?.postMessage({ type: 'inpx-reader-flush-position' }, '*');
    });
  }, []);

  const requestClose = React.useCallback(() => {
    void flushReaderPositionAndWait().then(() => onClose());
  }, [flushReaderPositionAndWait, onClose]);

  const postReaderSeed = React.useCallback((win: Window | null) => {
    if (!win || !bookId) return;
    const data = readOfflineReaderData(bookId);
    win.postMessage({
      type: 'inpx-reader-seed-store',
      bookId,
      data,
    }, '*');
  }, [bookId]);

  const postReaderChromeInsets = React.useCallback((target: Window | null) => {
    postSafeAreaToWindow(target, safeAreaRef.current);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadError('');

      if (!localFileName || !storageUri) {
        debugSessionLog('H1', 'FoliateReader:init', 'missing local file', {
          bookId,
          localFileName: Boolean(localFileName),
          storageUri: Boolean(storageUri),
        });
        if (!cancelled) setLoadError('Книга не скачана на устройство');
        return;
      }

      try {
        debugSessionLog('H1', 'FoliateReader:init', 'start', { bookId, bookExt, localFileName });
        safeAreaRef.current = await prepareReaderSafeArea();
        if (cancelled) return;

        writeFoliateReaderSession({
          bookId,
          bookExt,
          bookTitle,
          initialPosition,
          localFile: { storageUri, localFileName },
          einkActive,
        });
        if (cancelled) return;

        primeReaderLocalStorage(bookId);
        const readerData = readOfflineReaderData(bookId);
        const query = new URLSearchParams({ bookId, ext: bookExt });
        if (initialPosition) query.set('pos', initialPosition);
        else {
          const frac = readerData.fraction != null && Number.isFinite(Number(readerData.fraction))
            ? Number(readerData.fraction)
            : (Number(readerData.progress) || 0) / 100;
          if (frac > 0.001) query.set('frac', String(frac));
          if (readerData.fb2Href) query.set('fb2', String(readerData.fb2Href));
        }
        if (einkActive) query.set('eink', '1');
        query.set('session', String(Date.now()));
        setIframeSrc(`./inpx-reader/index.html?${query.toString()}`);
        debugSessionLog('H1', 'FoliateReader:init', 'iframe src set', { bookId });
      } catch (e: unknown) {
        debugSessionLog('H1', 'FoliateReader:init', 'failed', {
          msg: e instanceof Error ? e.message : String(e),
        });
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Не удалось открыть книгу');
        }
      }
    })();

    return () => {
      cancelled = true;
      void flushReaderPositionAndWait().then(() => {
        setIframeSrc(null);
      });
    };
  }, [bookId, bookExt, bookTitle, initialPosition, storageUri, localFileName, einkActive, flushReaderPositionAndWait]);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'inpx-reader-request-book-file') return;
      if (event.source !== iframeRef.current?.contentWindow) return;

      const target = event.source as Window;
      const fileUri = String(event.data.storageUri || storageUri);
      const filePath = String(event.data.localFileName || localFileName);
      const requestId = event.data.requestId;

      void (async () => {
        debugSessionLog('H2', 'FoliateReader:fileRequest', 'start', { filePath, bookId });
        try {
          const buffer = await readBinaryFileFromDirectory({ uri: fileUri, label: '' }, filePath);
          debugSessionLog('H2', 'FoliateReader:fileRequest', 'ok', {
            bookId,
            byteLength: buffer.byteLength,
          });
          const payload = {
            type: 'inpx-reader-book-file',
            requestId,
          } as Record<string, unknown>;
          if (Capacitor.getPlatform() === 'android') {
            target.postMessage({ ...payload, data: arrayBufferToBase64(buffer) }, '*');
          } else {
            try {
              target.postMessage({ ...payload, buffer }, '*', [buffer]);
            } catch {
              target.postMessage({ ...payload, data: arrayBufferToBase64(buffer) }, '*');
            }
          }
        } catch (e: unknown) {
          debugSessionLog('H2', 'FoliateReader:fileRequest', 'failed', {
            msg: e instanceof Error ? e.message : String(e),
            filePath,
          });
          target.postMessage({
            type: 'inpx-reader-book-file',
            requestId,
            error: e instanceof Error ? e.message : 'Не удалось прочитать файл',
          }, '*');
        }
      })();
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [storageUri, localFileName, bookId]);

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onLoad = () => {
      const win = iframe.contentWindow;
      postReaderChromeInsets(win);
      postReaderSeed(win);
      win?.postMessage({
        type: 'inpx-native-ready',
        ready: Capacitor.isNativePlatform(),
      }, '*');
    };

    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [iframeSrc, postReaderChromeInsets, postReaderSeed]);

  React.useEffect(() => {
    void getSafeAreaInsets().then((insets) => {
      safeAreaRef.current = insets;
      postReaderChromeInsets(iframeRef.current?.contentWindow ?? null);
    });
  }, [iframeSrc, postReaderChromeInsets]);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'inpx-debug-log') {
        debugSessionLog(
          String(event.data.hypothesisId || 'H3'),
          String(event.data.location || 'iframe'),
          String(event.data.message || ''),
          (event.data.data as Record<string, unknown>) || {},
        );
        return;
      }

      if (event.data?.type === 'inpx-reader-sync-store' && event.data.bookId === bookId) {
        if (!isTrustedReaderMessage(event)) return;
        applyIframeReaderStore(bookId, event.data.data || {});
        onStoreSynced?.();
        if (flushAckRef.current) {
          clearTimeout(flushAckRef.current.timer);
          const { resolve } = flushAckRef.current;
          flushAckRef.current = null;
          resolve();
        }
        return;
      }

      if (
        event.data?.type === 'inpx-reader-position-prompt-request'
        && event.data?.bookId === bookId
        && isTrustedReaderMessage(event)
      ) {
        enqueuePositionPrompt(event);
        return;
      }

      if (event.data?.type === 'inpx-reader-close') requestClose();

      if (
        event.data?.type === 'inpx-reader-haptic'
        && event.source === iframeRef.current?.contentWindow
        && Capacitor.isNativePlatform()
      ) {
        if (einkActive) return;
        const now = Date.now();
        // Защита от пачки relocate при открытии книги / быстром листании.
        if (now - lastHapticAtRef.current < 220) return;
        lastHapticAtRef.current = now;
        const kind = event.data.kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
        void Haptics.impact({ style: kind }).catch(() => {});
        return;
      }

      if (
        event.data?.type === 'inpx-reader-immersive'
        && event.source === iframeRef.current?.contentWindow
      ) {
        const enabled = Boolean(event.data.enabled);
        if (Capacitor.getPlatform() === 'android') {
          void (async () => {
            try {
              if (enabled) {
                await StatusBar.setOverlaysWebView({ overlay: true });
                await StatusBar.hide();
              } else {
                await StatusBar.show();
                await StatusBar.setOverlaysWebView({ overlay: false });
              }
            } catch {
              // ignore
            }
          })();
        }
        return;
      }

      if (
        event.data?.type === 'inpx-reader-native-handshake'
        && event.source === iframeRef.current?.contentWindow
      ) {
        (event.source as Window).postMessage({
          type: 'inpx-native-ready',
          ready: Capacitor.isNativePlatform(),
        }, '*');
        return;
      }

      if (event.data?.type === 'inpx-native-call' && event.source === iframeRef.current?.contentWindow) {
        void handleNativeCall(event.data.id, event.data.method, event.data.data, iframeRef.current?.contentWindow ?? null);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [bookId, einkActive, enqueuePositionPrompt, isTrustedReaderMessage, onStoreSynced, requestClose]);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const ttsEnd = ReaderNative.addListener('ttsEnd', (data) => {
      iframeRef.current?.contentWindow?.postMessage({
        type: 'inpx-native-event',
        event: 'ttsEnd',
        data,
      }, '*');
    });
    const ttsStart = ReaderNative.addListener('ttsStart', (data) => {
      iframeRef.current?.contentWindow?.postMessage({
        type: 'inpx-native-event',
        event: 'ttsStart',
        data,
      }, '*');
    });
    return () => {
      void ttsEnd.then((h) => h.remove());
      void ttsStart.then((h) => h.remove());
    };
  }, []);

  React.useEffect(() => {
    const onVolumeKey = (e: Event) => {
      const detail = (e as CustomEvent<{ direction: 'prev' | 'next' }>).detail;
      iframeRef.current?.contentWindow?.postMessage({
        type: 'reader-volume-key',
        direction: detail?.direction,
      }, '*');
    };
    window.addEventListener('reader-volume-key', onVolumeKey);
    return () => window.removeEventListener('reader-volume-key', onVolumeKey);
  }, []);

  useBackHandler(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'inpx-reader-back' }, '*');
    return true;
  });

  if (loadError) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 p-6 bg-[var(--app-bg)] text-[var(--app-text)]">
        <p className="text-base font-semibold text-center">Не удалось открыть книгу</p>
        <p className="text-sm text-center text-[var(--app-muted)] max-w-sm">{loadError}</p>
        <button
          type="button"
          className={`min-h-12 px-4 text-sm font-bold text-[var(--app-link)] rounded-lg ${theme.focusRing}`}
          onClick={onClose}
        >
          ← Назад
        </button>
      </div>
    );
  }

  if (!iframeSrc) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col bg-[var(--app-bg)] text-[var(--app-text)]" aria-busy aria-label="Загрузка книги">
        <ScreenLoader label="Загрузка книги…" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col min-h-0">
      <iframe
        ref={iframeRef}
        title={bookTitle}
        src={iframeSrc}
        className="flex-1 w-full min-h-0 border-0 bg-[var(--app-surface)]"
        allow="fullscreen"
      />
    </div>
  );
}

async function handleNativeCall(
  id: string,
  method: string,
  data: Record<string, unknown> | undefined,
  target: Window | null,
) {
  const reply = (result?: unknown, error?: string) => {
    target?.postMessage({ type: 'inpx-native-response', id, result, error }, '*');
  };

  if (!Capacitor.isNativePlatform()) {
    reply(undefined, 'Native API unavailable');
    return;
  }

  try {
    const plugin = ReaderNative as unknown as Record<string, (opts?: Record<string, unknown>) => Promise<unknown>>;
    const fn = plugin[method];
    if (typeof fn !== 'function') {
      reply(undefined, `Unknown method: ${method}`);
      return;
    }
    const result = await fn(data);
    reply(result);
  } catch (e: unknown) {
    reply(undefined, e instanceof Error ? e.message : 'Native call failed');
  }
}
