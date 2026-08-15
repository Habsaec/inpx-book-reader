/**
 * Обработка Android shortcut «Продолжить» и VIEW intent для fb2/epub.
 */

import React from 'react';
import { App as CapApp } from '@capacitor/app';
import { Book, ServerConfig } from '../types';
import type { LocalRecentReadingItem } from '../lib/localReadingProgress';
import { isNativeApp } from '../lib/platform';
import {
  LaunchIntent,
  findBookByLaunchUri,
  isLaunchPayload,
  type LaunchIntentPayload,
} from '../lib/launchIntent';
import type { StorageDirectory } from '../lib/storageDirectory';
import { importExternalBookFromUri, findImportedBookByUri } from '../lib/importExternalBook';
import type { AppTab } from '../components/AppShell';
import { useSnackbar } from '../ui/Snackbar';

function localRecentToBook(item: LocalRecentReadingItem, config: ServerConfig): Book {
  return {
    id: item.id,
    title: item.title,
    author: item.authorsDisplay,
    ext: item.ext,
    series: item.series,
    seriesNo: item.seriesNo,
    contentUrl: `${config.url}/api/books/${item.id}/content`,
    coverUrl: `${config.url}/api/books/${item.id}/cover-thumb`,
    readProgress: item.readProgress,
    ...(item.rating && item.rating > 0 ? { rating: item.rating } : {}),
  };
}

interface UseAndroidLaunchOptions {
  ready: boolean;
  serverConfig: ServerConfig;
  storageDirectory: StorageDirectory | null;
  localRecentReading: LocalRecentReadingItem[];
  downloadedBooks: Book[];
  onContinueBook: (book: Book) => void;
  onOpenBook: (book: Book) => void;
  onRegisterImportedBook: (book: Book) => void;
  onTabChange: (tab: AppTab) => void;
}

export function useAndroidLaunch({
  ready,
  serverConfig,
  storageDirectory,
  localRecentReading,
  downloadedBooks,
  onContinueBook,
  onOpenBook,
  onRegisterImportedBook,
  onTabChange,
}: UseAndroidLaunchOptions) {
  const snackbar = useSnackbar();
  const handledRef = React.useRef(new Set<string>());
  const lastContinueAtRef = React.useRef(0);

  // Keep volatile data in refs so the launch listener effect does not remount
  // on every books/recent update (which used to cancel in-flight VIEW imports).
  const serverConfigRef = React.useRef(serverConfig);
  const storageDirectoryRef = React.useRef(storageDirectory);
  const localRecentReadingRef = React.useRef(localRecentReading);
  const downloadedBooksRef = React.useRef(downloadedBooks);
  const onContinueBookRef = React.useRef(onContinueBook);
  const onOpenBookRef = React.useRef(onOpenBook);
  const onRegisterImportedBookRef = React.useRef(onRegisterImportedBook);
  const onTabChangeRef = React.useRef(onTabChange);
  const snackbarRef = React.useRef(snackbar);

  serverConfigRef.current = serverConfig;
  storageDirectoryRef.current = storageDirectory;
  localRecentReadingRef.current = localRecentReading;
  downloadedBooksRef.current = downloadedBooks;
  onContinueBookRef.current = onContinueBook;
  onOpenBookRef.current = onOpenBook;
  onRegisterImportedBookRef.current = onRegisterImportedBook;
  onTabChangeRef.current = onTabChange;
  snackbarRef.current = snackbar;

  const dispatch = React.useCallback(
    (payload: LaunchIntentPayload, opts?: { isCancelled?: () => boolean }) => {
      const isCancelled = opts?.isCancelled ?? (() => false);

      if (payload.action === 'continue') {
        // Constant JSON key — debounce only; never permanent handled, or widget taps die after first use.
        const now = Date.now();
        if (now - lastContinueAtRef.current < 1200) return;
        lastContinueAtRef.current = now;
        const recentList = localRecentReadingRef.current;
        const wantedId = payload.bookId;
        if (wantedId) {
          const fromDownloaded = downloadedBooksRef.current.find(
            (b) => b.id === wantedId && Boolean(b.localFileName?.trim()),
          );
          if (fromDownloaded) {
            onContinueBookRef.current(fromDownloaded);
            return;
          }
          const fromRecent = recentList.find((item) => item.id === wantedId);
          if (fromRecent) {
            // Recent metadata without a local file — don't open a broken reader.
            snackbarRef.current.show('Файл книги недоступен — скачайте снова');
            onTabChangeRef.current('library');
            return;
          }
          snackbarRef.current.show('Книга с виджета ещё не доступна локально');
          onTabChangeRef.current('home');
          return;
        }
        const recent = recentList[0];
        if (!recent) {
          snackbarRef.current.show('Нет книги для продолжения чтения');
          onTabChangeRef.current('home');
          return;
        }
        const recentOnDisk = downloadedBooksRef.current.find(
          (b) => b.id === recent.id && Boolean(b.localFileName?.trim()),
        );
        if (!recentOnDisk) {
          snackbarRef.current.show('Файл книги недоступен — скачайте снова');
          onTabChangeRef.current('library');
          return;
        }
        onContinueBookRef.current(recentOnDisk);
        return;
      }

      const key = JSON.stringify(payload);
      if (handledRef.current.has(key)) return;

      if (payload.action === 'view') {
        void (async () => {
          if (isCancelled()) return;
          const books = downloadedBooksRef.current;
          const existing =
            findBookByLaunchUri(payload.uri, books) ??
            findImportedBookByUri(books, payload.uri);
          if (existing) {
            handledRef.current.add(key);
            onOpenBookRef.current(existing);
            return;
          }
          const dir = storageDirectoryRef.current;
          if (!dir?.uri) {
            if (isCancelled()) return;
            // Don't mark handled — user may pick a folder and re-launch the same URI.
            snackbarRef.current.show('Выберите папку хранения в настройках');
            onTabChangeRef.current('profile');
            return;
          }
          try {
            const imported = await importExternalBookFromUri(dir, payload.uri);
            // Import finished — deliver even if the effect rebind cancelled the old listener.
            handledRef.current.add(key);
            onRegisterImportedBookRef.current(imported);
            onOpenBookRef.current(imported);
          } catch {
            if (isCancelled()) return;
            snackbarRef.current.show('Не удалось импортировать файл');
            onTabChangeRef.current('library');
          }
        })();
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!isNativeApp() || !ready) return;

    let cancelled = false;
    const isCancelled = () => cancelled;
    const listenerPromise = (async () => {
      try {
        const pending = await LaunchIntent.consumePending();
        if (!cancelled && isLaunchPayload(pending)) dispatch(pending, { isCancelled });

        return await LaunchIntent.addListener('launchIntent', (payload) => {
          if (isLaunchPayload(payload)) dispatch(payload, { isCancelled });
        });
      } catch (err: unknown) {
        console.warn('LaunchIntent unavailable:', err);
        return null;
      }
    })();

    const resume = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void LaunchIntent.consumePending()
        .then((pending) => {
          if (!cancelled && isLaunchPayload(pending)) dispatch(pending, { isCancelled });
        })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
      void listenerPromise.then((handle) => handle?.remove()).catch(() => {});
      void resume.then((h) => h.remove()).catch(() => {});
    };
  }, [dispatch, ready]);
}
