import React from 'react';
import { Download, X } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { downloadQueue, statusLabel } from '../lib/downloadQueue';
import { useDownloadQueue } from '../hooks/useDownloadQueue';
import { textStyles, radii, motion } from '../ui/tokens';
import IconButton from '../ui/IconButton';

interface DownloadQueueWidgetProps {
  onOpenQueue?: () => void;
}

export default function DownloadQueueWidget({ onOpenQueue }: DownloadQueueWidgetProps) {
  const jobs = useDownloadQueue();
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'downloading' || j.status === 'saving');
  const errors = jobs.filter((j) => j.status === 'error');
  if (active.length === 0 && errors.length === 0) return null;

  const primary = active.find((j) => j.status === 'downloading' || j.status === 'saving') ?? active[0] ?? errors[0];
  const extraCount = active.length + errors.length - 1;
  const extra = extraCount > 0 ? ` и ещё ${extraCount}` : '';
  const verb =
    primary.status === 'saving'
      ? 'Сохранение'
      : primary.status === 'queued'
        ? 'В очереди'
        : primary.status === 'error'
          ? 'Ошибка'
          : 'Скачивается';
  const pct =
    primary.status === 'downloading' ? ` · ${Math.round(primary.progress)}%` : '';
  const line = `${verb} «${primary.book.title}»${pct}${extra}`;
  const canCancel = primary.status === 'queued' || primary.status === 'downloading';

  return (
    <div
      className={`inpx-shell-notice px-4 py-2 shrink-0 border-b border-[color:var(--app-border)] ${theme.header} flex items-center gap-2`}
    >
      <button
        type="button"
        onClick={onOpenQueue}
        className={`min-w-0 flex-1 flex items-center gap-3 text-left min-h-12 ${radii.button} ${theme.focusRing} ${motion.press}`}
        aria-label={`Загрузки: ${line}`}
      >
        <Download className={`w-4 h-4 shrink-0 ${theme.accentText}`} aria-hidden />
        <p className={`${textStyles.captionBold} ${theme.text} truncate`}>{line}</p>
      </button>
      {canCancel ? (
        <IconButton
          label="Отменить"
          onClick={(e) => {
            e.stopPropagation();
            downloadQueue.cancel(primary.id);
          }}
        >
          <X className="w-4 h-4" />
        </IconButton>
      ) : null}
    </div>
  );
}

export { statusLabel };
