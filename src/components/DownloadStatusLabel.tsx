import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic } from '../ui/tokens';
import { Cloud, HardDrive } from 'lucide-react';

interface DownloadStatusLabelProps {
  isDownloaded: boolean;
  showNotDownloaded?: boolean;
  className?: string;
}

export default function DownloadStatusLabel({
  isDownloaded,
  showNotDownloaded = false,
  className = '',
}: DownloadStatusLabelProps) {
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
