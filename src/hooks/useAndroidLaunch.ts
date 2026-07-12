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

  const dispatch = React.useCallback(
    (payload: LaunchIntentPayload) => {
      const key = JSON.stringify(payload);
      if (handledRef.current.has(key)) return;
      handledRef.current.add(key);

      if (payload.action === 'continue') {
        const recent = localRecentReading[0];
        if (!recent) {
          snackbar.show('Нет книги для продолжения чтения');
          onTabChange('home');
          return;
        }
        onContinueBook(localRecentToBook(recent, serverConfig));
        return;
      }

      if (payload.action === 'view') {
        void (async () => {
          const existing =
            findBookByLaunchUri(payload.uri, downloadedBooks) ??
            findImportedBookByUri(downloadedBooks, payload.uri);
          if (existing) {
            onOpenBook(existing);
            return;
          }
          if (!storageDirectory?.uri) {
            snackbar.show('Выберите папку хранения в настройках');
            onTabChange('profile');
            return;
          }
          try {
            const imported = await importExternalBookFromUri(storageDirectory, payload.uri);
            onRegisterImportedBook(imported);
            snackbar.show(`Импортировано: ${imported.title}`, undefined, 'success');
            onOpenBook(imported);
          } catch {
            snackbar.show('Не удалось импортировать файл');
            onTabChange('library');
          }
        })();
      }
    },
    [
      downloadedBooks,
      localRecentReading,
      onContinueBook,
      onOpenBook,
      onRegisterImportedBook,
      onTabChange,
      serverConfig,
      snackbar,
      storageDirectory,
    ],
  );

  React.useEffect(() => {
    if (!isNativeApp() || !ready) return;

    let removeListener: (() => void) | undefined;

    const attach = async () => {
      try {
        const pending = await LaunchIntent.consumePending();
        if (isLaunchPayload(pending)) dispatch(pending);

        const handle = await LaunchIntent.addListener('launchIntent', (payload) => {
          if (isLaunchPayload(payload)) dispatch(payload);
        });
        removeListener = () => handle.remove();
      } catch (err: unknown) {
        console.warn('LaunchIntent unavailable:', err);
      }
    };

    void attach();

    const resume = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void LaunchIntent.consumePending().then((pending) => {
        if (isLaunchPayload(pending)) dispatch(pending);
      });
    });

    return () => {
      removeListener?.();
      void resume.then((h) => h.remove());
    };
  }, [dispatch, ready]);
}
