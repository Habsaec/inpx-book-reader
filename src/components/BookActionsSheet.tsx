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
import Button from '../ui/Button';
import { SheetDragHandle, sheetPanelClass } from '../ui/SheetChrome';
import DragSheet from '../ui/DragSheet';
import BookCover from './BookCover';
import ShelfPicker from './ShelfPicker';
import type { Book, ServerConfig } from '../types';
import { displayBookTitle } from '../lib/seriesLabel';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { UiShelf } from '../lib/inpxClient';
import { useOverlayBackHandler } from '../hooks/useBackHandler';

export type BookActionsTarget = {
  book: Book;
  /** When opened from a shelf book grid — enables «Убрать с полки». */
  shelfId?: number | string;
  shelfName?: string;
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
  const { book, shelfId, shelfName } = shown;
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
                  title={book.title}
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

        <div className="flex flex-col gap-2.5">
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
              О книге
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

          {(onAddToShelf || onCreateShelf) && (
            shelfPickerOpen ? (
              <div className="pt-1">
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
                            if (id != null && onAddToShelf) {
                              const added = await onAddToShelf(book.id, id);
                              if (added !== false) onClose();
                            } else if (id != null) {
                              onClose();
                            }
                          } finally {
                            setShelfBusy(false);
                          }
                        }
                      : undefined
                  }
                />
              </div>
            ) : (
              <Button
                fullWidth
                variant="secondary"
                onClick={() => setShelfPickerOpen(true)}
              >
                <FolderPlus className="w-4 h-4" aria-hidden />
                На полку
              </Button>
            )
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
    </DragSheet>
  );
}
