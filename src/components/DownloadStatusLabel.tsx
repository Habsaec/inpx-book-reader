import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles } from '../ui/tokens';
import { Cloud, Loader2, Smartphone } from 'lucide-react';

interface DownloadStatusLabelProps {
  isDownloaded: boolean;
  isDownloading?: boolean;
  showNotDownloaded?: boolean;
  className?: string;
}

export default function DownloadStatusLabel({
  isDownloaded,
  isDownloading = false,
  showNotDownloaded = false,
  className = '',
}: DownloadStatusLabelProps) {
  if (isDownloading && !isDownloaded) {
    return (
      <span
        className={`inline-flex items-center gap-1 ${textStyles.microBold} ${theme.accentText} ${className}`}
      >
        <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" aria-hidden />
        <span className="sr-only">Скачивается</span>
      </span>
    );
  }

  if (isDownloaded) {
    /* Contexts that spell out «На сервере» get the matching «На устройстве» text; compact rows stay icon-only. */
    return (
      <span
        className={`inline-flex items-center gap-1 ${showNotDownloaded ? textStyles.microBold : ''} ${theme.textMuted} ${className}`}
        title="На устройстве"
        aria-label="На устройстве"
      >
        <Smartphone className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
        {showNotDownloaded ? 'На устройстве' : null}
      </span>
    );
  }

  if (!showNotDownloaded) return null;

  return (
    <span className={`inline-flex items-center gap-1 ${textStyles.microBold} ${theme.textMuted} ${className}`}>
      <Cloud className="w-3 h-3 shrink-0 opacity-70" aria-hidden />
      На сервере
    </span>
  );
}
