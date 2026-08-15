import React from 'react';
import { Download, X, RotateCcw } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { downloadQueue, formatBytes, formatSpeed, statusLabel } from '../lib/downloadQueue';
import { useDownloadQueue } from '../hooks/useDownloadQueue';
import { textStyles, semantic, radii, elevation } from '../ui/tokens';
import IconButton from '../ui/IconButton';

interface DownloadQueueWidgetProps {
  /** Compact strip for home / shell; still shows recent saved/errors. */
  compact?: boolean;
  /** Slim one-line banner for AppShell (active downloads only). */
  banner?: boolean;
}

export default function DownloadQueueWidget({ compact, banner }: DownloadQueueWidgetProps) {
  const jobs = useDownloadQueue();
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'saving');
  const recent = jobs
    .filter((j) => j.status === 'saved' || j.status === 'error')
    .slice(-5);

  if (banner) {
    if (active.length === 0) return null;
    const primary = active.find((j) => j.status === 'downloading' || j.status === 'saving') ?? active[0];
    const extra = active.length > 1 ? ` · ещё ${active.length - 1}` : '';
    const detail =
      primary.status === 'downloading' && primary.bytesTotal > 0
        ? `${Math.round(primary.progress)}% · ${formatBytes(primary.bytesLoaded)} / ${formatBytes(primary.bytesTotal)}`
        : statusLabel(primary.status);
    return (
      <div
        className={`px-4 py-2 shrink-0 border-b border-[color:var(--app-border)] ${theme.header} flex items-center gap-3`}
        role="status"
        aria-live="polite"
        aria-label="Загрузки"
      >
        <Download className={`w-4 h-4 shrink-0 ${theme.accentText}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={`${textStyles.captionBold} ${theme.text} truncate`}>
            {primary.book.title}
            {extra}
          </p>
          <p className={`${textStyles.caption} ${theme.textMuted} truncate`}>{detail}</p>
          {(primary.status === 'downloading' || primary.status === 'saving') && (
            <div className="mt-1.5 h-1 rounded-full bg-[var(--app-panel-soft)] overflow-hidden">
              <div
                className="h-full bg-[var(--app-link)] transition-all rounded-full"
                style={{ width: `${Math.max(4, primary.progress)}%` }}
              />
            </div>
          )}
        </div>
        {(primary.status === 'queued' || primary.status === 'downloading') && (
          <IconButton label="Отменить" onClick={() => downloadQueue.cancel(primary.id)}>
            <X className="w-4 h-4" />
          </IconButton>
        )}
      </div>
    );
  }

  const show = compact ? [...active, ...recent] : [...active, ...recent];
  if (show.length === 0) return null;

  return (
    <section className={`${radii.lg} ${theme.card} ${elevation.card} p-4 space-y-3`} aria-label="Загрузки">
      <h3 className={`${textStyles.sectionLabel} ${theme.text} flex items-center gap-2`}>
        <Download className={`w-4 h-4 ${theme.accentText}`} aria-hidden />
        Загрузки
      </h3>
      <div className="space-y-3">
        {show.map((job) => (
          <div key={`${job.id}-${job.status}-${job.finishedAt ?? job.addedAt}`} className={`py-2 px-1 flex items-center gap-3 border-b last:border-b-0 border-[color:var(--app-border)]`}>
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
                <div className="mt-2 h-1.5 rounded-full bg-[var(--app-panel-soft)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--app-link)] transition-all rounded-full"
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
              <>
                <IconButton label="Повторить" onClick={() => downloadQueue.retry(job.id)}>
                  <RotateCcw className="w-4 h-4" />
                </IconButton>
                <IconButton label="Убрать" onClick={() => downloadQueue.remove(job.id)}>
                  <X className="w-4 h-4" />
                </IconButton>
              </>
            )}
          </div>
        ))}
      </div>
      {(active.some((j) => j.status === 'error') || recent.length > 0) && (
        <button
          type="button"
          className={`${textStyles.captionBold} ${theme.accentText} ${theme.focusRing}`}
          onClick={() => downloadQueue.clearFinished()}
        >
          Очистить завершённые
        </button>
      )}
    </section>
  );
}

export { formatBytes, formatSpeed, statusLabel };
