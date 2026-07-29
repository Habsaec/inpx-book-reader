import React from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  BookOpen,
  CheckCircle2,
  Trash2,
  Info,
  Heart,
  FolderMinus,
} from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, elevation } from '../ui/tokens';
import Button from '../ui/Button';
import { SheetDragHandle, sheetBackdropClass, sheetPanelClass, sheetPanelStyle } from '../ui/SheetChrome';
import BookCover from './BookCover';
import type { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { useOverlayBackHandler } from '../hooks/useBackHandler';

export type BookActionsTarget = {
  book: Book;
  /** When opened from a shelf book grid — enables «Убрать с полки». */
  shelfId?: number;
  shelfName?: string;
};

interface BookActionsSheetProps {
  target: BookActionsTarget | null;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  isDownloaded: boolean;
  isDownloading?: boolean;
  isRead?: boolean;
  isBookmarked?: boolean;
  isOnline: boolean;
  onClose: () => void;
  onOpen: (book: Book) => void;
  onDownload?: (book: Book) => void;
  onToggleRead?: (bookId: string) => void;
  onToggleBookmark?: (bookId: string) => void;
  onRemoveFromShelf?: (bookId: string, shelfId: number) => void;
  onRemove?: (bookId: string) => void;
  onOpenDetails?: (book: Book) => void;
}

/**
 * Unified long-press menu for every book surface (Home, Catalog, Library).
 * Action order is fixed so the same gesture always feels the same.
 */
export default function BookActionsSheet({
  target,
  serverConfig,
  storageDirectory,
  isDownloaded,
  isDownloading,
  isRead,
  isBookmarked,
  isOnline,
  onClose,
  onOpen,
  onDownload,
  onToggleRead,
  onToggleBookmark,
  onRemoveFromShelf,
  onRemove,
  onOpenDetails,
}: BookActionsSheetProps) {
  const open = Boolean(target);
  useOverlayBackHandler(open, onClose);

  if (!target) return null;
  const { book, shelfId, shelfName } = target;
  const showRemoveFromShelf =
    shelfId != null && Number.isFinite(shelfId) && Boolean(onRemoveFromShelf);

  return createPortal(
    <div className={sheetBackdropClass} onClick={onClose}>
      <div
        className={`${sheetPanelClass} px-5 pt-4 ${elevation.sheet}`}
        style={sheetPanelStyle()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-actions-title"
      >
        <SheetDragHandle />
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex gap-3 min-w-0">
            <div className="w-14 shrink-0 aspect-[2/3] rounded-lg overflow-hidden relative bg-[var(--app-surface)]">
              <BookCover
                bookId={book.id}
                title={book.title}
                author={book.author}
                serverConfig={serverConfig}
                storageDirectory={storageDirectory}
                className="absolute inset-0 w-full h-full"
              />
            </div>
            <div className="min-w-0">
              <h2 id="book-actions-title" className={`${textStyles.bookTitle} line-clamp-2`}>
                {book.title}
              </h2>
              <p className={`${textStyles.caption} ${theme.textMuted} truncate mt-0.5`}>{book.author}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className={`min-h-12 min-w-12 inline-flex items-center justify-center rounded-lg ${theme.chipButton} ${theme.focusRing}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {isDownloaded ? (
            <Button
              fullWidth
              onClick={() => {
                onOpen(book);
                onClose();
              }}
            >
              <BookOpen className="w-4 h-4" aria-hidden />
              Читать
            </Button>
          ) : isOnline && onDownload ? (
            <Button
              fullWidth
              disabled={isDownloading}
              onClick={() => {
                onDownload(book);
                onClose();
              }}
            >
              <Download className="w-4 h-4" aria-hidden />
              {isDownloading ? 'Качается…' : 'Скачать'}
            </Button>
          ) : null}

          {onOpenDetails && (
            <Button
              fullWidth
              variant="secondary"
              onClick={() => {
                onOpenDetails(book);
                onClose();
              }}
            >
              <Info className="w-4 h-4" aria-hidden />
              Подробнее
            </Button>
          )}

          {isOnline && onToggleBookmark && (
            <Button
              fullWidth
              variant="secondary"
              onClick={() => {
                onToggleBookmark(book.id);
                onClose();
              }}
            >
              <Heart
                className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`}
                aria-hidden
              />
              {isBookmarked ? 'Убрать из избранного' : 'В избранное'}
            </Button>
          )}

          {onToggleRead && (
            <Button
              fullWidth
              variant="secondary"
              onClick={() => {
                onToggleRead(book.id);
                onClose();
              }}
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden />
              {isRead ? 'Снять «прочитано»' : 'Отметить прочитанной'}
            </Button>
          )}

          {showRemoveFromShelf && (
            <Button
              fullWidth
              variant="secondary"
              onClick={() => {
                onRemoveFromShelf!(book.id, shelfId!);
                onClose();
              }}
            >
              <FolderMinus className="w-4 h-4" aria-hidden />
              {shelfName?.trim()
                ? `Убрать с полки «${shelfName.trim()}»`
                : 'Убрать с полки'}
            </Button>
          )}

          {isDownloaded && onRemove && (
            <Button
              fullWidth
              variant="danger"
              onClick={() => {
                onRemove(book.id);
                onClose();
              }}
            >
              <Trash2 className="w-4 h-4" aria-hidden />
              Удалить с устройства
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
