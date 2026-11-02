import React from 'react';
import { BookDown } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { touchMin, textStyles, radii } from '../ui/tokens';
import { t } from '../i18n';

type Props = {
  title: string;
  onBack: () => void;
  onRedownload?: () => void;
};

export function MissingLocalBookFallback({ title, onBack, onRedownload }: Props) {
  useOverlayBackHandler(true, onBack);

  return (
    <div className={`fixed inset-0 z-[200] flex flex-col p-4 ${theme.bg} ${theme.text}`}>
      <button
        type="button"
        aria-label={t('common.back')}
        onClick={onBack}
        className={`self-start ${touchMin} inline-flex items-center px-3 text-sm font-bold ${theme.accentText} ${theme.focusRing}`}
      >
        {t('missingLocalBookFallback.back')}
      </button>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
        <BookDown className={`w-12 h-12 ${theme.textMuted}`} aria-hidden />
        <h1 className="m-0 text-lg font-extrabold">{title}</h1>
        <p className={`m-0 text-sm max-w-xs leading-relaxed ${theme.textMuted}`}>
          {t('missingLocalBookFallback.theLocalFileWasNot')}
        </p>
        {onRedownload && (
          <button
            type="button"
            onClick={onRedownload}
            className={`${touchMin} px-4 ${radii.button} ${textStyles.bodyBold} ${theme.accentBg} ${theme.focusRing}`}
          >
            {t('missingLocalBookFallback.downloadAgain')}
          </button>
        )}
      </div>
    </div>
  );
}
