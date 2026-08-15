import React from 'react';
import { Book, ServerConfig } from '../types';
import { downloadQueue } from '../lib/downloadQueue';
import { persistBookMetadataToDirectory, persistBookToDirectory, removeBookFromDirectory, verifyBookFileIntegrity } from '../lib/bookStorage';
import type { NativeBookDownloadResult } from '../lib/nativeDownload';
import { verifyNativeDownloadResult } from '../lib/nativeDownload';
import { computeBufferDigest } from '../lib/fileDigest';
import { cacheCoverFromServer } from '../lib/coverCache';
import { isAuthError } from '../lib/inpxClient';
import type { StorageDirectory } from '../lib/storageDirectory';
import { useSnackbar } from '../ui/Snackbar';

function looksLikeAuthDownloadError(message: string): boolean {
  return /401|403|устарела|недостаточно прав/i.test(message);
}

export function useDownloadPipeline(opts: {
  serverConfig: ServerConfig;
  storageDirectory: StorageDirectory | null;
  canReadOnline: boolean;
  setDownloadedBooks: React.Dispatch<React.SetStateAction<Book[]>>;
  onAuthExpired?: () => void;
}) {
  const { serverConfig, storageDirectory, canReadOnline, setDownloadedBooks, onAuthExpired } = opts;
  const snackbar = useSnackbar();
  const snackbarShowRef = React.useRef(snackbar.show);
  snackbarShowRef.current = snackbar.show;
  const onAuthExpiredRef = React.useRef(onAuthExpired);
  onAuthExpiredRef.current = onAuthExpired;

  const persistDownload = React.useCallback(
    async (
      book: Book,
      content: string,
      originalBuffer?: ArrayBuffer,
      native?: NativeBookDownloadResult,
    ): Promise<Book> => {
      if (!storageDirectory?.uri) {
        throw new Error('Не настроена папка для сохранения книг');
      }
      if (downloadQueue.isAborted(book.id)) {
        throw new Error('Отменено');
      }

      const enriched = book;
      let paths: { localFileName: string; chaptersPath: string };
      let byteLength: number;
      let digest: string;

      if (native) {
        byteLength = native.byteLength;
        digest = native.digestSha256;
        if (downloadQueue.isAborted(enriched.id)) {
          throw new Error('Отменено');
        }
        paths = await persistBookMetadataToDirectory(storageDirectory, enriched, content);
      } else {
        if (!originalBuffer) {
          throw new Error('Не удалось получить файл книги');
        }
        digest = await computeBufferDigest(originalBuffer);
        byteLength = originalBuffer.byteLength;
        if (downloadQueue.isAborted(enriched.id)) {
          throw new Error('Отменено');
        }
        paths = await persistBookToDirectory(storageDirectory, enriched, originalBuffer, content);
      }

      try {
        if (downloadQueue.isAborted(enriched.id)) {
          await removeBookFromDirectory(storageDirectory, paths.localFileName, paths.chaptersPath);
          throw new Error('Отменено');
        }
        if (native) {
          await verifyNativeDownloadResult(storageDirectory, paths.localFileName, native);
        } else {
          await verifyBookFileIntegrity(storageDirectory, paths.localFileName, byteLength, digest);
        }
      } catch (err) {
        await removeBookFromDirectory(storageDirectory, paths.localFileName, paths.chaptersPath);
        throw err;
      }
      if (downloadQueue.isAborted(enriched.id)) {
        await removeBookFromDirectory(storageDirectory, paths.localFileName, paths.chaptersPath);
        throw new Error('Отменено');
      }
      const record: Book = {
        ...enriched,
        isFavorite: enriched.isFavorite ?? book.isFavorite ?? false,
        userRating: enriched.userRating ?? book.userRating ?? 0,
        shelves: enriched.shelves ?? book.shelves ?? [],
        storageUri: storageDirectory.uri,
        ...paths,
      };

      setDownloadedBooks((prev) => {
        const exists = prev.find((b) => b.id === enriched.id);
        if (!exists) return [...prev, record];
        return prev.map((b) => (b.id === enriched.id ? { ...b, ...record } : b));
      });

      if (canReadOnline) {
        void cacheCoverFromServer(storageDirectory, serverConfig, enriched.id).catch((e: unknown) => {
          if (isAuthError(e)) onAuthExpiredRef.current?.();
        });
      }

      return record;
    },
    [canReadOnline, serverConfig, setDownloadedBooks, storageDirectory],
  );

  const enqueueDownload = React.useCallback(
    async (book: Book) => {
      if (!canReadOnline) {
        throw new Error('Подключитесь к серверу в настройках');
      }
      if (!storageDirectory?.uri) {
        throw new Error('Не настроена папка для сохранения книг');
      }
      downloadQueue.enqueue(book);
    },
    [canReadOnline, storageDirectory],
  );

  React.useEffect(() => {
    downloadQueue.configure({
      serverConfig,
      storageDirectory,
      canDownload: canReadOnline && Boolean(storageDirectory?.uri),
      onComplete: async (book, content, buffer, native) => persistDownload(book, content, buffer, native),
      onSaved: () => {},
      onError: (book, error) => {
        if (looksLikeAuthDownloadError(error)) {
          onAuthExpiredRef.current?.();
        }
        snackbarShowRef.current(
          `«${book.title || 'Книга'}»: ${error}`,
          undefined,
          'error',
        );
      },
    });
  }, [canReadOnline, persistDownload, serverConfig, storageDirectory]);

  const [queueTick, setQueueTick] = React.useState(0);
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return downloadQueue.subscribe(() => {
      if (mountedRef.current) setQueueTick((t) => t + 1);
    });
  }, []);
  React.useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const downloadingId = React.useMemo(() => {
    void queueTick;
    const job = downloadQueue.getJobs().find((j) => j.status === 'downloading' || j.status === 'saving');
    return job?.id ?? null;
  }, [queueTick]);

  const queuedBookIds = React.useMemo(() => {
    void queueTick;
    // Include downloading/saving so concurrent jobs (MAX=2) are not treated as idle.
    return new Set(
      downloadQueue
        .getJobs()
        .filter((j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'saving')
        .map((j) => j.id),
    );
  }, [queueTick]);

  return { enqueueDownload, downloadingId, queuedBookIds, persistDownload };
}
