import React from 'react';
import { createPortal } from 'react-dom';
import { X, Filter } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { sheetBackdropClass, sheetPanelClass, sheetPanelStyle, SheetDragHandle } from '../../ui/SheetChrome';
import { textStyles, touchMin, radii, motion } from '../../ui/tokens';
import Button from '../../ui/Button';
import { useOverlayBackHandler } from '../../hooks/useBackHandler';
import type {
  CatalogFormatFilter,
  CatalogHasSeriesFilter,
  DemoBookSort,
} from './catalogTypes';
import BookSortBar from './BookSortBar';

export interface CatalogGenreOption {
  name: string;
  displayName?: string;
  bookCount?: number;
}

export interface CatalogFilterDraft {
  minRating: number;
  formatFilter: CatalogFormatFilter;
  /** Genre codes — OR (at least one). Empty = any. */
  genreFilters: string[];
  yearFilter: number;
  hasSeriesFilter: CatalogHasSeriesFilter;
  sortBy: DemoBookSort;
}

interface CatalogFilterSheetProps {
  open: boolean;
  onClose: () => void;
  /** Currently applied filters — copied into a draft when the sheet opens. */
  value: CatalogFilterDraft;
  /** Commit draft and close. */
  onApply: (next: CatalogFilterDraft) => void;
  /** Fallback / idle genre list (full catalog). */
  genreOptions?: CatalogGenreOption[];
  /**
   * When set, called on open to load genres for the current search/filters.
   * Prefer scoped genres from `/api/search/genres`.
   */
  resolveGenreOptions?: () => Promise<CatalogGenreOption[]>;
  /** Demo/local pool only — server sort lives in the search header. */
  showSort?: boolean;
  /** Hide genre multi-select (e.g. already inside a genre page). */
  showGenrePicker?: boolean;
}

const EMPTY_DRAFT: CatalogFilterDraft = {
  minRating: 0,
  formatFilter: 'all',
  genreFilters: [],
  yearFilter: 0,
  hasSeriesFilter: 'any',
  sortBy: 'rating',
};

function draftHasActive(d: CatalogFilterDraft): boolean {
  return (
    d.minRating > 0 ||
    d.formatFilter !== 'all' ||
    d.genreFilters.length > 0 ||
    d.yearFilter > 0 ||
    d.hasSeriesFilter !== 'any'
  );
}

function sortGenresAlpha(items: CatalogGenreOption[]): CatalogGenreOption[] {
  return [...items].sort((a, b) => {
    const la = (a.displayName || a.name || '').trim();
    const lb = (b.displayName || b.name || '').trim();
    return la.localeCompare(lb, 'ru', { sensitivity: 'base' });
  });
}

export default function CatalogFilterSheet({
  open,
  onClose,
  value,
  onApply,
  genreOptions = [],
  resolveGenreOptions,
  showSort = true,
  showGenrePicker = true,
}: CatalogFilterSheetProps) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const [genreQuery, setGenreQuery] = React.useState('');
  const [draft, setDraft] = React.useState<CatalogFilterDraft>(value);
  const [activeGenreOptions, setActiveGenreOptions] = React.useState<CatalogGenreOption[]>(genreOptions);
  const [genresLoading, setGenresLoading] = React.useState(false);

  useOverlayBackHandler(open, onClose);

  React.useEffect(() => {
    if (!open) return;
    setDraft({
      ...value,
      genreFilters: Array.isArray(value.genreFilters) ? [...value.genreFilters] : [],
    });
    setGenreQuery('');
    closeRef.current?.focus();

    let cancelled = false;
    if (resolveGenreOptions) {
      setGenresLoading(true);
      void resolveGenreOptions()
        .then((opts) => {
          if (!cancelled) setActiveGenreOptions(opts.length ? opts : genreOptions);
        })
        .catch(() => {
          if (!cancelled) setActiveGenreOptions(genreOptions);
        })
        .finally(() => {
          if (!cancelled) setGenresLoading(false);
        });
    } else {
      setActiveGenreOptions(genreOptions);
      setGenresLoading(false);
    }

    return () => {
      cancelled = true;
    };
    // Sync draft/options only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value/options captured at open
  }, [open]);

  const filteredGenres = (() => {
    const sorted = sortGenresAlpha(activeGenreOptions);
    const q = genreQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((g) => {
      const label = (g.displayName || g.name || '').toLowerCase();
      return label.includes(q) || g.name.toLowerCase().includes(q);
    });
  })();

  if (!open) return null;

  const hasActive = draftHasActive(draft);
  const yearInputValue = draft.yearFilter > 0 ? String(draft.yearFilter) : '';
  const selectedSet = new Set(draft.genreFilters);

  const toggleGenre = (code: string) => {
    setDraft((prev) => {
      const next = new Set(prev.genreFilters);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { ...prev, genreFilters: [...next] };
    });
  };

  const applyAndClose = () => {
    onApply(draft);
    onClose();
  };

  const resetDraft = () => {
    setDraft({ ...EMPTY_DRAFT, sortBy: draft.sortBy });
  };

  return createPortal(
    <div
      className={`${sheetBackdropClass} z-[350]`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`${sheetPanelClass} px-5 pt-0 max-h-[80vh]`}
        style={sheetPanelStyle()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-filter-title"
        onClick={(e) => e.stopPropagation()}
      >
        <SheetDragHandle />
        <div className="flex items-center justify-between gap-3 mb-5">
          <h2 id="catalog-filter-title" className={`${textStyles.title} flex items-center gap-2.5`}>
            <span className={`inline-flex items-center justify-center w-10 h-10 ${radii.md} ${theme.accentMuted}`}>
              <Filter className={`w-5 h-5 ${theme.accentText}`} aria-hidden />
            </span>
            Фильтры
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={`${touchMin} inline-flex items-center justify-center ${radii.button} ${theme.panel} ${theme.chipButton} ${theme.focusRing} ${motion.press}`}
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto flex-1 min-h-0 pb-4">
          <div className={`${radii.lg} ${theme.panel} p-4 space-y-3`}>
            <span className={`block ${textStyles.sectionLabel} ${theme.text}`}>
              Рейтинг
            </span>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, minRating: n }))}
                  className={`min-h-11 px-4 ${radii.button} ${textStyles.captionBold} ${theme.interactive} ${motion.press} ${
                    draft.minRating === n ? theme.accentActive : `${theme.chip} ${theme.chipHover}`
                  }`}
                >
                  {n === 0 ? 'Любой' : `${n}+`}
                </button>
              ))}
            </div>
          </div>

          {showGenrePicker && (
          <div className={`${radii.lg} ${theme.panel} p-4 space-y-3`}>
            <span className={`block ${textStyles.sectionLabel} ${theme.text}`}>
              Жанры
              {draft.genreFilters.length > 0 ? ` (${draft.genreFilters.length})` : ''}
            </span>
            {genresLoading ? (
              <p className={`${textStyles.caption} ${theme.textMuted}`} role="status">
                Загрузка жанров…
              </p>
            ) : activeGenreOptions.length > 0 ? (
              <div className="space-y-2">
                <input
                  type="search"
                  value={genreQuery}
                  onChange={(e) => setGenreQuery(e.target.value)}
                  placeholder="Найти жанр…"
                  className={`w-full ${radii.button} px-4 py-3 min-h-12 ${textStyles.body} ${theme.inputFocus} ${theme.input}`}
                />
                <div
                  className={`max-h-48 overflow-y-auto ${radii.lg} border border-[color:var(--app-border)] divide-y divide-[color:var(--app-border)] ${theme.cardSolid}`}
                  role="group"
                  aria-label="Жанры"
                >
                  {filteredGenres.map((g) => {
                    const checked = selectedSet.has(g.name);
                    const label = g.displayName || g.name;
                    return (
                      <label
                        key={g.name}
                        className={`flex items-center gap-3 px-3 py-2.5 min-h-12 ${theme.interactive}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleGenre(g.name)}
                          className="w-5 h-5 shrink-0"
                        />
                        <span className={`flex-1 min-w-0 ${textStyles.body}`}>
                          {label}
                          {g.bookCount != null ? (
                            <span className={` ${theme.textMuted}`}> ({g.bookCount})</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {draft.genreFilters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, genreFilters: [] }))}
                    className={`min-h-12 px-2 ${textStyles.caption} ${theme.textMuted} ${theme.focusRing}`}
                  >
                    Сбросить жанры
                  </button>
                )}
              </div>
            ) : (
              <p className={`${textStyles.caption} ${theme.textMuted}`}>
                Нет жанров для текущей выдачи
              </p>
            )}
          </div>
          )}

          <div className={`${radii.lg} ${theme.panel} p-4 space-y-3`}>
            <span className={`block ${textStyles.sectionLabel} ${theme.text}`}>
              Год издания
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1800}
              max={2100}
              placeholder="Например, 2020"
              value={yearInputValue}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  setDraft((prev) => ({ ...prev, yearFilter: 0 }));
                  return;
                }
                const n = Math.floor(Number(raw));
                if (!Number.isFinite(n)) return;
                setDraft((prev) => ({ ...prev, yearFilter: n }));
              }}
              className={`w-full ${radii.button} px-4 py-3 min-h-12 ${textStyles.body} ${theme.inputFocus} ${theme.input}`}
            />
          </div>

          <div className={`${radii.lg} ${theme.panel} p-4 space-y-3`}>
            <span className={`block ${textStyles.sectionLabel} ${theme.text}`}>
              Наличие серии
            </span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'any' as const, label: 'Любые' },
                  { id: 'yes' as const, label: 'В серии' },
                  { id: 'no' as const, label: 'Без серии' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, hasSeriesFilter: opt.id }))
                  }
                  className={`min-h-11 px-4 ${radii.button} ${textStyles.captionBold} ${theme.interactive} ${motion.press} ${
                    draft.hasSeriesFilter === opt.id
                      ? theme.accentActive
                      : `${theme.chip} ${theme.chipHover}`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className={`${radii.lg} ${theme.panel} p-4 space-y-3`}>
            <span className={`block ${textStyles.sectionLabel} ${theme.text}`}>
              Формат
            </span>
            <div className="flex flex-wrap gap-2">
              {(['all', 'fb2', 'epub', 'txt'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, formatFilter: fmt }))}
                  className={`min-h-11 px-4 ${radii.button} ${textStyles.captionBold} ${theme.interactive} ${motion.press} ${
                    draft.formatFilter === fmt
                      ? theme.accentActive
                      : `${theme.chip} ${theme.chipHover}`
                  }`}
                >
                  {fmt === 'all' ? 'Все' : fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {showSort && (
            <div className={`${radii.lg} ${theme.panel} p-4 space-y-3`}>
              <span className={`block ${textStyles.sectionLabel} ${theme.text}`}>
                Сортировка
              </span>
              <BookSortBar
                className="max-w-none w-full"
                value={draft.sortBy}
                options={[
                  { id: 'rating', label: 'Рейтинг' },
                  { id: 'title', label: 'Название' },
                  { id: 'year', label: 'Год' },
                  { id: 'downloads', label: 'Скачивания' },
                ]}
                onChange={(id) => setDraft((prev) => ({ ...prev, sortBy: id as DemoBookSort }))}
              />
            </div>
          )}
        </div>

        <div className={`flex gap-2 pt-4 shrink-0 border-t ${theme.divider}`}>
          {hasActive && (
            <Button type="button" variant="ghost" className="flex-1" onClick={resetDraft}>
              Сбросить
            </Button>
          )}
          <Button type="button" variant="primary" className="flex-1" onClick={applyAndClose}>
            Готово
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
