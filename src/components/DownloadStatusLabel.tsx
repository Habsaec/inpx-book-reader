import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic } from '../ui/tokens';
import { Cloud, HardDrive, Loader2 } from 'lucide-react';

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
        <Loader2 className="w-3 h-3 shrink-0 animate-spin" aria-hidden />
        Качается
      </span>
    );
  }

  if (isDownloaded) {
    return (
      <span
        className={`inline-flex items-center gap-1 ${textStyles.microBold} ${semantic.success} ${className}`}
      >
        <HardDrive className="w-3 h-3 shrink-0 opacity-80" aria-hidden />
        На устройстве
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
