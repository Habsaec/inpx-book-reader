import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic, motion } from '../ui/tokens';
import { ChevronRight, Check, Download, Trash2, CloudUpload } from 'lucide-react';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import BookCover from './BookCover';
import ReadProgressBar from './ReadProgressBar';
import DownloadStatusLabel from './DownloadStatusLabel';
import BookMetaSummary from './BookMetaSummary';

interface LiteBookRowProps {
  book: Book;
  serverConfig?: ServerConfig | null;
  storageDirectory?: StorageDirectory | null;
  isRead?: boolean;
  readProgress?: number;
  isDownloaded?: boolean;
  showDownloadStatus?: boolean;
  showDownloadButton?: boolean;
  isDownloading?: boolean;
  hasPendingSync?: boolean;
  onDownload?: () => void;
  isAppDark?: boolean;
  onClick?: () => void;
  subtitle?: string;
  onRemove?: () => void;
  removeLabel?: string;
  /** Компактная строка для главной (меньше обложка, serif-заголовок) */
  compact?: boolean;
}

export default function LiteBookRow({
  book,
  serverConfig,
  storageDirectory,
  isRead = false,
  readProgress = 0,
  isDownloaded = false,
  showDownloadStatus = false,
  showDownloadButton = false,
  isDownloading = false,
  hasPendingSync = false,
  onDownload,
  onClick,
  subtitle,
  onRemove,
  removeLabel = 'Удалить',
  compact = false,
}: LiteBookRowProps) {
  const progress = isRead ? 100 : Math.max(readProgress, 0);
  const isFullyRead = isRead || progress >= 100;

  const borderColor = theme.divider;
  const metaColor = theme.textMuted;
  const titleColor = theme.text;
  const coverW = compact ? 64 : 72;
  const coverH = compact ? 96 : 108;

  return (
    <div className={`flex items-center gap-3 ${compact ? 'py-3' : 'items-start py-3.5'} border-b last:border-b-0 ${borderColor}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label={onClick ? `Открыть: ${book.title}` : undefined}
        className={`flex flex-1 min-w-0 items-center gap-3.5 text-left select-none touch-manipulation rounded-xl -mx-1 px-1 ${theme.rowPress} ${motion.colors} ${theme.focusRing}`}
      >
        <div className={`relative shrink-0 pointer-events-none ${compact ? 'w-16 h-24' : 'w-[72px] h-[108px]'}`}>
          <BookCover
            bookId={book.id}
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            variant="thumb"
            title={book.title}
            author={book.author}
            width={coverW}
            height={coverH}
            className={`w-full h-full rounded-lg ${theme.coverBorder}`}
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

        <span className="flex-1 min-w-0 block pointer-events-none text-left">
          <span className={`block line-clamp-2 ${compact ? textStyles.bookTitle : `font-bold text-sm leading-snug`} ${titleColor}`}>
            {book.title}
          </span>

          <span className={`block text-xs leading-snug mt-1 truncate ${metaColor}`}>
            {book.author}
          </span>

          {subtitle ? (
            <span className={`block ${textStyles.label} mt-0.5 truncate ${metaColor}`}>{subtitle}</span>
          ) : null}

          <span className="block mt-1">
            <BookMetaSummary book={book} showDescription />
          </span>

          {hasPendingSync && (
            <span className={`inline-flex items-center gap-0.5 mt-0.5 ${textStyles.microBold} ${semantic.warning}`} title="Ожидает синхронизации">
              <CloudUpload className="w-3 h-3" aria-hidden />
              Синхр.
            </span>
          )}

          {showDownloadStatus ? (
            <span className="block mt-1">
              <DownloadStatusLabel isDownloaded={isDownloaded} showNotDownloaded />
            </span>
          ) : null}

          {progress > 0 ? (
            <span className="block mt-1.5">
              <ReadProgressBar value={progress} showLabel={!isFullyRead && progress > 0} />
              {isFullyRead && (
                <span className={`block ${textStyles.labelBold} mt-0.5 ${titleColor}`}>Прочитано</span>
              )}
            </span>
          ) : isRead ? (
            <span className={`block ${textStyles.labelBold} mt-1 ${titleColor}`}>Прочитано</span>
          ) : null}
        </span>
      </button>

      {showDownloadButton && onDownload ? (
        <button
          type="button"
          disabled={isDownloading}
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          className={`shrink-0 ${theme.touchTarget} w-11 h-11 rounded-xl flex items-center justify-center ${theme.accentBg} text-white disabled:opacity-50 disabled:cursor-not-allowed ${motion.press} ${theme.focusRing}`}
          title="Скачать"
          aria-label="Скачать"
        >
          <Download className="w-4 h-4" aria-hidden />
        </button>
      ) : onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={`shrink-0 ${theme.touchTarget} w-11 h-11 rounded-xl flex items-center justify-center text-[var(--app-danger)] hover:bg-[color-mix(in_srgb,var(--app-danger)_10%,transparent)] active:bg-[color-mix(in_srgb,var(--app-danger)_15%,transparent)] ${motion.press} ${theme.focusRing}`}
          title={removeLabel}
          aria-label={removeLabel}
        >
          <Trash2 className="w-4 h-4" aria-hidden />
        </button>
      ) : (
        <ChevronRight className={`w-4 h-4 shrink-0 opacity-40 pointer-events-none ${metaColor}`} aria-hidden />
      )}
    </div>
  );
}
