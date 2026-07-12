import React from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Book, ServerConfig } from '../types';
import { syncDownloadedBooksOnline } from '../lib/offlineSync';
import { flushOfflineReaderStore } from '../lib/offlineReaderStore';
import { getPendingSyncCount } from '../lib/localDb';
import { processSyncQueue } from '../lib/syncQueueProcessor';
import { useSnackbar } from '../ui/Snackbar';

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
}) {
  const { canReadOnline, serverConfig, connectionStatus, downloadedBooksWithFile, inpxServer, activeReaderRef } = opts;
  const snackbar = useSnackbar();

  const [syncing, setSyncing] = React.useState(false);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [lastSyncSummary, setLastSyncSummary] = React.useState<string | null>(null);

  const wasOnlineRef = React.useRef(false);
  React.useEffect(() => {
    const justConnected = canReadOnline && !wasOnlineRef.current;
    wasOnlineRef.current = canReadOnline;
    if (!justConnected || downloadedBooksWithFile.length === 0) return;
    const activeBookId = activeReaderRef.current?.bookId;
    const bookIds = downloadedBooksWithFile.map((b) => b.id).filter((id) => id !== activeBookId);
    void syncDownloadedBooksOnline(serverConfig, bookIds);
  }, [canReadOnline, serverConfig, downloadedBooksWithFile, activeReaderRef]);

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
      void syncDownloadedBooksOnline(serverConfig, bookIds);
    });
    return () => {
      void subPromise.then((sub) => sub.remove());
    };
  }, [canReadOnline, serverConfig, downloadedBooksWithFile, activeReaderRef]);

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
        const summary = `Синхронизировано ${pending + queueProcessed} изменений`;
        setLastSyncSummary(summary);
        snackbar.show(summary, undefined, 'success');
      } catch {
        /* пользователь может синхронизировать вручную */
      }
    })();
  }, [connectionStatus, canReadOnline, downloadedBooksWithFile, inpxServer, serverConfig, snackbar]);

  const handleSyncNow = React.useCallback(async () => {
    if (!canReadOnline) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const bookIds = downloadedBooksWithFile.map((b) => b.id);
      await syncDownloadedBooksOnline(serverConfig, bookIds);
      const queueProcessed = await processSyncQueue(serverConfig);
      await inpxServer.refresh();
      setLastSyncSummary(`Синхронизировано ${bookIds.length} книг`);
      snackbar.show(
        queueProcessed > 0
          ? `Синхронизировано ${bookIds.length} книг и ${queueProcessed} операций`
          : `Синхронизировано ${bookIds.length} книг`,
        undefined,
        'success',
      );
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  }, [canReadOnline, downloadedBooksWithFile, inpxServer, serverConfig, snackbar]);

  return { syncing, syncError, lastSyncSummary, handleSyncNow, setSyncError };
}
