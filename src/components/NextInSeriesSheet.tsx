import React from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, Play } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, elevation, radii } from '../ui/tokens';
import Button from '../ui/Button';
import { sheetBackdropClass, sheetPanelClass, sheetPanelStyle } from '../ui/SheetChrome';
import BookCover from './BookCover';
import type { NextInSeriesResult } from '../lib/seriesNavigation';
import type { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import { useOverlayBackHandler } from '../hooks/useBackHandler';

interface NextInSeriesSheetProps {
  open: boolean;
  result: NextInSeriesResult | null;
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  onClose: () => void;
  onContinue: (book: Book) => void;
  onOpenSeries: (seriesName: string) => void;
}

export default function NextInSeriesSheet({
  open,
  result,
  serverConfig,
  storageDirectory,
  onClose,
  onContinue,
  onOpenSeries,
}: NextInSeriesSheetProps) {
  useOverlayBackHandler(open, onClose);

  if (!open || !result) return null;

  const { next, seriesDisplayName, current } = result;
  const nextNo = next.seriesNo;

  return createPortal(
    <div className={sheetBackdropClass} onClick={onClose}>
      <div
        className={`${sheetPanelClass} px-5 pt-4 ${elevation.sheet}`}
        style={sheetPanelStyle()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="next-series-title"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="next-series-title" className={textStyles.title}>
            Следующая в серии
          </h2>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className={`min-h-12 min-w-12 inline-flex items-center justify-center ${radii.button} ${theme.chipButton} ${theme.focusRing}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className={`${textStyles.caption} ${theme.textMuted} mb-4`}>
          «{current.title}» прочитана. Продолжить серию «{seriesDisplayName}»?
        </p>

        <div className="flex gap-3 mb-5">
          <div className="book-cover w-20 shrink-0 aspect-[2/3]">
            <span className="book-cover-inner">
              <BookCover
                bookId={next.id}
                title={next.title}
                author={next.author}
                serverConfig={serverConfig}
                storageDirectory={storageDirectory}
                className="absolute inset-0 w-full h-full !rounded-none !border-0"
              />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            {nextNo != null && (
              <p className={`${textStyles.caption} ${theme.accentText} mb-1`}>Том {nextNo}</p>
            )}
            <p className={`${textStyles.bookTitle} line-clamp-3`}>{next.title}</p>
            <p className={`${textStyles.caption} ${theme.textMuted} mt-1 truncate`}>{next.author}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              onContinue(next);
              onClose();
            }}
          >
            <Play className="w-4 h-4 mr-1.5" aria-hidden />
            Читать дальше
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              onOpenSeries(result.seriesName);
              onClose();
            }}
          >
            <BookOpen className="w-4 h-4 mr-1.5" aria-hidden />
            Вся серия
          </Button>
          <Button variant="ghost" fullWidth onClick={onClose}>
            Позже
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
