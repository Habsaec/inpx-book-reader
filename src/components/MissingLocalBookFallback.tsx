import React from 'react';
import { BookDown } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { touchMin, textStyles, radii } from '../ui/tokens';

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
        aria-label="Назад"
        onClick={onBack}
        className={`self-start ${touchMin} inline-flex items-center px-3 text-sm font-bold ${theme.accentText} ${theme.focusRing}`}
      >
        ← Назад
      </button>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
        <BookDown className={`w-12 h-12 ${theme.textMuted}`} aria-hidden />
        <h1 className="m-0 text-lg font-extrabold">{title}</h1>
        <p className={`m-0 text-sm max-w-xs leading-relaxed ${theme.textMuted}`}>
          Локальный файл не найден. Проверьте папку хранения в профиле или скачайте книгу заново из каталога.
        </p>
        {onRedownload && (
          <button
            type="button"
            onClick={onRedownload}
            className={`${touchMin} px-4 ${radii.button} ${textStyles.bodyBold} ${theme.accentBg} ${theme.focusRing}`}
          >
            Скачать заново
          </button>
        )}
      </div>
    </div>
  );
}
