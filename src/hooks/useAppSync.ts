import React from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Book, ServerConfig } from '../types';
import { syncDownloadedBooksOnline } from '../lib/offlineSync';
import { flushOfflineReaderStore } from '../lib/offlineReaderStore';
import { getPendingSyncCount } from '../lib/localDb';
import { processSyncQueue } from '../lib/syncQueueProcessor';
import { formatSuggestCount } from '../lib/catalogBookPool';

interface InpxServerSync {
  refresh: () => Promise<void>;
}

export function useAppSync(opts: {
  canReadOnline: boolean;
  serverConfig: ServerConfig;
  connectionStatus: ServerConfig['connectionStatus'];
  downloadedBooksWithFile: Book[];
  inpxServer: InpxServerSync;
  activeReaderRef: React.RefObject<{ bookId: string } | null>;
  /** Invalidate library notes/bookmarks memos after reader store sync. */
  onReaderStoreSynced?: () => void;
}) {
  const {
    canReadOnline,
    serverConfig,
    connectionStatus,
    downloadedBooksWithFile,
    inpxServer,
    activeReaderRef,
    onReaderStoreSynced,
  } = opts;

  const [syncing, setSyncing] = React.useState(false);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [lastSyncSummary, setLastSyncSummary] = React.useState<string | null>(null);

  const onSyncedRef = React.useRef(onReaderStoreSynced);
  onSyncedRef.current = onReaderStoreSynced;

  const bumpAfterReaderSync = React.useCallback(() => {
    onSyncedRef.current?.();
  }, []);

  const wasOnlineRef = React.useRef(false);
  React.useEffect(() => {
    const justConnected = canReadOnline && !wasOnlineRef.current;
    wasOnlineRef.current = canReadOnline;
    if (!justConnected || downloadedBooksWithFile.length === 0) return;
    const activeBookId = activeReaderRef.current?.bookId;
    const bookIds = downloadedBooksWithFile.map((b) => b.id).filter((id) => id !== activeBookId);
    void syncDownloadedBooksOnline(serverConfig, bookIds).then(bumpAfterReaderSync);
  }, [canReadOnline, serverConfig, downloadedBooksWithFile, activeReaderRef, bumpAfterReaderSync]);

  React.useEffect(() => {
    if (!canReadOnline || !Capacitor.isNativePlatform()) return;
    const subPromise = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (downloadedBooksWithFile.length === 0) return;
      if (!isActive) {
        void flushOfflineReaderStore();
        return;
      }
      const activeBookId = activeReaderRef.current?.bookId;
      const bookIds = downloadedBooksWithFile.map((b) => b.id).filter((id) => id !== activeBookId);
      void syncDownloadedBooksOnline(serverConfig, bookIds).then(bumpAfterReaderSync);
    });
    return () => {
      void subPromise.then((sub) => sub.remove());
    };
  }, [canReadOnline, serverConfig, downloadedBooksWithFile, activeReaderRef, bumpAfterReaderSync]);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const onVisibilityChange = () => {
      if (document.hidden) void flushOfflineReaderStore();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const prevConnectionStatusRef = React.useRef(connectionStatus);
  React.useEffect(() => {
    const prev = prevConnectionStatusRef.current;
    prevConnectionStatusRef.current = connectionStatus;
    if (prev === 'connected' || connectionStatus !== 'connected' || !canReadOnline) return;

    void (async () => {
      const pending = await getPendingSyncCount();
      if (pending <= 0) return;
      const bookIds = downloadedBooksWithFile.map((b) => b.id);
      if (!bookIds.length) return;
      try {
        await syncDownloadedBooksOnline(serverConfig, bookIds);
        const queueProcessed = await processSyncQueue(serverConfig);
        await inpxServer.refresh();
        bumpAfterReaderSync();
        const summary = `Синхронизировано ${pending + queueProcessed} изменений`;
        setLastSyncSummary(summary);
      } catch {
        /* пользователь может синхронизировать вручную */
      }
    })();
  }, [connectionStatus, canReadOnline, downloadedBooksWithFile, inpxServer, serverConfig, bumpAfterReaderSync]);

  const handleSyncNow = React.useCallback(async () => {
    if (!canReadOnline) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const bookIds = downloadedBooksWithFile.map((b) => b.id);
      await syncDownloadedBooksOnline(serverConfig, bookIds);
      const queueProcessed = await processSyncQueue(serverConfig);
      await inpxServer.refresh();
      bumpAfterReaderSync();
      setLastSyncSummary(
        queueProcessed > 0
          ? `Синхронизировано: ${formatSuggestCount(bookIds.length)} и ${queueProcessed} операций`
          : `Синхронизировано: ${formatSuggestCount(bookIds.length)}`,
      );
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  }, [canReadOnline, downloadedBooksWithFile, inpxServer, serverConfig, bumpAfterReaderSync]);

  return { syncing, syncError, lastSyncSummary, handleSyncNow, setSyncError };
}
