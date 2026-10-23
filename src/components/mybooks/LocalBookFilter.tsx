import React from 'react';
import { Search, X } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { radii, textStyles } from '../../ui/tokens';

/** Filter for lists already on the device — no server search, works offline. */
export default function LocalBookFilter({
  value,
  onChange,
  placeholder = 'Найти в моих книгах',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${theme.textMuted}`} aria-hidden />
      <input
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        className={`w-full min-h-11 pl-10 pr-11 ${textStyles.body} ${radii.md} ${theme.inputFocus} ${theme.input}`}
      />
      {value ? (
        <button
          type="button"
          aria-label="Очистить"
          onClick={() => onChange('')}
          className={`absolute right-0 top-0 h-full w-11 inline-flex items-center justify-center ${theme.textMuted} ${theme.focusRing}`}
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
