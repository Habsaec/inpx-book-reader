import React from 'react';
import { Download, X, RotateCcw } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { downloadQueue, formatBytes, formatSpeed, statusLabel } from '../lib/downloadQueue';
import { useDownloadQueue } from '../hooks/useDownloadQueue';
import { textStyles, semantic } from '../ui/tokens';
import IconButton from '../ui/IconButton';

interface DownloadQueueWidgetProps {
  compact?: boolean;
}

export default function DownloadQueueWidget({ compact }: DownloadQueueWidgetProps) {
  const jobs = useDownloadQueue();
  const active = jobs.filter((j) => j.status !== 'saved' && j.status !== 'cancelled');
  const recent = jobs.filter((j) => j.status === 'saved' || j.status === 'error').slice(-3);

  if (active.length === 0 && recent.length === 0) return null;

  const show = compact ? active : [...active, ...recent];

  return (
    <section className="space-y-2" aria-label="Загрузки">
      <h3 className={`${textStyles.sectionLabel} ${theme.textMuted} flex items-center gap-1`}>
        <Download className="w-3.5 h-3.5" aria-hidden />
        Загрузки
      </h3>
      <div className={`divide-y divide-[color:var(--app-border)]`}>
        {show.map((job) => (
          <div key={job.id} className="py-2.5 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className={`${textStyles.bookTitle} text-sm truncate`}>{job.book.title}</p>
              <p className={`${textStyles.caption} ${theme.textMuted}`}>
                {statusLabel(job.status)}
                {job.status === 'downloading' && job.bytesTotal > 0 && (
                  <>
                    {' · '}
                    {formatBytes(job.bytesLoaded)} / {formatBytes(job.bytesTotal)}
                    {' · '}
                    {Math.round(job.progress)}% · {formatSpeed(job.speedBps)}
                  </>
                )}
                {job.status === 'error' && job.error && (
                  <span className={semantic.error}> · {job.error}</span>
                )}
              </p>
              {(job.status === 'downloading' || job.status === 'saving') && (
                <div className="mt-1.5 h-1 rounded-full bg-[var(--app-panel-soft)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--app-link)] transition-all"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              )}
            </div>
            {(job.status === 'queued' || job.status === 'downloading') && (
              <IconButton label="Отменить" onClick={() => downloadQueue.cancel(job.id)}>
                <X className="w-4 h-4" />
              </IconButton>
            )}
            {job.status === 'error' && (
              <IconButton label="Повторить" onClick={() => downloadQueue.retry(job.id)}>
                <RotateCcw className="w-4 h-4" />
              </IconButton>
            )}
          </div>
        ))}
      </div>
      {!compact && recent.some((j) => j.status === 'saved') && (
        <button
          type="button"
          className={`${textStyles.caption} ${theme.accentText}`}
          onClick={() => downloadQueue.clearFinished()}
        >
          Очистить завершённые
        </button>
      )}
    </section>
  );
}

export { formatBytes, formatSpeed, statusLabel };
