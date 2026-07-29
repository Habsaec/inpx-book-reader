import React from 'react';
import { BookOpen, User, Layers3, ChevronRight } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles } from '../../ui/tokens';
import type { CatalogField } from '../../lib/inpxClient';

export interface SearchOverviewTotals {
  books: number;
  authors: number;
  series: number;
  booksCapped?: boolean;
}

interface CatalogSearchOverviewProps {
  query: string;
  totals: SearchOverviewTotals;
  loading?: boolean;
  onOpenField: (field: CatalogField) => void;
}

const ROWS: Array<{
  field: CatalogField;
  label: string;
  icon: typeof BookOpen;
}> = [
  { field: 'books', label: 'Книги', icon: BookOpen },
  { field: 'authors', label: 'Авторы', icon: User },
  { field: 'series', label: 'Серии', icon: Layers3 },
];

function formatTotal(count: number, capped?: boolean): string {
  const n = count.toLocaleString('ru-RU');
  return capped ? `${n}+` : n;
}

/** Unified search hub: pick Books / Authors / Series after a query. */
export default function CatalogSearchOverview({
  query,
  totals,
  loading = false,
  onOpenField,
}: CatalogSearchOverviewProps) {
  const anyHits = totals.books > 0 || totals.authors > 0 || totals.series > 0;

  return (
    <div className="py-2 space-y-4">
      <div>
        <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>Результаты поиска</h3>
        <p className={`${textStyles.caption} ${theme.textMuted} mt-1`}>
          Запрос «{query}»
        </p>
      </div>

      {loading ? (
        <p className={`${textStyles.caption} ${theme.textMuted}`} role="status">Поиск…</p>
      ) : !anyHits ? (
        <p className={`${textStyles.body} ${theme.textMuted}`}>Ничего не найдено</p>
      ) : (
        <div className="space-y-2" role="list">
          {ROWS.map((row) => {
            const Icon = row.icon;
            const count = totals[row.field];
            const capped = row.field === 'books' ? totals.booksCapped : false;
            const disabled = count <= 0;
            return (
              <button
                key={row.field}
                type="button"
                role="listitem"
                disabled={disabled}
                onClick={() => onOpenField(row.field)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left ${theme.focusRing} ${
                  disabled
                    ? `${theme.chip} opacity-50 cursor-not-allowed`
                    : `${theme.interactive}`
                }`}
              >
                <span className={`w-11 h-11 rounded-xl inline-flex items-center justify-center ${theme.iconBg}`}>
                  <Icon className={`w-5 h-5 ${theme.accentText}`} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block ${textStyles.bodyBold}`}>{row.label}</span>
                  <span className={`block ${textStyles.caption} ${theme.textMuted}`}>
                    {formatTotal(count, capped)}
                  </span>
                </span>
                {!disabled && (
                  <ChevronRight className={`w-4 h-4 shrink-0 ${theme.textMuted}`} aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
