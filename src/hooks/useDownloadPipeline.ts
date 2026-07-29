import React from 'react';
import { Book, ServerConfig } from '../types';
import { downloadQueue } from '../lib/downloadQueue';
import { enrichBookForDownload } from '../lib/bookDownload';
import { persistBookToDirectory, removeBookFromDirectory, verifyBookFileIntegrity } from '../lib/bookStorage';
import { computeBufferDigest } from '../lib/fileDigest';
import { cacheCoverFromServer } from '../lib/coverCache';
import type { StorageDirectory } from '../lib/storageDirectory';
import { useSnackbar } from '../ui/Snackbar';

export function useDownloadPipeline(opts: {
  serverConfig: ServerConfig;
  storageDirectory: StorageDirectory | null;
  canReadOnline: boolean;
  setDownloadedBooks: React.Dispatch<React.SetStateAction<Book[]>>;
  onOpenDownloadedBook?: (book: Book) => void;
}) {
  const { serverConfig, storageDirectory, canReadOnline, setDownloadedBooks, onOpenDownloadedBook } = opts;
  const snackbar = useSnackbar();
  const onOpenRef = React.useRef(onOpenDownloadedBook);
  onOpenRef.current = onOpenDownloadedBook;

  const persistDownload = React.useCallback(
    async (book: Book, content: string, originalBuffer?: ArrayBuffer): Promise<Book> => {
      if (!storageDirectory?.uri) {
        throw new Error('Не настроена папка для сохранения книг');
      }
      if (!originalBuffer) {
        throw new Error('Не удалось получить файл книги');
      }

      const enriched = await enrichBookForDownload(serverConfig, book);
      const digest = await computeBufferDigest(originalBuffer);
      const paths = await persistBookToDirectory(storageDirectory, enriched, originalBuffer, content);
      try {
        await verifyBookFileIntegrity(storageDirectory, paths.localFileName, originalBuffer.byteLength, digest);
      } catch (err) {
        await removeBookFromDirectory(storageDirectory, paths.localFileName, paths.chaptersPath);
        throw err;
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
        void cacheCoverFromServer(storageDirectory, serverConfig, enriched.id);
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
      onComplete: async (book, content, buffer) => persistDownload(book, content, buffer),
      onSaved: (book) => {
        snackbar.show(`Скачано: ${book.title}`, {
          label: 'Открыть',
          onClick: () => onOpenRef.current?.(book),
        }, 'success');
      },
    });
  }, [canReadOnline, persistDownload, serverConfig, snackbar, storageDirectory]);

  const [queueTick, setQueueTick] = React.useState(0);
  React.useEffect(() => downloadQueue.subscribe(() => setQueueTick((t) => t + 1)), []);

  const downloadingId = React.useMemo(() => {
    void queueTick;
    const job = downloadQueue.getJobs().find((j) => j.status === 'downloading' || j.status === 'saving');
    return job?.id ?? null;
  }, [queueTick]);

  const queuedBookIds = React.useMemo(() => {
    void queueTick;
    return new Set(
      downloadQueue
        .getJobs()
        .filter((j) => j.status === 'queued')
        .map((j) => j.id),
    );
  }, [queueTick]);

  return { enqueueDownload, downloadingId, queuedBookIds, persistDownload };
}
