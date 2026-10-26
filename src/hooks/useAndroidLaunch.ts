/**
 * Обработка Android shortcut / виджетов («Продолжить», экраны приложения) и VIEW intent для fb2/epub.
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
import { bookContentUrl, displayCoverUrl } from '../lib/inpxClient';

function localRecentToBook(item: LocalRecentReadingItem, config: ServerConfig): Book {
  return {
    id: item.id,
    title: item.title,
    author: item.authorsDisplay,
    ext: item.ext,
    series: item.series,
    seriesNo: item.seriesNo,
    contentUrl: bookContentUrl(config, item.id),
    coverUrl: displayCoverUrl(config, item.id, 'thumb'),
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
  /** Widget «open» targets; closes the reader when one is open. */
  onOpenScreen: (tab: AppTab) => void;
  /** «Новое у любимых» widget: a book's page. */
  onOpenBookDetails: (book: { id: string; title: string; author: string; ext: string }) => void;
  /** Read-aloud widget: start read-aloud in this book once the reader has it open. */
  onRequestTtsAutostart: (bookId: string) => void;
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
  onOpenScreen,
  onOpenBookDetails,
  onRequestTtsAutostart,
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
  const onOpenScreenRef = React.useRef(onOpenScreen);
  const onOpenBookDetailsRef = React.useRef(onOpenBookDetails);
  const onRequestTtsAutostartRef = React.useRef(onRequestTtsAutostart);
  const snackbarRef = React.useRef(snackbar);

  serverConfigRef.current = serverConfig;
  storageDirectoryRef.current = storageDirectory;
  localRecentReadingRef.current = localRecentReading;
  downloadedBooksRef.current = downloadedBooks;
  onContinueBookRef.current = onContinueBook;
  onOpenBookRef.current = onOpenBook;
  onRegisterImportedBookRef.current = onRegisterImportedBook;
  onTabChangeRef.current = onTabChange;
  onOpenScreenRef.current = onOpenScreen;
  onOpenBookDetailsRef.current = onOpenBookDetails;
  onRequestTtsAutostartRef.current = onRequestTtsAutostart;
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
            if (payload.startTts) onRequestTtsAutostartRef.current(fromDownloaded.id);
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
        if (payload.startTts) onRequestTtsAutostartRef.current(recentOnDisk.id);
        onContinueBookRef.current(recentOnDisk);
        return;
      }

      // Widget taps fire again and again — like «continue», never remembered as handled.
      if (payload.action === 'open') {
        onOpenScreenRef.current(payload.target);
        return;
      }
      if (payload.action === 'book') {
        onOpenBookDetailsRef.current({
          id: payload.bookId,
          title: payload.title || '',
          author: payload.author || '',
          ext: payload.ext || '',
        });
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
