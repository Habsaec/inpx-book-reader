import React from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Book, ServerConfig } from '../types';
import { flushOfflineReaderStore } from '../lib/offlineReaderStore';
import {
  requestBackgroundSync,
  shouldRunPeriodicSync,
  type BackgroundSyncReason,
} from '../lib/backgroundSync';

interface InpxServerSync {
  refresh: () => Promise<void>;
}

const PERIODIC_MS = 60_000;

/**
 * Silent background sync only — no Sync Center UI, badges, or user-facing progress.
 * Auth expiry still surfaces via onAuthExpired (re-login), not as a sync banner.
 */
export function useAppSync(opts: {
  canReadOnline: boolean;
  serverConfig: ServerConfig;
  connectionStatus: ServerConfig['connectionStatus'];
  downloadedBooksWithFile: Book[];
  inpxServer: InpxServerSync;
  activeReaderRef: React.RefObject<{ bookId: string } | null>;
  /** Invalidate library notes/bookmarks memos after reader store sync. */
  onReaderStoreSynced?: () => void;
  onAuthExpired?: () => void;
}) {
  const {
    canReadOnline,
    serverConfig,
    connectionStatus,
    downloadedBooksWithFile,
    inpxServer,
    activeReaderRef,
    onReaderStoreSynced,
    onAuthExpired,
  } = opts;

  const onSyncedRef = React.useRef(onReaderStoreSynced);
  onSyncedRef.current = onReaderStoreSynced;
  const onAuthExpiredRef = React.useRef(onAuthExpired);
  onAuthExpiredRef.current = onAuthExpired;
  const refreshRef = React.useRef(inpxServer.refresh);
  refreshRef.current = inpxServer.refresh;
  const serverConfigRef = React.useRef(serverConfig);
  serverConfigRef.current = serverConfig;
  const closingBookIdRef = React.useRef<string | null>(null);

  const bookIdsRef = React.useRef<string[]>([]);
  bookIdsRef.current = downloadedBooksWithFile
    .map((b) => b.id)
    .filter((id) => !String(id).startsWith('local:import:'));

  const setClosingBookId = React.useCallback((bookId: string | null) => {
    closingBookIdRef.current = bookId;
  }, []);

  const runSilent = React.useCallback(
    async (reason: BackgroundSyncReason) => {
      if (!canReadOnline) return;
      const result = await requestBackgroundSync({
        reason,
        bookIds: bookIdsRef.current,
        excludeBookId: activeReaderRef.current?.bookId ?? closingBookIdRef.current,
        serverConfig: serverConfigRef.current,
        refresh: () => refreshRef.current(),
        onReaderStoreSynced: () => onSyncedRef.current?.(),
      });
      if (result.authExpired) {
        onAuthExpiredRef.current?.();
      }
    },
    [activeReaderRef, canReadOnline],
  );

  const runSilentSafe = React.useCallback(
    (reason: BackgroundSyncReason) => {
      void runSilent(reason).catch((err) => console.warn('[useAppSync] silent sync failed:', err));
    },
    [runSilent],
  );

  const wasOnlineRef = React.useRef(false);
  React.useEffect(() => {
    const justConnected = canReadOnline && !wasOnlineRef.current;
    wasOnlineRef.current = canReadOnline;
    if (!justConnected) return;
    runSilentSafe('online');
  }, [canReadOnline, runSilentSafe]);

  React.useEffect(() => {
    if (!canReadOnline || !Capacitor.isNativePlatform()) return;
    const subPromise = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        void flushOfflineReaderStore().catch(() => {});
        return;
      }
      runSilentSafe('resume');
    });
    return () => {
      void subPromise.then((sub) => sub.remove()).catch(() => {});
    };
  }, [canReadOnline, runSilentSafe]);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const onVisibilityChange = () => {
      if (document.hidden) void flushOfflineReaderStore().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const prevConnectionStatusRef = React.useRef(connectionStatus);
  React.useEffect(() => {
    const prev = prevConnectionStatusRef.current;
    prevConnectionStatusRef.current = connectionStatus;
    if (prev === 'connected' || connectionStatus !== 'connected' || !canReadOnline) return;
    runSilentSafe('connected');
  }, [connectionStatus, canReadOnline, runSilentSafe]);

  React.useEffect(() => {
    if (!canReadOnline) return;
    const timer = window.setInterval(() => {
      void (async () => {
        const ids = bookIdsRef.current;
        if (!(await shouldRunPeriodicSync(ids))) return;
        await runSilent('periodic');
      })().catch((err) => console.warn('[useAppSync] periodic sync failed:', err));
    }, PERIODIC_MS);
    return () => window.clearInterval(timer);
  }, [canReadOnline, runSilent]);

  /** After closing a book — silent full cycle (includes queue + soft refresh). */
  const requestSyncAfterClose = React.useCallback(() => {
    runSilentSafe('after-close');
  }, [runSilentSafe]);

  return {
    requestSyncAfterClose,
    setClosingBookId,
  };
}
