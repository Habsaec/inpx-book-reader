import React from 'react';
import { createPortal } from 'react-dom';
import { X, Filter } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { SheetDragHandle, sheetBackdropClass, sheetPanelClass, sheetPanelStyle } from '../../ui/SheetChrome';
import { textStyles, touchMin } from '../../ui/tokens';
import Button from '../../ui/Button';
import { useOverlayBackHandler } from '../../hooks/useBackHandler';
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
  const closeRef = React.useRef<HTMLButtonElement>(null);

  useOverlayBackHandler(open, onClose);

  React.useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const hasActive = minRating > 0 || formatFilter !== 'all';

  return createPortal(
    <div className={`${sheetBackdropClass} z-[350]`} onClick={onClose}>
      <div
        className={`${sheetPanelClass} px-5 pt-0 max-h-[80vh]`}
        style={sheetPanelStyle()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-filter-title"
      >
        <SheetDragHandle />
        <div className="flex items-center justify-between mb-4">
          <h2 id="catalog-filter-title" className={`${textStyles.title} flex items-center gap-2`}>
            <Filter className="w-5 h-5" aria-hidden />
            Фильтры
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className={`${touchMin} inline-flex items-center justify-center rounded-lg ${theme.chipButton} ${theme.focusRing}`}
          >
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
              className={`w-full border rounded-xl px-3 py-2.5 min-h-12 ${textStyles.body} ${theme.inputFocus} ${theme.input}`}
            >
              <option value="rating">Рейтинг</option>
              <option value="downloads">Популярность</option>
              <option value="title">Название</option>
              <option value="year">Год издания</option>
              <option value="size">Размер</option>
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
                  className={`flex-1 min-h-12 py-2.5 rounded-xl ${textStyles.captionBold} border transition-all ${theme.focusRing} ${
                    minRating === ratingVal
                      ? theme.accentActive
                      : `${theme.chip} border-[color:var(--app-border)] ${theme.chipHover}`
                  }`}
                >
                  {ratingVal === 0 ? 'Все' : `${ratingVal}+`}
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
                  className={`flex-1 min-h-12 py-2.5 rounded-xl ${textStyles.captionBold} border uppercase transition-all ${theme.focusRing} ${
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
