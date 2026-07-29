import React from 'react';
import { HardDrive } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles } from '../ui/tokens';
import { Book, ServerConfig } from '../types';
import EmptyState from '../ui/EmptyState';
import { ScreenLoader } from '../ui/Skeleton';
import BookCoverGrid from './BookCoverGrid';
import type { StorageDirectory } from '../lib/storageDirectory';

interface DeviceLibraryTabProps {
  books: Book[];
  serverConfig: ServerConfig;
  storageDirectory: StorageDirectory | null;
  storageDirectoryReady?: boolean;
  isAppDark: boolean;
  isOnline: boolean;
  canDownloadOnline: boolean;
  downloadingId?: string | null;
  readingProgressByBookId?: Record<string, number>;
  onOpenBook: (book: Book) => void;
  onContinueBook: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  onGoCatalog?: () => void;
  onGoProfile?: () => void;
  embedded?: boolean;
}

export default function DeviceLibraryTab({
  books,
  serverConfig,
  storageDirectory,
  storageDirectoryReady = true,
  isOnline,
  readingProgressByBookId = {},
  onOpenBook,
  onContinueBook,
  onBookLongPress,
  onGoCatalog,
  onGoProfile,
  embedded = false,
}: DeviceLibraryTabProps) {
  const sorted = React.useMemo(
    () => [...books].sort((a, b) => a.title.localeCompare(b.title, 'ru')),
    [books],
  );

  if (!storageDirectoryReady) {
    return <ScreenLoader label="Подготовка хранилища…" />;
  }

  if (!storageDirectory?.uri) {
    return (
      <EmptyState
        icon={HardDrive}
        title="Папка хранения не выбрана"
        description="Укажите папку для книг в настройках, затем скачайте книги из поиска."
        actionLabel={onGoProfile ? 'Открыть настройки' : undefined}
        onAction={onGoProfile}
      />
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={HardDrive}
        title="На устройстве пока нет книг"
        description={
          isOnline
            ? 'Скачайте книги из поиска — они появятся здесь и будут доступны без сети.'
            : 'Подключитесь к серверу и скачайте книги, пока есть сеть.'
        }
        actionLabel={onGoCatalog ? 'Открыть поиск' : undefined}
        onAction={onGoCatalog}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
      {!embedded && (
        <div className={`px-4 pt-3 pb-2 shrink-0 ${theme.bg}`}>
          <h2 className={textStyles.title}>На устройстве</h2>
          <p className={`${textStyles.caption} mt-0.5 ${theme.textMuted}`}>
            {sorted.length} {sorted.length === 1 ? 'книга' : sorted.length < 5 ? 'книги' : 'книг'}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <BookCoverGrid
          books={sorted}
          serverConfig={serverConfig}
          storageDirectory={storageDirectory}
          downloadedBookIds={sorted.map((b) => b.id)}
          readingProgressByBookId={readingProgressByBookId}
          onBookClick={(book) => {
            const progress = readingProgressByBookId[book.id] ?? 0;
            if (progress > 0) onContinueBook(book);
            else onOpenBook(book);
          }}
          onBookLongPress={onBookLongPress}
        />
      </div>
    </div>
  );
}
