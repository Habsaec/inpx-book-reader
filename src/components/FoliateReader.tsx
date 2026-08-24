import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { StatusBar } from '@capacitor/status-bar';
import { resolveStorageFileUrl } from '../lib/bookStorage';
import {
  isStoragePermissionError,
  STORAGE_PERMISSION_REVOKED_MSG,
} from '../lib/storageDirectory';
import { debugSessionLog } from '../lib/debugSessionLog';
import { isReaderNativeBridgeMethod, ReaderNative } from '../lib/readerNative';
import {
  getSafeAreaInsets,
  postSafeAreaToWindow,
  prepareReaderSafeArea,
  storeReaderSafeArea,
  type SafeAreaInsets,
} from '../lib/safeArea';
import { useBackHandler } from '../hooks/useBackHandler';
import { theme } from '../lib/appTheme';
import { radii } from '../ui/tokens';
import { ScreenLoader } from '../ui/Skeleton';
import { applyReaderOrientationLock } from '../lib/readerOrientation';
import { APP_SETTING_KEYS, getAppSettingJson } from '../lib/appSettings';
import { applyIframeReaderStore, primeReaderLocalStorage, readOfflineReaderData } from '../lib/offlineReaderStore';
import { BOOK_OPEN_SYNC_DONE_EVENT, peekRecentBookOpenSyncDone } from '../lib/bookOpenSyncNotify';
import {
  CROSS_DEVICE_POSITION_ACCEPT,
  CROSS_DEVICE_POSITION_DECLINE,
  formatPositionProgressLabel,
  resolvePositionDisplayMeta,
} from '../lib/syncMerge';
import {
  createPositionSessionId,
  ensureOpenBookPositionSession,
  OPEN_BOOK_POSITION_POLL_MS,
  syncOpenBookPosition,
} from '../lib/openBookPositionSync';
import { useDialog } from '../ui/Dialog';
import type { ReaderFontFamily } from './reader/readerTypes';
import type { ServerConfig } from '../types';

interface ReaderPrefs {
  orientationLock: 'auto' | 'portrait' | 'landscape';
}

function readReaderPrefs(): ReaderPrefs {
  const p = getAppSettingJson<Partial<{ orientationLock?: string }>>(APP_SETTING_KEYS.readerPrefs, {});
  const orientationLock =
    p.orientationLock === 'portrait' || p.orientationLock === 'landscape' ? p.orientationLock : 'auto';
  return { orientationLock };
}

/** Ignore stale capture-disable after a newer Foliate instance mounts (book switch). */
let volumeCaptureOwnerSeq = 0;
let lightSwipeOwnerSeq = 0;
let statusBarOwnerSeq = 0;

export interface LocalBookFile {
  storageUri: string;
  localFileName: string;
}

export interface FoliateReaderConfig {
  bookId: string;
  bookExt?: string;
  bookTitle?: string;
  bookAuthor?: string;
  coverUrl?: string;
  coverAuthHeader?: string;
  initialPosition?: string | null;
  localFile: LocalBookFile;
  einkActive?: boolean;
  /** True when app has no server connection — show offline strip in reader. */
  offline?: boolean;
  serverConfig?: ServerConfig | null;
  nextInSeries?: { bookId: string; title: string } | null;
}

interface FoliateReaderProps extends FoliateReaderConfig {
  onClose: () => void;
  /** Вызывается после применения store из iframe (закладки/заметки/позиция). */
  onStoreSynced?: () => void;
  onOpenNextInSeries?: (bookId: string) => void;
}

export function readLocalReaderPosition(bookId: string): string | null {
  const data = readOfflineReaderData(bookId);
  return data.position ? String(data.position) : null;
}

/** @deprecated use readLocalReaderPosition */
export const readOfflineReaderPosition = readLocalReaderPosition;

export function writeFoliateReaderSession(config: FoliateReaderConfig) {
  // Тема читалки (reader-settings.theme) независима от темы приложения.
  localStorage.setItem(
    'INPX_READER_CONFIG',
    JSON.stringify({
      bookId: config.bookId,
      bookExt: config.bookExt || 'fb2',
      bookTitle: config.bookTitle || '',
      bookAuthor: config.bookAuthor || '',
      coverUrl: config.coverUrl || '',
      coverAuthHeader: config.coverAuthHeader || '',
      initialPosition: config.initialPosition || null,
      storageUri: config.localFile.storageUri,
      localFileName: config.localFile.localFileName,
      einkActive: Boolean(config.einkActive),
      offline: Boolean(config.offline),
      nextInSeries: config.nextInSeries?.bookId
        ? { bookId: config.nextInSeries.bookId, title: config.nextInSeries.title || '' }
        : null,
    }),
  );
}

export default function FoliateReader({
  bookId,
  bookExt = 'fb2',
  bookTitle = 'Книга',
  bookAuthor = '',
  coverUrl = '',
  coverAuthHeader = '',
  initialPosition,
  localFile,
  einkActive = false,
  offline = false,
  serverConfig = null,
  nextInSeries = null,
  onClose,
  onStoreSynced,
  onOpenNextInSeries,
}: FoliateReaderProps) {
  const dialog = useDialog();
  const dialogRef = React.useRef(dialog);
  dialogRef.current = dialog;
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const positionSessionIdRef = React.useRef(createPositionSessionId());
  const positionPromptRef = React.useRef<string | null>(null);
  const positionPromptBusyRef = React.useRef(false);
  const positionPromptQueueRef = React.useRef<MessageEvent[]>([]);
  const positionPromptGenRef = React.useRef(0);
  const flushAckRef = React.useRef<{
    resolve: () => void;
    timer: number;
  } | null>(null);
  const livePushTimerRef = React.useRef<number | null>(null);
  const [iframeSrc, setIframeSrc] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState('');
  const readerPrefsRef = React.useRef(readReaderPrefs());
  const iframeOriginRef = React.useRef<string | null>(null);
  const lastHapticAtRef = React.useRef(0);
  const nativeCallGenRef = React.useRef(0);

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
    const promptGen = positionPromptGenRef.current;
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
      if (positionPromptGenRef.current !== promptGen) return;
      source.postMessage({
        type: 'inpx-reader-position-prompt-response',
        requestId,
        accepted,
      }, '*');
    } finally {
      if (positionPromptGenRef.current !== promptGen) {
        positionPromptBusyRef.current = false;
        positionPromptRef.current = null;
        positionPromptQueueRef.current = [];
        return;
      }
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

  React.useEffect(() => {
    positionPromptGenRef.current += 1;
    positionPromptQueueRef.current = [];
    positionPromptBusyRef.current = false;
    positionPromptRef.current = null;
    return () => {
      dialogRef.current.dismiss();
      positionPromptGenRef.current += 1;
      positionPromptQueueRef.current = [];
      positionPromptBusyRef.current = false;
      positionPromptRef.current = null;
    };
  }, [bookId]);

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

    const owner = ++volumeCaptureOwnerSeq;
    void ReaderNative.setSystemTextSelectionMenuEnabled({ enabled: false });
    void ReaderNative.setVolumeKeysCapture({ enabled: true }).catch(() => {});
    return () => {
      void ReaderNative.setSystemTextSelectionMenuEnabled({ enabled: true });
      // Ignore stale disable after a newer Foliate mount claimed capture.
      if (volumeCaptureOwnerSeq === owner) {
        void ReaderNative.setVolumeKeysCapture({ enabled: false }).catch(() => {});
      }
    };
  }, []);

  React.useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    const lightOwner = ++lightSwipeOwnerSeq;
    const statusOwner = ++statusBarOwnerSeq;
    void (async () => {
      try {
        // Edge-to-edge: #reader-body сдвигает текст на --r-safe-top (камера/cutout).
        // overlay:false на Android 15 часто всё равно рисует под статус-баром,
        // а inset при этом = 0 → текст лезет в punch-hole.
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.show();
      } catch {
        // ignore
      }
    })();

    return () => {
      // Свайп подсветки перехватывает касания в dispatchTouchEvent на всё приложение,
      // поэтому вне читалки он обязан быть выключен — иначе ломает прокрутку списков.
      if (lightSwipeOwnerSeq === lightOwner) {
        void ReaderNative.setLightSwipe({ enabled: false }).catch(() => {});
      }
      void ReaderNative.setBrightness({ level: -1 }).catch(() => {});
      // Bump so in-flight immersive hide/show from the old mount is ignored.
      if (statusBarOwnerSeq === statusOwner) {
        statusBarOwnerSeq += 1;
      }
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

  const iframeGenerationRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const flushReaderPositionAndWait = React.useCallback((timeoutMs = 2000): Promise<void> => {
    return new Promise((resolve) => {
      if (flushAckRef.current) {
        clearTimeout(flushAckRef.current.timer);
        flushAckRef.current.resolve();
      }
      // Нет живого iframe (книга ещё грузится) — ack не придёт, не ждём таймаут.
      if (!iframeRef.current?.contentWindow) {
        resolve();
        return;
      }
      const timer = window.setTimeout(() => {
        flushAckRef.current = null;
        resolve();
      }, timeoutMs);
      flushAckRef.current = { resolve, timer };
      iframeRef.current?.contentWindow?.postMessage({ type: 'inpx-reader-flush-position' }, '*');
    });
  }, []);

  const closingRef = React.useRef(false);
  React.useEffect(() => {
    closingRef.current = false;
    nativeCallGenRef.current += 1;
  }, [bookId]);

  const requestClose = React.useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    void flushReaderPositionAndWait().then(() => {
      try {
        const win = iframeRef.current?.contentWindow as
          | (Window & { __READER_TEARDOWN__?: () => void })
          | null
          | undefined;
        win?.__READER_TEARDOWN__?.();
      } catch {
        /* ignore */
      }
      void ReaderNative.stopTts().catch(() => {});
      void ReaderNative.updateTtsMediaSession({ active: false, playing: false }).catch(() => {});
      onClose();
    });
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

  const serverConfigRef = React.useRef(serverConfig);
  serverConfigRef.current = serverConfig;

  React.useEffect(() => {
    positionSessionIdRef.current = createPositionSessionId();
    ensureOpenBookPositionSession(bookId, positionSessionIdRef.current);
  }, [bookId]);

  const liveSyncEnabled = Boolean(!offline && serverConfig?.connectionStatus === 'connected');

  React.useEffect(() => {
    if (!liveSyncEnabled || !bookId) return;
    let cancelled = false;
    const run = async () => {
      const cfg = serverConfigRef.current;
      if (!cfg) return;
      try {
        const result = await syncOpenBookPosition(cfg, bookId, positionSessionIdRef.current);
        if (cancelled || result !== 'prompt') return;
        postReaderSeed(iframeRef.current?.contentWindow ?? null);
      } catch {
        /* auth expiry is handled by the app sync pipeline */
      }
    };
    const start = window.setTimeout(() => { void run(); }, 1500);
    const poll = window.setInterval(() => { void run(); }, OPEN_BOOK_POSITION_POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      window.clearInterval(poll);
    };
  }, [bookId, liveSyncEnabled, postReaderSeed]);

  const postReaderChromeInsets = React.useCallback((target: Window | null) => {
    postSafeAreaToWindow(target, safeAreaRef.current);
  }, []);

  // Keep session metadata fresh without remounting the Foliate iframe
  // (nextInSeries / offline / cover changes must not tear down the book).
  React.useEffect(() => {
    if (!iframeSrc || !localFileName || !storageUri) return;
    writeFoliateReaderSession({
      bookId,
      bookExt,
      bookTitle,
      bookAuthor,
      coverUrl,
      coverAuthHeader,
      initialPosition,
      localFile: { storageUri, localFileName },
      einkActive,
      offline,
      nextInSeries,
    });
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'inpx-reader-offline', offline: Boolean(offline) },
      '*',
    );
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'inpx-reader-eink', active: Boolean(einkActive) },
      '*',
    );
  }, [
    iframeSrc,
    bookId,
    bookExt,
    bookTitle,
    bookAuthor,
    coverUrl,
    coverAuthHeader,
    initialPosition,
    storageUri,
    localFileName,
    einkActive,
    offline,
    nextInSeries,
  ]);

  React.useEffect(() => {
    let cancelled = false;
    const generation = ++iframeGenerationRef.current;

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
          bookAuthor,
          coverUrl,
          coverAuthHeader,
          initialPosition,
          localFile: { storageUri, localFileName },
          einkActive,
          offline,
          nextInSeries,
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
      if (flushAckRef.current) {
        clearTimeout(flushAckRef.current.timer);
        flushAckRef.current.resolve();
        flushAckRef.current = null;
      }
      const finishTeardown = () => {
        // Never null a newer iframe that replaced this generation.
        if (iframeGenerationRef.current !== generation) return;
        try {
          const win = iframeRef.current?.contentWindow as
            | (Window & { __READER_TEARDOWN__?: () => void })
            | null
            | undefined;
          win?.__READER_TEARDOWN__?.();
        } catch {
          /* ignore */
        }
        void ReaderNative.stopTts().catch(() => {});
        void ReaderNative.updateTtsMediaSession({ active: false, playing: false }).catch(() => {});
        if (iframeRef.current) iframeRef.current.src = 'about:blank';
        if (mountedRef.current) setIframeSrc(null);
      };
      // Close already flushed (or is flushing); blank sync so wake-lock/TTS do not linger.
      if (closingRef.current) {
        finishTeardown();
        return;
      }
      void flushReaderPositionAndWait().then(finishTeardown);
    };
    // Identity of the open book only — metadata updates go through session + postMessage.
    // Do not remount when einkActive flips after getDeviceInfo (BOOX); session effect pushes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional narrow deps
  }, [bookId, bookExt, storageUri, localFileName, flushReaderPositionAndWait]);

  React.useEffect(() => {
    let alive = true;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'inpx-reader-request-book-file') return;
      if (!isTrustedReaderMessage(event)) return;

      const target = event.source as Window;
      // Paths come from the open book in the parent — never from iframe payload.
      const fileUri = storageUri;
      const filePath = localFileName;
      const requestId = event.data.requestId;
      const forceBridge = event.data.forceBridge === true;

      if (!fileUri || !filePath) {
        target.postMessage({
          type: 'inpx-reader-book-file',
          requestId,
          error: 'Файл книги не найден на устройстве',
        }, '*');
        return;
      }

      void (async () => {
        debugSessionLog('H2', 'FoliateReader:fileRequest', 'start', { filePath, bookId, forceBridge });
        try {
          // Always a fetchable file-URL (disk or streamed book-cache). Never base64
          // the whole FB2/EPUB through the Capacitor bridge — that OOMs at ~20+ MB.
          const fileUrl = await resolveStorageFileUrl(
            { uri: fileUri, label: '' },
            filePath,
            { preferCache: forceBridge },
          );
          if (!alive || event.source !== iframeRef.current?.contentWindow) return;
          if (fileUrl) {
            debugSessionLog('H2', 'FoliateReader:fileRequest', 'file-url', {
              bookId,
              filePath,
              forceBridge,
            });
            target.postMessage({ type: 'inpx-reader-book-file', requestId, url: fileUrl }, '*');
            return;
          }
          throw new Error('Не удалось открыть файл книги');
        } catch (e: unknown) {
          if (!alive || event.source !== iframeRef.current?.contentWindow) return;
          debugSessionLog('H2', 'FoliateReader:fileRequest', 'failed', {
            msg: e instanceof Error ? e.message : String(e),
            filePath,
          });
          const error = isStoragePermissionError(e)
            ? STORAGE_PERMISSION_REVOKED_MSG
            : e instanceof Error
              ? e.message
              : 'Не удалось прочитать файл';
          if (isStoragePermissionError(e)) {
            setLoadError(STORAGE_PERMISSION_REVOKED_MSG);
          }
          target.postMessage({
            type: 'inpx-reader-book-file',
            requestId,
            error,
          }, '*');
        }
      })();
    };

    window.addEventListener('message', onMessage);
    return () => {
      alive = false;
      window.removeEventListener('message', onMessage);
    };
  }, [storageUri, localFileName, bookId, isTrustedReaderMessage]);

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
      // Open-sync may have finished before the iframe listener was ready.
      if (peekRecentBookOpenSyncDone(bookId)) {
        postReaderSeed(win);
      }
    };

    iframe.addEventListener('load', onLoad);
    // WebView may fire load before this effect attaches.
    try {
      if (iframe.contentDocument?.readyState === 'complete') {
        onLoad();
      }
    } catch {
      /* cross-origin / not ready */
    }
    return () => iframe.removeEventListener('load', onLoad);
  }, [iframeSrc, bookId, postReaderChromeInsets, postReaderSeed]);

  React.useEffect(() => {
    const onSyncDone = (event: Event) => {
      const detail = (event as CustomEvent<{ bookId?: string }>).detail;
      if (String(detail?.bookId || '') !== bookId) return;
      const win = iframeRef.current?.contentWindow ?? null;
      postReaderSeed(win);
    };
    window.addEventListener(BOOK_OPEN_SYNC_DONE_EVENT, onSyncDone);
    return () => window.removeEventListener(BOOK_OPEN_SYNC_DONE_EVENT, onSyncDone);
  }, [bookId, postReaderSeed]);

  React.useEffect(() => {
    let cancelled = false;
    void getSafeAreaInsets().then((insets) => {
      if (cancelled) return;
      safeAreaRef.current = insets;
      postReaderChromeInsets(iframeRef.current?.contentWindow ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [iframeSrc, postReaderChromeInsets]);

  /** Re-post safe area after rotation — insets change while iframe stays mounted. */
  React.useEffect(() => {
    if (!iframeSrc) return;
    let cancelled = false;
    let debounceTimer: number | null = null;

    const refreshSafeArea = () => {
      void getSafeAreaInsets().then((insets) => {
        if (cancelled) return;
        safeAreaRef.current = insets;
        storeReaderSafeArea(insets);
        postReaderChromeInsets(iframeRef.current?.contentWindow ?? null);
      });
    };

    const onViewportChange = () => {
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(refreshSafeArea, 150);
    };

    window.addEventListener('orientationchange', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.addEventListener('resize', onViewportChange);

    return () => {
      cancelled = true;
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      window.removeEventListener('orientationchange', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      window.removeEventListener('resize', onViewportChange);
    };
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
        if (
          !offline
          && serverConfig
          && serverConfig.connectionStatus === 'connected'
        ) {
          if (livePushTimerRef.current != null) window.clearTimeout(livePushTimerRef.current);
          livePushTimerRef.current = window.setTimeout(() => {
            livePushTimerRef.current = null;
            void syncOpenBookPosition(serverConfig, bookId, positionSessionIdRef.current)
              .then((result) => {
                if (result === 'prompt') {
                  postReaderSeed(iframeRef.current?.contentWindow ?? null);
                }
              })
              .catch(() => {});
          }, 2000);
        }
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

      if (event.data?.type === 'inpx-reader-close') {
        if (!isTrustedReaderMessage(event)) return;
        requestClose();
        return;
      }
      if (
        event.data?.type === 'inpx-reader-share'
        && isTrustedReaderMessage(event)
      ) {
        const text = String(event.data.text || '').trim();
        const title = String(event.data.title || 'Цитата');
        if (text) {
          void (async () => {
            try {
              await Share.share({ title, text, dialogTitle: 'Поделиться цитатой' });
            } catch {
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                /* ignore */
              }
            }
          })();
        }
        return;
      }

      if (
        event.data?.type === 'inpx-reader-open-next-series'
        && isTrustedReaderMessage(event)
      ) {
        const nextId = String(event.data.bookId || '').trim();
        if (!nextId) return;
        void flushReaderPositionAndWait().then(() => {
          onOpenNextInSeries?.(nextId);
        });
        return;
      }

      if (
        event.data?.type === 'inpx-reader-haptic'
        && isTrustedReaderMessage(event)
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
        && isTrustedReaderMessage(event)
      ) {
        const enabled = Boolean(event.data.enabled);
        if (Capacitor.getPlatform() === 'android') {
          const statusOwner = statusBarOwnerSeq;
          void (async () => {
            try {
              await StatusBar.setOverlaysWebView({ overlay: true });
              if (statusBarOwnerSeq !== statusOwner) return;
              if (enabled) {
                await StatusBar.hide();
              } else {
                await StatusBar.show();
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
        && isTrustedReaderMessage(event)
      ) {
        (event.source as Window).postMessage({
          type: 'inpx-native-ready',
          ready: Capacitor.isNativePlatform(),
        }, '*');
        return;
      }

      if (event.data?.type === 'inpx-native-call' && isTrustedReaderMessage(event)) {
        const callGen = nativeCallGenRef.current;
        void handleNativeCall(
          event.data.id,
          event.data.method,
          event.data.data,
          iframeRef.current?.contentWindow ?? null,
          () => callGen !== nativeCallGenRef.current,
        );
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (livePushTimerRef.current != null) {
        window.clearTimeout(livePushTimerRef.current);
        livePushTimerRef.current = null;
      }
    };
  }, [bookId, einkActive, enqueuePositionPrompt, flushReaderPositionAndWait, isTrustedReaderMessage, offline, onOpenNextInSeries, onStoreSynced, postReaderSeed, requestClose, serverConfig]);

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
    const ttsMediaAction = ReaderNative.addListener('ttsMediaAction', (data) => {
      iframeRef.current?.contentWindow?.postMessage({
        type: 'inpx-native-event',
        event: 'ttsMediaAction',
        data,
      }, '*');
    });
    return () => {
      void ttsEnd.then((h) => h.remove());
      void ttsStart.then((h) => h.remove());
      void ttsMediaAction.then((h) => h.remove());
      void ReaderNative.stopTts().catch(() => {});
      void ReaderNative.updateTtsMediaSession({ active: false, playing: false }).catch(() => {});
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

  React.useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'inpx-reader-next-series',
        nextInSeries: nextInSeries?.bookId
          ? { bookId: nextInSeries.bookId, title: nextInSeries.title || '' }
          : null,
      },
      '*',
    );
  }, [nextInSeries, iframeSrc]);

  useBackHandler(() => {
    if (loadError || !iframeSrc) {
      if (loadError) onClose();
      else void requestClose();
      return true;
    }
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      void requestClose();
      return true;
    }
    win.postMessage({ type: 'inpx-reader-back' }, '*');
    return true;
  });

  if (loadError) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 p-6 bg-[var(--app-bg)] text-[var(--app-text)]">
        <p className="text-base font-semibold text-center">Не удалось открыть книгу</p>
        <p className="text-sm text-center text-[var(--app-muted)] max-w-sm">{loadError}</p>
        <button
          type="button"
          className={`min-h-12 px-4 text-sm font-bold text-[var(--app-link)] ${radii.button} ${theme.focusRing}`}
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
    <div className="fixed inset-0 z-[200]">
      <iframe
        ref={iframeRef}
        title={bookTitle}
        src={iframeSrc}
        className="absolute inset-0 h-full w-full border-0 bg-[var(--app-surface)]"
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
  isStale: () => boolean,
) {
  const reply = (result?: unknown, error?: string) => {
    if (isStale()) return;
    target?.postMessage({ type: 'inpx-native-response', id, result, error }, '*');
  };

  if (!Capacitor.isNativePlatform()) {
    reply(undefined, 'Native API unavailable');
    return;
  }

  if (!isReaderNativeBridgeMethod(method)) {
    reply(undefined, `Unknown method: ${method}`);
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
