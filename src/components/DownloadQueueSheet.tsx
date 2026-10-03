import React from 'react';
import { X } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic, elevation, radii, motion } from '../ui/tokens';
import { SheetDragHandle, sheetPanelClass } from '../ui/SheetChrome';
import DragSheet from '../ui/DragSheet';
import Button from '../ui/Button';
import { useDownloadQueue } from '../hooks/useDownloadQueue';
import { downloadQueue, formatBytes, formatSpeed, statusLabel, type DownloadJob } from '../lib/downloadQueue';

function jobHeadline(job: DownloadJob): string {
  if (job.status === 'downloading') return `Скачивается ${Math.round(job.progress)}%`;
  if (job.status === 'saving') return 'Сохранение';
  return statusLabel(job.status);
}

function jobDetail(job: DownloadJob): string | null {
  if (job.status === 'error' && job.error) return job.error;
  if (job.status === 'downloading' && job.bytesTotal > 0) {
    const speed = job.speedBps > 0 ? ` · ${formatSpeed(job.speedBps)}` : '';
    return `${formatBytes(job.bytesLoaded)} / ${formatBytes(job.bytesTotal)}${speed}`;
  }
  return null;
}

interface DownloadQueueSheetProps {
  open: boolean;
  onClose: () => void;
  onOpenSaved: (book: DownloadJob['book']) => void;
}

export default function DownloadQueueSheet({ open, onClose, onOpenSaved }: DownloadQueueSheetProps) {
  const jobs = useDownloadQueue();

  const visible = jobs.filter(
    (j) =>
      j.status === 'queued' ||
      j.status === 'downloading' ||
      j.status === 'saving' ||
      j.status === 'error' ||
      j.status === 'saved',
  );
  const hasFinished = visible.some((j) => j.status === 'saved' || j.status === 'error');

  if (typeof document === 'undefined') return null;

  return (
    <DragSheet
      open={open}
      onClose={onClose}
      labelledBy="download-queue-title"
      className={`${sheetPanelClass} px-5 pt-4 ${elevation.sheet}`}
    >
        <SheetDragHandle />
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id="download-queue-title" className={textStyles.title}>
            Загрузки
          </h2>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className={`min-h-12 min-w-12 inline-flex items-center justify-center ${radii.button} ${theme.panel} ${theme.chipButton} ${theme.focusRing} ${motion.press}`}
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {visible.length === 0 ? (
          <p className={`${textStyles.body} ${theme.textMuted} py-6 text-center`}>Очередь пуста</p>
        ) : (
          <ul className="space-y-1 max-h-[min(60vh,28rem)] overflow-y-auto">
            {visible.map((job) => {
              const detail = jobDetail(job);
              const canOpen = job.status === 'saved';
              return (
                <li
                  key={`${job.id}-${job.status}-${job.finishedAt ?? job.addedAt}`}
                  className={`flex items-center gap-2 py-2 border-b last:border-b-0 border-[color:var(--app-border)]`}
                >
                  <button
                    type="button"
                    disabled={!canOpen}
                    onClick={() => {
                      if (!canOpen) return;
                      onClose();
                      onOpenSaved(job.book);
                    }}
                    className={`flex-1 min-w-0 text-left ${canOpen ? `${theme.focusRing} ${motion.press}` : ''}`}
                  >
                    <p className={`${textStyles.bookTitle} text-sm truncate`}>{job.book.title}</p>
                    <p
                      className={`${textStyles.caption} truncate ${
                        job.status === 'error' ? semantic.error : theme.textMuted
                      }`}
                    >
                      {jobHeadline(job)}
                    </p>
                    {detail ? (
                      <p className={`${textStyles.micro} ${theme.textMuted} truncate`}>{detail}</p>
                    ) : null}
                    {(job.status === 'downloading' || job.status === 'saving') && (
                      <div className="mt-2 h-1 rounded-full bg-[var(--app-panel-soft)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--app-accent)] rounded-full"
                          style={{ width: `${Math.max(4, job.progress)}%` }}
                        />
                      </div>
                    )}
                  </button>
                  {(job.status === 'queued' || job.status === 'downloading') && (
                    <Button variant="ghost" onClick={() => downloadQueue.cancel(job.id)}>
                      Отменить
                    </Button>
                  )}
                  {job.status === 'error' && (
                    <>
                      <Button variant="ghost" onClick={() => downloadQueue.retry(job.id)}>
                        Повторить
                      </Button>
                      <Button variant="ghost" onClick={() => downloadQueue.remove(job.id)}>
                        Убрать
                      </Button>
                    </>
                  )}
                  {job.status === 'saved' && (
                    <Button variant="ghost" onClick={() => downloadQueue.remove(job.id)}>
                      Убрать
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {hasFinished ? (
          <Button
            variant="ghost"
            className="mt-4 w-full"
            onClick={() => downloadQueue.clearFinished()}
          >
            Очистить завершённые
          </Button>
        ) : null}
    </DragSheet>
  );
}
