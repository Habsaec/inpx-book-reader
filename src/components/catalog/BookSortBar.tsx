import React from 'react';
import { theme } from '../../lib/appTheme';
import { textStyles, radii } from '../../ui/tokens';

export type BookSortOption = {
  id: string;
  label: string;
};

interface BookSortBarProps {
  value: string;
  options: BookSortOption[];
  onChange: (id: string) => void;
  /** Visually hidden label for a11y */
  ariaLabel?: string;
  className?: string;
}

/** Compact sort dropdown for book / entity lists (fits narrow toolbars). */
export default function BookSortBar({
  value,
  options,
  onChange,
  ariaLabel = 'Сортировка',
  className = '',
}: BookSortBarProps) {
  const selected = options.some((o) => o.id === value) ? value : options[0]?.id ?? value;

  return (
    <label className={`inline-flex min-w-0 ${className || 'max-w-[10.5rem]'}`}>
      <span className="sr-only">{ariaLabel}</span>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={`w-full min-h-11 ${radii.button} border px-4 py-2.5 ${textStyles.captionBold} ${theme.input} ${theme.inputFocus}`}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
