import React from 'react';
import { HardDrive, Trash2, Download, FileJson, Upload, Check, CloudUpload } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic } from '../ui/tokens';
import { Book, ServerConfig } from '../types';
import BookCover from './BookCover';
import ReadProgressBar from './ReadProgressBar';
import type { StorageDirectory } from '../lib/storageDirectory';
import {
  exportOfflineReaderJson,
  importOfflineReaderJson,
  readOfflineReaderData,
} from '../lib/offlineReaderStore';
import { bookHasPendingSync } from '../lib/syncStats';
import BookMetaSummary from './BookMetaSummary';

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
  onRemoveBook: (bookId: string) => void | Promise<void>;
  removingBookIds?: Set<string>;
  onDownloadBook?: (book: Book) => void | Promise<void>;
  embedded?: boolean;
}

export default function DeviceLibraryTab({
  books,
  serverConfig,
  storageDirectory,
  storageDirectoryReady = true,
  isAppDark,
  isOnline,
  canDownloadOnline,
  downloadingId,
  readingProgressByBookId = {},
  onOpenBook,
  onContinueBook,
  onRemoveBook,
  removingBookIds,
  onDownloadBook,
  embedded = false,
}: DeviceLibraryTabProps) {
  const [confirmRemoveId, setConfirmRemoveId] = React.useState<string | null>(null);
  const [importError, setImportError] = React.useState('');
  const importRef = React.useRef<HTMLInputElement>(null);
  const [importTargetId, setImportTargetId] = React.useState<string | null>(null);

  const sorted = React.useMemo(
    () => [...books].sort((a, b) => a.title.localeCompare(b.title, 'ru')),
    [books],
  );

  const handleExport = (bookId: string, title: string) => {
    const json = exportOfflineReaderJson(bookId);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w\s-]/g, '').slice(0, 40)}-notes.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPick = (bookId: string) => {
    setImportError('');
    setImportTargetId(bookId);
    importRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !importTargetId) return;
    try {
      const text = await file.text();
      const result = importOfflineReaderJson(importTargetId, text);
      if (!result.ok) setImportError(result.error || 'Ошибка импорта');
    } catch {
      setImportError('Не удалось прочитать файл');
    }
    setImportTargetId(null);
  };

  const handleRemove = async (bookId: string) => {
    if (confirmRemoveId !== bookId) {
      setConfirmRemoveId(bookId);
      return;
    }
    setConfirmRemoveId(null);
    await onRemoveBook(bookId);
  };

  if (!storageDirectoryReady) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
        <HardDrive className={`w-10 h-10 ${theme.textMuted}`} />
        <p className="text-xs font-black">Подготовка хранилища…</p>
      </div>
    );
  }

  if (!storageDirectory?.uri) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
        <HardDrive className={`w-10 h-10 ${theme.textMuted}`} />
        <p className="text-xs font-black">Папка хранения не выбрана</p>
        <p className={`${textStyles.micro} leading-relaxed ${theme.textMuted}`}>
          Укажите папку для книг в настройках, затем скачайте книги из каталога.
        </p>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
        <HardDrive className={`w-10 h-10 ${theme.textMuted}`} />
        <p className="text-xs font-black">На устройстве пока нет книг</p>
        <p className={`${textStyles.micro} leading-relaxed ${theme.textMuted}`}>
          {isOnline
            ? 'Скачайте книги из каталога или профиля — они появятся здесь и будут доступны без сети.'
            : 'Подключитесь к серверу и скачайте книги, пока есть сеть.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
      {!embedded && (
        <div className={`px-4 py-3 shrink-0 border-b ${theme.header}`}>
          <h2 className="text-sm font-black">На устройстве</h2>
          <p className={`${textStyles.label} mt-0.5 ${theme.textMuted}`}>
            {sorted.length} {sorted.length === 1 ? 'книга' : sorted.length < 5 ? 'книги' : 'книг'} · чтение без сервера
          </p>
        </div>
      )}

      {importError && (
        <div className={`mx-4 mt-3 px-3 py-2 rounded-xl border ${semantic.errorBg} ${textStyles.microBold}`} role="alert">
          {importError}
        </div>
      )}

      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {sorted.map((book) => {
          const progress = readingProgressByBookId[book.id] ?? 0;
          const isFullyRead = progress >= 100;
          const offline = readOfflineReaderData(book.id);
          const notesCount = offline.annotations.length;
          const bmCount = offline.bookmarks.length;
          const isRemoving = confirmRemoveId === book.id;
          const isDeleting = removingBookIds?.has(book.id);
          const pendingSync = bookHasPendingSync(book.id);

          return (
            <div
              key={book.id}
              className={`border-b last:border-b-0 ${theme.divider}`}
            >
              <button
                type="button"
                className={`w-full grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-3 text-left rounded-xl -mx-1 px-1 ${theme.rowPress} ${theme.focusRing}`}
                aria-label={progress > 0 ? `Продолжить: ${book.title}` : `Открыть: ${book.title}`}
                onClick={() => (progress > 0 ? onContinueBook(book) : onOpenBook(book))}
              >
                <div className="relative shrink-0">
                  <BookCover
                    bookId={book.id}
                    serverConfig={serverConfig}
                    storageDirectory={storageDirectory}
                    variant="thumb"
                    title={book.title}
                    author={book.author}
                    width={64}
                    height={96}
                    className={`rounded-lg ${theme.coverBorder}`}
                  />
                  {isFullyRead && (
                    <span
                      className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-[var(--app-success)] text-white flex items-center justify-center shadow-sm border border-white/30"
                      title="Прочитано"
                      aria-label="Прочитано"
                    >
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <span className="min-w-0 block">
                  <span className={`block line-clamp-2 ${textStyles.bookTitle} ${theme.text}`}>
                    {book.title}
                  </span>
                  <span className={`block ${textStyles.caption} mt-1 truncate ${theme.textMuted}`}>{book.author}</span>
                  <span className="block mt-1">
                    <BookMetaSummary book={book} showDescription />
                  </span>
                  {pendingSync && (
                    <span className={`inline-flex items-center gap-0.5 mt-0.5 ${textStyles.microBold} ${semantic.warning}`} title="Ожидает синхронизации">
                      <CloudUpload className="w-3 h-3" aria-hidden />
                      Синхр.
                    </span>
                  )}
                  {progress > 0 && (
                    <span className="block mt-1.5">
                      <ReadProgressBar value={progress} showLabel={!isFullyRead} />
                      {isFullyRead && (
                        <span className={`block ${textStyles.labelBold} mt-0.5 ${theme.text}`}>Прочитано</span>
                      )}
                    </span>
                  )}
                  {(notesCount > 0 || bmCount > 0) && (
                    <span className={`block ${textStyles.micro} mt-1 ${theme.textMuted}`}>
                      {bmCount > 0 ? `${bmCount} закл.` : ''}
                      {bmCount > 0 && notesCount > 0 ? ' · ' : ''}
                      {notesCount > 0 ? `${notesCount} зам.` : ''}
                    </span>
                  )}
                </span>
              </button>

              <div className={`flex border-t divide-x ${theme.divider}`}>
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 ${textStyles.microBold} transition-colors hover:bg-[var(--app-surface-hover)] active:bg-[var(--app-surface-hover)] ${theme.textMuted} ${theme.focusRing}`}
                  onClick={() => handleExport(book.id, book.title)}
                  title="Экспорт заметок"
                >
                  <FileJson className="w-3.5 h-3.5" aria-hidden />
                  Экспорт
                </button>
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 ${textStyles.microBold} transition-colors hover:bg-[var(--app-surface-hover)] active:bg-[var(--app-surface-hover)] ${theme.textMuted} ${theme.focusRing}`}
                  onClick={() => handleImportPick(book.id)}
                  title="Импорт заметок"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden />
                  Импорт
                </button>
                {canDownloadOnline && onDownloadBook && !book.localFileName && (
                  <button
                    type="button"
                    disabled={downloadingId === book.id}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 ${textStyles.microBold} transition-colors hover:bg-[var(--app-surface-hover)] active:bg-[var(--app-surface-hover)] ${theme.accentText} ${theme.focusRing} disabled:opacity-50 disabled:cursor-not-allowed`}
                    onClick={() => onDownloadBook(book)}
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden />
                    {downloadingId === book.id ? '…' : 'Скачать'}
                  </button>
                )}
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 ${textStyles.microBold} transition-colors hover:bg-[var(--app-surface-hover)] active:bg-[var(--app-surface-hover)] ${
                    isRemoving ? semantic.error : theme.textMuted
                  } ${theme.focusRing}`}
                  onClick={() => handleRemove(book.id)}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>Удаление…</>
                  ) : isRemoving ? (
                    <>Подтвердить</>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      Удалить
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
