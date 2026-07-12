import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Download, X } from 'lucide-react';
import { Book } from '../types';
import { theme } from '../lib/appTheme';
import { textStyles } from '../ui/tokens';
import BookCover from './BookCover';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { ServerConfig } from '../types';

interface DownloadBookSheetProps {
  book: Book | null;
  serverConfig: ServerConfig;
  storageDirectory: StorageDirectory | null;
  isDownloaded: boolean;
  downloading: boolean;
  downloadError?: string | null;
  onClose: () => void;
  onDownload: (book: Book) => void | Promise<void>;
  onOpenBook: (book: Book) => void;
}

export default function DownloadBookSheet({
  book,
  serverConfig,
  storageDirectory,
  isDownloaded,
  downloading,
  downloadError,
  onClose,
  onDownload,
  onOpenBook,
}: DownloadBookSheetProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {book && (
        <div className="fixed inset-0 z-[180] flex items-end justify-center">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40"
            aria-label="Закрыть"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-sheet-title"
            className={`relative w-full max-w-lg rounded-t-2xl border shadow-xl ${theme.sheet}`}
          >
            <div className="flex items-start gap-3 p-5 pb-3">
              <BookCover
                bookId={book.id}
                serverConfig={serverConfig}
                storageDirectory={storageDirectory}
                variant="thumb"
                title={book.title}
                author={book.author}
                width={72}
                height={108}
                className={theme.coverBorder}
              />
              <div className="min-w-0 flex-1">
                <h3 id="download-sheet-title" className="text-sm font-black leading-snug line-clamp-3">{book.title}</h3>
                <p className={`text-xs mt-1 truncate ${theme.textMuted}`}>{book.author}</p>
                <p className={`${textStyles.label} mt-2 ${theme.textMuted}`}>
                  {isDownloaded
                    ? 'Книга на устройстве — можно читать без сети.'
                    : 'Скачайте книгу на устройство, чтобы читать офлайн.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={`shrink-0 ${theme.touchTarget} rounded-lg flex items-center justify-center ${theme.focusRing}`}
                aria-label="Закрыть"
              >
                <X className={`w-5 h-5 ${theme.textMuted}`} />
              </button>
            </div>

            <div className={`px-5 pt-2 pb-5 border-t ${theme.sheetFooter}`}>
              {downloadError && (
                <p className={`${textStyles.label} mb-2 text-center text-rose-500`} role="alert">{downloadError}</p>
              )}
              {isDownloaded ? (
                <button
                  type="button"
                  onClick={() => {
                    onOpenBook(book);
                    onClose();
                  }}
                  className={`w-full font-extrabold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 text-white active:scale-[0.99] transition-transform ${theme.accentBg} ${theme.focusRing}`}
                >
                  <BookOpen className="w-4 h-4" aria-hidden />
                  Читать
                </button>
              ) : downloading ? (
                <button
                  type="button"
                  disabled
                  aria-busy="true"
                  className="w-full font-extrabold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 text-white bg-slate-400 cursor-not-allowed"
                >
                  Загрузка…
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onDownload(book)}
                  className={`w-full font-extrabold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 text-white active:scale-[0.99] transition-transform ${theme.accentBg} ${theme.focusRing}`}
                >
                  <Download className="w-4 h-4" aria-hidden />
                  Скачать
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
