import React from 'react';
import { createPortal } from 'react-dom';
import { X, Filter } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles, radii } from '../../ui/tokens';
import Button from '../../ui/Button';
import type { CatalogFormatFilter, DemoBookSort } from './catalogTypes';

interface CatalogFilterSheetProps {
  open: boolean;
  onClose: () => void;
  minRating: number;
  onMinRatingChange: (v: number) => void;
  formatFilter: CatalogFormatFilter;
  onFormatFilterChange: (v: CatalogFormatFilter) => void;
  sortBy: DemoBookSort;
  onSortByChange: (v: DemoBookSort) => void;
  onReset: () => void;
}

export default function CatalogFilterSheet({
  open,
  onClose,
  minRating,
  onMinRatingChange,
  formatFilter,
  onFormatFilterChange,
  sortBy,
  onSortByChange,
  onReset,
}: CatalogFilterSheetProps) {
  if (!open) return null;

  const hasActive = minRating > 0 || formatFilter !== 'all';

  return createPortal(
    <div className="fixed inset-0 z-[350] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className={`${radii.lg} rounded-b-none border-t ${theme.sheet} p-5 max-h-[80vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Фильтры каталога"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className={`${textStyles.title} flex items-center gap-2`}>
            <Filter className="w-5 h-5" aria-hidden />
            Фильтры
          </h2>
          <button type="button" aria-label="Закрыть" onClick={onClose} className={`p-2 ${theme.focusRing}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <span className={`block ${textStyles.captionBold} ${theme.textMuted} uppercase tracking-wider mb-2`}>
              Сортировка
            </span>
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value as DemoBookSort)}
              className={`w-full border rounded-xl px-3 py-2.5 ${textStyles.body} ${theme.inputFocus} ${theme.input}`}
            >
              <option value="rating">★ Рейтинг</option>
              <option value="downloads">⚡ Популярность</option>
              <option value="title">А-Я Название</option>
              <option value="year">📅 Год издания</option>
              <option value="size">💾 Размер</option>
            </select>
          </div>

          <div>
            <span className={`block ${textStyles.captionBold} ${theme.textMuted} uppercase tracking-wider mb-2`}>
              Минимальный рейтинг
            </span>
            <div className="flex gap-2">
              {[0, 4.4, 4.6, 4.8].map((ratingVal) => (
                <button
                  key={ratingVal}
                  type="button"
                  onClick={() => onMinRatingChange(ratingVal)}
                  className={`flex-1 py-2.5 rounded-xl ${textStyles.captionBold} border transition-all ${theme.focusRing} ${
                    minRating === ratingVal
                      ? theme.accentActive
                      : `${theme.chip} border-[color:var(--app-border)] ${theme.chipHover}`
                  }`}
                >
                  {ratingVal === 0 ? 'Все' : `★ ${ratingVal}+`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={`block ${textStyles.captionBold} ${theme.textMuted} uppercase tracking-wider mb-2`}>
              Формат
            </span>
            <div className="flex gap-2">
              {(['all', 'fb2', 'epub', 'txt'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => onFormatFilterChange(fmt)}
                  className={`flex-1 py-2.5 rounded-xl ${textStyles.captionBold} border uppercase transition-all ${theme.focusRing} ${
                    formatFilter === fmt
                      ? theme.accentActive
                      : `${theme.chip} border-[color:var(--app-border)] ${theme.chipHover}`
                  }`}
                >
                  {fmt === 'all' ? 'Все' : fmt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          {hasActive && (
            <Button variant="secondary" fullWidth onClick={onReset}>
              Сбросить
            </Button>
          )}
          <Button variant="primary" fullWidth onClick={onClose}>
            Применить
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
