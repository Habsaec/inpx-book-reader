import React from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Book } from '../types';
import { verifyDownloadedBooksLocalFiles } from '../lib/localBookAccess';
import { downloadQueue } from '../lib/downloadQueue';
import type { StorageDirectory } from '../lib/storageDirectory';
import {
  checkStorageAccess,
  ensureStorageDirectory,
  isStoragePermissionError,
  STORAGE_PERMISSION_REVOKED_MSG,
} from '../lib/storageDirectory';
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
  const snackbarShowRef = React.useRef(snackbar.show);
  snackbarShowRef.current = snackbar.show;
  const runningRef = React.useRef(false);
  const booksRef = React.useRef(downloadedBooks);
  booksRef.current = downloadedBooks;
  const storageDirectoryRef = React.useRef(storageDirectory);
  storageDirectoryRef.current = storageDirectory;
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
      let directory = storageDirectoryRef.current;
      const access = await checkStorageAccess(directory);
      if (!access.ok && directory?.uri?.startsWith('content://')) {
        const fallback = await ensureStorageDirectory(directory);
        if (fallback && fallback.uri !== directory.uri) {
          directory = fallback;
          onResolvedRef.current?.(fallback);
          snackbarShowRef.current(
            'Доступ к выбранной папке отозван — используется папка по умолчанию.',
            undefined,
            'error',
          );
        } else {
          snackbarShowRef.current(STORAGE_PERMISSION_REVOKED_MSG, undefined, 'error');
          return;
        }
      }

      const result = await verifyDownloadedBooksLocalFiles(books, directory);
      // Only propagate when URI actually changed — otherwise setState → effect → infinite fileExists storm.
      if (result.resolvedDirectory && result.resolvedDirectory.uri !== storageUriRef.current) {
        onResolvedRef.current?.(result.resolvedDirectory);
      }
      if (result.changed) {
        // Merge по id: verify работает со снапшотом, а параллельные обновления
        // (завершившаяся загрузка, sync merge) не должны затираться.
        const updates = new Map(result.changedBooks.map((b) => [b.id, b]));
        setDownloadedBooks((prev) => prev.map((b) => updates.get(b.id) ?? b));
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
            snackbarShowRef.current(msg, { label: 'Скачать', onClick: () => onPromptRef.current?.(first) }, 'error');
          } else {
            snackbarShowRef.current(msg, undefined, 'error');
          }
        }
      }
    } catch (err) {
      if (isStoragePermissionError(err)) {
        snackbarShowRef.current(STORAGE_PERMISSION_REVOKED_MSG, undefined, 'error');
      } else {
        console.warn('[useLocalBookFileVerification] verify failed:', err);
      }
    } finally {
      runningRef.current = false;
    }
  }, [setDownloadedBooks]);

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
      void subPromise.then((sub) => sub.remove()).catch(() => {});
    };
  }, [enabled, verify]);
}
