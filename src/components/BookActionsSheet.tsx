import React from 'react';
import {
  X,
  CheckCircle2,
  Trash2,
  Info,
  Heart,
  FolderMinus,
  FolderPlus,
} from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, elevation, radii, motion } from '../ui/tokens';
import { SheetDragHandle, sheetPanelClass } from '../ui/SheetChrome';
import DragSheet from '../ui/DragSheet';
import BookCover from './BookCover';
import ShelfPicker from './ShelfPicker';
import type { Book, ServerConfig } from '../types';
import { bookTitleWithoutVolume, displayBookTitle } from '../lib/seriesLabel';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { UiShelf } from '../lib/inpxClient';
import { useOverlayBackHandler } from '../hooks/useBackHandler';

export type BookActionsTarget = {
  book: Book;
  /** When opened from a shelf book grid — enables «Убрать с полки». */
  shelfId?: number | string;
  shelfName?: string;
  /** Opened from «Ещё» on the book page — skip actions that page already has. */
  fromDetails?: boolean;
};

interface BookActionsSheetProps {
  target: BookActionsTarget | null;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  isDownloaded: boolean;
  isRead?: boolean;
  isBookmarked?: boolean;
  isOnline: boolean;
  onClose: () => void;
  onToggleRead?: (bookId: string) => void;
  onToggleBookmark?: (bookId: string) => void;
  onRemoveFromShelf?: (bookId: string, shelfId: number | string) => void;
  onRemove?: (bookId: string) => void;
  onOpenDetails?: (book: Book) => void;
  shelves?: UiShelf[];
  onAddToShelf?: (bookId: string, shelfId: number | string) => void | boolean | Promise<void | boolean>;
  onCreateShelf?: (name: string) => Promise<number | string | null>;
}

function ActionRow({
  icon,
  danger = false,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-h-14 flex items-center gap-4 text-left border-b last:border-b-0 ${theme.divider} text-[0.9375rem] font-medium ${danger ? 'text-[var(--app-danger)]' : theme.text} active:bg-[var(--app-surface-hover)] ${theme.focusRing}`}
    >
      {icon}
      <span className="min-w-0">{children}</span>
    </button>
  );
}

/**
 * Secondary actions only. Tap on a cover/row runs the primary action;
 * long-press / ⋮ opens this sheet.
 */
export default function BookActionsSheet({
  target,
  serverConfig,
  storageDirectory,
  isDownloaded,
  isRead,
  isBookmarked,
  isOnline,
  onClose,
  onToggleRead,
  onToggleBookmark,
  onRemoveFromShelf,
  onRemove,
  onOpenDetails,
  shelves = [],
  onAddToShelf,
  onCreateShelf,
}: BookActionsSheetProps) {
  const open = Boolean(target);
  const shownRef = React.useRef(target);
  if (target) shownRef.current = target;
  const shown = target ?? shownRef.current;
  const [shelfPickerOpen, setShelfPickerOpen] = React.useState(false);
  const [shelfBusy, setShelfBusy] = React.useState(false);
  useOverlayBackHandler(open && shelfPickerOpen, () => setShelfPickerOpen(false));

  React.useEffect(() => {
    if (!open) setShelfPickerOpen(false);
  }, [open]);

  if (!shown) return null;
  const { book, shelfId, shelfName, fromDetails = false } = shown;
  const showRemoveFromShelf = shelfId != null && Boolean(onRemoveFromShelf);

  return (
    <DragSheet
      open={open}
      onClose={onClose}
      swallowOpeningPointer
      labelledBy="book-actions-title"
      className={`${sheetPanelClass} px-5 pt-4 ${elevation.sheet}`}
    >
        <SheetDragHandle />
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex gap-3 min-w-0">
            <div className="book-cover w-14 shrink-0 aspect-[2/3]">
              <span className="book-cover-inner">
                <BookCover
                  bookId={book.id}
                  title={bookTitleWithoutVolume(book)}
                  author={book.author}
                  serverConfig={serverConfig}
                  storageDirectory={storageDirectory}
                  className="absolute inset-0 w-full h-full !rounded-none !border-0"
                />
              </span>
            </div>
            <div className="min-w-0">
              <h2 id="book-actions-title" className={`${textStyles.bookTitle} line-clamp-2`}>
                {displayBookTitle(book)}
              </h2>
              <p className={`${textStyles.caption} ${theme.textMuted} truncate mt-0.5`}>{book.author}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className={`min-h-12 min-w-12 inline-flex items-center justify-center ${radii.button} ${theme.panel} ${theme.chipButton} ${theme.focusRing} ${motion.press}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={`flex flex-col border-t ${theme.divider} -mb-2`}>
          {onOpenDetails && !fromDetails && (
            <ActionRow
              icon={<Info className="w-5 h-5 shrink-0" aria-hidden />}
              onClick={() => {
                onOpenDetails(book);
                onClose();
              }}
            >
              О книге
            </ActionRow>
          )}

          {isOnline && onToggleBookmark && !fromDetails && (
            <ActionRow
              icon={(
                <Heart
                  className={`w-5 h-5 shrink-0 ${isBookmarked ? 'fill-current' : ''}`}
                  aria-hidden
                />
              )}
              onClick={() => {
                onToggleBookmark(book.id);
                onClose();
              }}
            >
              {isBookmarked ? 'Убрать из избранного' : 'В избранное'}
            </ActionRow>
          )}

          {onToggleRead && !fromDetails && (
            <ActionRow
              icon={<CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden />}
              onClick={() => {
                onToggleRead(book.id);
                onClose();
              }}
            >
              {isRead ? 'Снять «прочитано»' : 'Отметить прочитанной'}
            </ActionRow>
          )}

          {showRemoveFromShelf && (
            <ActionRow
              icon={<FolderMinus className="w-5 h-5 shrink-0" aria-hidden />}
              onClick={() => {
                onRemoveFromShelf!(book.id, shelfId!);
                onClose();
              }}
            >
              {shelfName?.trim()
                ? `Убрать с полки «${shelfName.trim()}»`
                : 'Убрать с полки'}
            </ActionRow>
          )}

          {(onAddToShelf || onCreateShelf) && !fromDetails && (
            shelfPickerOpen ? (
              <div className="pt-3 pb-1">
                <p className={`${textStyles.captionBold} ${theme.textMuted} mb-2`}>На полку</p>
                <ShelfPicker
                  shelves={shelves}
                  excludeShelfId={shelfId}
                  busy={shelfBusy}
                  onPick={(id) => {
                    if (!onAddToShelf) return;
                    setShelfBusy(true);
                    void Promise.resolve(onAddToShelf(book.id, id)).then((added) => {
                      if (added !== false) onClose();
                    }).finally(() => {
                      setShelfBusy(false);
                    });
                  }}
                  onCreate={
                    onCreateShelf
                      ? async (name) => {
                          setShelfBusy(true);
                          try {
                            const id = await onCreateShelf(name);
                            if (id == null) return false;
                            if (onAddToShelf) {
                              const added = await onAddToShelf(book.id, id);
                              if (added !== false) onClose();
                            } else {
                              onClose();
                            }
                            return true;
                          } finally {
                            setShelfBusy(false);
                          }
                        }
                      : undefined
                  }
                />
              </div>
            ) : (
              <ActionRow
                icon={<FolderPlus className="w-5 h-5 shrink-0" aria-hidden />}
                onClick={() => setShelfPickerOpen(true)}
              >
                На полку
              </ActionRow>
            )
          )}

          {isDownloaded && onRemove && (
            <ActionRow
              danger
              icon={<Trash2 className="w-5 h-5 shrink-0" aria-hidden />}
              onClick={() => {
                onRemove(book.id);
                onClose();
              }}
            >
              Удалить с устройства
            </ActionRow>
          )}
        </div>
    </DragSheet>
  );
}
