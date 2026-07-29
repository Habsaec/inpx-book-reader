import React from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Book } from '../types';
import { verifyDownloadedBooksLocalFiles } from '../lib/localBookAccess';
import { downloadQueue } from '../lib/downloadQueue';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { AppTab } from '../components/AppShell';
import { useSnackbar } from '../ui/Snackbar';

const RESCAN_TABS: AppTab[] = ['library', 'catalog'];

export function useLocalBookFileVerification(opts: {
  enabled: boolean;
  downloadedBooks: Book[];
  setDownloadedBooks: React.Dispatch<React.SetStateAction<Book[]>>;
  storageDirectory: StorageDirectory | null;
  onStorageDirectoryResolved?: (directory: StorageDirectory) => void;
  activeTab: AppTab;
  canDownloadOnline?: boolean;
  onPromptRedownload?: (book: Book) => void;
}) {
  const {
    enabled,
    downloadedBooks,
    setDownloadedBooks,
    storageDirectory,
    onStorageDirectoryResolved,
    activeTab,
    canDownloadOnline = false,
    onPromptRedownload,
  } = opts;

  const snackbar = useSnackbar();
  const runningRef = React.useRef(false);
  const booksRef = React.useRef(downloadedBooks);
  booksRef.current = downloadedBooks;
  const storageUriRef = React.useRef(storageDirectory?.uri);
  storageUriRef.current = storageDirectory?.uri;
  const onResolvedRef = React.useRef(onStorageDirectoryResolved);
  onResolvedRef.current = onStorageDirectoryResolved;
  const onPromptRef = React.useRef(onPromptRedownload);
  onPromptRef.current = onPromptRedownload;
  const canDownloadRef = React.useRef(canDownloadOnline);
  canDownloadRef.current = canDownloadOnline;

  const verify = React.useCallback(async () => {
    if (runningRef.current) return;
    const books = booksRef.current;
    if (!books.some((b) => b.localFileName?.trim())) return;

    runningRef.current = true;
    try {
      const result = await verifyDownloadedBooksLocalFiles(books, storageDirectory);
      // Only propagate when URI actually changed — otherwise setState → effect → infinite fileExists storm.
      if (result.resolvedDirectory && result.resolvedDirectory.uri !== storageUriRef.current) {
        onResolvedRef.current?.(result.resolvedDirectory);
      }
      if (result.changed) {
        setDownloadedBooks(result.books);
        for (const id of result.missingBookIds) {
          downloadQueue.remove(id);
        }
        if (result.missingBookIds.length > 0) {
          const first = books.find((b) => result.missingBookIds.includes(b.id));
          const n = result.missingBookIds.length;
          const msg =
            n === 1
              ? `Файл «${first?.title || 'книга'}» недоступен`
              : `Недоступны файлы: ${n} книг`;
          if (canDownloadRef.current && first && onPromptRef.current) {
            snackbar.show(msg, { label: 'Скачать', onClick: () => onPromptRef.current?.(first) }, 'error');
          } else {
            snackbar.show(msg, undefined, 'error');
          }
        }
      }
    } finally {
      runningRef.current = false;
    }
  }, [setDownloadedBooks, storageDirectory, snackbar]);

  React.useEffect(() => {
    if (!enabled) return;
    void verify();
  }, [enabled, verify]);

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
