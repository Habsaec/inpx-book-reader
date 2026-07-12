import React from 'react';
import { BookDown } from 'lucide-react';
import { theme } from '../lib/appTheme';

type Props = {
  title: string;
  onBack: () => void;
};

export function MissingLocalBookFallback({ title, onBack }: Props) {
  return (
    <div className={`fixed inset-0 z-[200] flex flex-col p-4 ${theme.bg} ${theme.text}`}>
      <button
        type="button"
        onClick={onBack}
        className={`self-start text-sm font-bold py-2 px-1 ${theme.accentText} ${theme.focusRing}`}
      >
        ← Назад
      </button>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
        <BookDown className={`w-12 h-12 ${theme.textMuted}`} aria-hidden />
        <h1 className="m-0 text-lg font-extrabold">{title}</h1>
        <p className={`m-0 text-sm max-w-xs leading-relaxed ${theme.textMuted}`}>
          Локальный файл не найден. Проверьте папку хранения в профиле или скачайте книгу заново из каталога.
        </p>
      </div>
    </div>
  );
}
