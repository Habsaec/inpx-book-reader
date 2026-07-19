import React from 'react';
import { X } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { touchMin } from '../../ui/tokens';
import type { CatalogFormatFilter } from './catalogTypes';

interface CatalogActiveFilterChipsProps {
  minRating: number;
  formatFilter: CatalogFormatFilter;
  selectedAuthor: string | null;
  selectedSeries: string | null;
  selectedSubgenre: { parent: string; name: string } | null;
  onClearMinRating: () => void;
  onClearFormat: () => void;
  onClearAuthor: () => void;
  onClearSeries: () => void;
  onClearSubgenre: () => void;
  onClearAll: () => void;
}

function Chip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${theme.chip}`}>
      {label}
      <button
        type="button"
        aria-label={`Убрать фильтр ${label}`}
        onClick={onRemove}
        className={`${touchMin} inline-flex items-center justify-center -m-2 rounded-full ${theme.focusRing}`}
      >
        <X className="w-3 h-3" aria-hidden />
      </button>
    </span>
  );
}

export default function CatalogActiveFilterChips({
  minRating,
  formatFilter,
  selectedAuthor,
  selectedSeries,
  selectedSubgenre,
  onClearMinRating,
  onClearFormat,
  onClearAuthor,
  onClearSeries,
  onClearSubgenre,
  onClearAll,
}: CatalogActiveFilterChipsProps) {
  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (minRating > 0) {
    chips.push({ key: 'rating', label: `★ ${minRating}+`, onRemove: onClearMinRating });
  }
  if (formatFilter !== 'all') {
    chips.push({ key: 'format', label: formatFilter.toUpperCase(), onRemove: onClearFormat });
  }
  if (selectedAuthor) {
    chips.push({ key: 'author', label: selectedAuthor, onRemove: onClearAuthor });
  }
  if (selectedSeries) {
    chips.push({ key: 'series', label: selectedSeries, onRemove: onClearSeries });
  }
  if (selectedSubgenre) {
    chips.push({ key: 'subgenre', label: selectedSubgenre.name, onRemove: onClearSubgenre });
  }

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className={`min-h-12 px-3 text-xs font-bold rounded-lg ${theme.textMuted} hover:opacity-80 ${theme.focusRing}`}
      >
        Сбросить всё
      </button>
    </div>
  );
}
