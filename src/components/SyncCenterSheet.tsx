import React from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, AlertCircle, CheckCircle2, Clock, BookOpen, Bookmark, Highlighter } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic, touchMin, motion } from '../ui/tokens';
import Button from '../ui/Button';
import { SheetDragHandle, sheetBackdropClass, sheetPanelClass, sheetPanelStyle } from '../ui/SheetChrome';
import { getSyncPendingBreakdown, syncOpLabel, type SyncPendingBreakdown } from '../lib/syncStats';
import { removeSyncOp } from '../lib/localDb';
import type { ServerConfig } from '../types';
import { useOverlayBackHandler } from '../hooks/useBackHandler';

interface SyncCenterSheetProps {
  open: boolean;
  onClose: () => void;
  isOnline: boolean;
  lastSynced: string | null;
  onSyncNow: () => void;
  syncing: boolean;
  syncError: string | null;
  lastSyncSummary: string | null;
  downloadedBookIds: string[];
  serverConfig: ServerConfig | null;
}

export default function SyncCenterSheet({
  open,
  onClose,
  isOnline,
  lastSynced,
  onSyncNow,
  syncing,
  syncError,
  lastSyncSummary,
  downloadedBookIds,
  serverConfig,
}: SyncCenterSheetProps) {
  const [breakdown, setBreakdown] = React.useState<SyncPendingBreakdown | null>(null);

  const reload = React.useCallback(() => {
    void getSyncPendingBreakdown(downloadedBookIds).then(setBreakdown);
  }, [downloadedBookIds]);

  React.useEffect(() => {
    if (!open) return;
    reload();
  }, [open, syncing, downloadedBookIds, reload]);

  useOverlayBackHandler(open, onClose);

  if (!open) return null;

  return createPortal(
    <div className={sheetBackdropClass} onClick={onClose}>
      <div
        className={`${sheetPanelClass} px-5 pt-0`}
        style={sheetPanelStyle()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-center-title"
      >
        <SheetDragHandle />
        <div className="flex items-center justify-between mb-4">
          <h2 id="sync-center-title" className={textStyles.title}>Синхронизация</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose} className={`min-h-12 min-w-12 inline-flex items-center justify-center rounded-lg ${theme.chipButton} ${theme.focusRing}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${theme.panel}`}>
            {isOnline ? (
              <CheckCircle2 className={`w-4 h-4 ${semantic.success}`} aria-hidden />
            ) : (
              <AlertCircle className={`w-4 h-4 ${semantic.warning}`} aria-hidden />
            )}
            <span className={textStyles.body}>{isOnline ? 'Сервер доступен' : 'Офлайн'}</span>
          </div>

          {lastSynced && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${theme.panel}`}>
              <Clock className={`w-4 h-4 ${theme.textMuted}`} aria-hidden />
              <span className={`${textStyles.caption} ${theme.textMuted}`}>Последняя синхронизация: {lastSynced}</span>
            </div>
          )}

          {breakdown && breakdown.totalPending > 0 && (
            <div className={`px-3 py-2.5 rounded-xl ${theme.panel} space-y-2`}>
              <p className={`${textStyles.captionBold}`}>Ожидает отправки: {breakdown.totalPending}</p>
              <ul className={`${textStyles.caption} ${theme.textMuted} space-y-1`}>
                {breakdown.progressBooks > 0 && (
                  <li className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    Прогресс: {breakdown.progressBooks} {breakdown.progressBooks === 1 ? 'книга' : 'книг'}
                  </li>
                )}
                {breakdown.bookmarkBooks > 0 && (
                  <li className="flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    Закладки: {breakdown.bookmarkBooks} {breakdown.bookmarkBooks === 1 ? 'книга' : 'книг'}
                  </li>
                )}
                {breakdown.annotationBooks > 0 && (
                  <li className="flex items-center gap-1.5">
                    <Highlighter className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    Заметки: {breakdown.annotationBooks} {breakdown.annotationBooks === 1 ? 'книга' : 'книг'}
                  </li>
                )}
                {Object.entries(breakdown.queueByType).map(([type, count]) => (
                  <li key={type}>• {syncOpLabel(type)}: {count}</li>
                ))}
              </ul>
            </div>
          )}

          {breakdown && breakdown.totalPending === 0 && isOnline && (
            <p className={`${textStyles.caption} ${theme.textMuted}`}>Все изменения синхронизированы</p>
          )}

          {breakdown && breakdown.failedOps.length > 0 && (
            <div className={`px-3 py-2.5 rounded-xl border ${semantic.warningBg} space-y-2`}>
              <p className={`${textStyles.captionBold}`}>
                Не удалось синхронизировать ({breakdown.failedOps.length})
              </p>
              <ul className={`${textStyles.caption} ${theme.textMuted} space-y-2`}>
                {breakdown.failedOps.map((op) => (
                  <li key={op.id} className="flex flex-wrap items-center gap-2 justify-between">
                    <span>
                      {syncOpLabel(op.opType)}
                      {op.bookId ? ` · ${op.bookId.slice(0, 8)}…` : ''} ({op.attempts} поп.)
                    </span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        className={`${touchMin} inline-flex items-center px-3 ${textStyles.microBold} ${theme.accentText} rounded-lg ${theme.chipButton} ${motion.press} ${theme.focusRing}`}
                        onClick={() => void removeSyncOp(op.id).then(reload)}
                      >
                        Отбросить
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lastSyncSummary && (
            <p className={`${textStyles.caption} ${semantic.success}`}>{lastSyncSummary}</p>
          )}

          {syncError && (
            <div className="space-y-2">
              <p className={`${textStyles.caption} text-[var(--app-danger)]`} role="alert">{syncError}</p>
              <Button variant="secondary" fullWidth disabled={!isOnline} onClick={onSyncNow}>
                Повторить
              </Button>
            </div>
          )}

          <Button
            fullWidth
            loading={syncing}
            disabled={!isOnline}
            onClick={onSyncNow}
          >
            <RefreshCw className="w-4 h-4 inline mr-1" aria-hidden />
            Синхронизировать сейчас
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
