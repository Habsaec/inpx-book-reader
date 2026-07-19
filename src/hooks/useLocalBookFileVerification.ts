import React from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Book } from '../types';
import { verifyDownloadedBooksLocalFiles } from '../lib/localBookAccess';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { AppTab } from '../components/AppShell';

const RESCAN_TABS: AppTab[] = ['home', 'library', 'catalog'];

export function useLocalBookFileVerification(opts: {
  enabled: boolean;
  downloadedBooks: Book[];
  setDownloadedBooks: React.Dispatch<React.SetStateAction<Book[]>>;
  storageDirectory: StorageDirectory | null;
  onStorageDirectoryResolved?: (directory: StorageDirectory) => void;
  activeTab: AppTab;
}) {
  const { enabled, downloadedBooks, setDownloadedBooks, storageDirectory, onStorageDirectoryResolved, activeTab } =
    opts;

  const runningRef = React.useRef(false);
  const booksRef = React.useRef(downloadedBooks);
  booksRef.current = downloadedBooks;

  const verify = React.useCallback(async () => {
    if (runningRef.current) return;
    const books = booksRef.current;
    if (!books.some((b) => b.localFileName?.trim())) return;

    runningRef.current = true;
    try {
      const result = await verifyDownloadedBooksLocalFiles(books, storageDirectory);
      if (result.resolvedDirectory) {
        onStorageDirectoryResolved?.(result.resolvedDirectory);
      }
      if (result.changed) {
        setDownloadedBooks(result.books);
      }
    } finally {
      runningRef.current = false;
    }
  }, [onStorageDirectoryResolved, setDownloadedBooks, storageDirectory]);

  React.useEffect(() => {
    if (!enabled) return;
    void verify();
  }, [enabled, verify, storageDirectory?.uri]);

  React.useEffect(() => {
    if (!enabled || !RESCAN_TABS.includes(activeTab)) return;
    void verify();
  }, [activeTab, enabled, verify]);

  React.useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) return;
    const subPromise = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void verify();
    });
    return () => {
      void subPromise.then((sub) => sub.remove());
    };
  }, [enabled, verify]);
}
