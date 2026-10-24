import React from 'react';
import ChoicePicker from '../../ui/ChoicePicker';

export type BookSortOption = {
  id: string;
  label: string;
};

interface BookSortBarProps {
  value: string;
  options: BookSortOption[];
  onChange: (id: string) => void;
  /** Sheet heading and accessible name. */
  ariaLabel?: string;
  className?: string;
}

/** Compact sort control for book / entity lists: opens a bottom sheet, not a native dropdown. */
export default function BookSortBar({
  value,
  options,
  onChange,
  ariaLabel = 'Сортировка',
  className = '',
}: BookSortBarProps) {
  return (
    <ChoicePicker
      value={value}
      options={options}
      onChange={onChange}
      title={ariaLabel}
      className={className || 'max-w-[11rem]'}
    />
  );
}
