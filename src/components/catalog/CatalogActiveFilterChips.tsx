import React from 'react';
import { X } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { touchMin, radii, motion } from '../../ui/tokens';
import type { CatalogFormatFilter, CatalogHasSeriesFilter } from './catalogTypes';

interface CatalogActiveFilterChipsProps {
  minRating: number;
  formatFilter: CatalogFormatFilter;
  genreFilters: string[];
  genreLabels?: Record<string, string>;
  yearFilter: number;
  hasSeriesFilter: CatalogHasSeriesFilter;
  selectedAuthor: string | null;
  selectedSeries: string | null;
  selectedSubgenre: { parent: string; name: string } | null;
  onClearMinRating: () => void;
  onClearFormat: () => void;
  onClearGenre: (code: string) => void;
  onClearYear: () => void;
  onClearHasSeries: () => void;
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
    <span className={`inline-flex items-center gap-1.5 min-h-10 pl-4 pr-2 ${radii.button} text-xs font-semibold ${theme.accentMuted} ${theme.accentText}`}>
      {label}
      <button
        type="button"
        aria-label={`Убрать фильтр ${label}`}
        onClick={onRemove}
        className={`${touchMin} inline-flex items-center justify-center -m-1 ${radii.full} ${theme.focusRing} ${motion.press}`}
      >
        <X className="w-3.5 h-3.5" aria-hidden />
      </button>
    </span>
  );
}

export default function CatalogActiveFilterChips({
  minRating,
  formatFilter,
  genreFilters,
  genreLabels = {},
  yearFilter,
  hasSeriesFilter,
  selectedAuthor,
  selectedSeries,
  selectedSubgenre,
  onClearMinRating,
  onClearFormat,
  onClearGenre,
  onClearYear,
  onClearHasSeries,
  onClearAuthor,
  onClearSeries,
  onClearSubgenre,
  onClearAll,
}: CatalogActiveFilterChipsProps) {
  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (minRating > 0) {
    chips.push({ key: 'rating', label: `★ ${minRating}+`, onRemove: onClearMinRating });
  }
  for (const code of genreFilters) {
    chips.push({
      key: `genre:${code}`,
      label: genreLabels[code] || code,
      onRemove: () => onClearGenre(code),
    });
  }
  if (yearFilter >= 1800 && yearFilter <= 2100) {
    chips.push({ key: 'year', label: String(yearFilter), onRemove: onClearYear });
  }
  if (hasSeriesFilter === 'yes') {
    chips.push({ key: 'series-yes', label: 'В серии', onRemove: onClearHasSeries });
  } else if (hasSeriesFilter === 'no') {
    chips.push({ key: 'series-no', label: 'Без серии', onRemove: onClearHasSeries });
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
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className={`min-h-10 px-4 text-xs font-semibold ${radii.button} ${theme.chip} ${theme.chipHover} ${theme.textMuted} ${theme.focusRing} ${motion.press}`}
      >
        Сбросить всё
      </button>
    </div>
  );
}
