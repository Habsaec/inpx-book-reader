import React from 'react';
import { theme } from '../../lib/appTheme';

interface CatalogPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  isAppDark: boolean;
}

export default function CatalogPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: CatalogPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const win = 2;
  const from = Math.max(1, page - win);
  const to = Math.min(totalPages, page + win);
  const pageItems: Array<number | 'ellipsis'> = [];
  if (from > 1) {
    pageItems.push(1);
    if (from > 2) pageItems.push('ellipsis');
  }
  for (let i = from; i <= to; i++) pageItems.push(i);
  if (to < totalPages) {
    if (to < totalPages - 1) pageItems.push('ellipsis');
    pageItems.push(totalPages);
  }

  const btnBase = `min-w-12 min-h-12 px-2 rounded-lg text-xs font-bold border border-[color:var(--app-border)] transition-colors cursor-pointer active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[color-mix(in_srgb,var(--app-text)_5%,transparent)] ${theme.focusRing}`;

  return (
    <div className="flex flex-wrap gap-1.5 mt-3 mb-1 justify-center items-center">
      {page > 1 && (
        <button type="button" className={btnBase} onClick={() => onPageChange(page - 1)} aria-label="Предыдущая страница">
          ‹
        </button>
      )}
      {pageItems.map((item, idx) =>
        item === 'ellipsis' ? (
          <span key={`e-${idx}`} className={`px-1 text-xs ${theme.textMuted}`}>…</span>
        ) : (
          <button
            key={item}
            type="button"
            className={`${btnBase} ${item === page ? theme.accentActive : theme.chip}`}
            onClick={() => onPageChange(item)}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        ),
      )}
      {page < totalPages && (
        <button type="button" className={btnBase} onClick={() => onPageChange(page + 1)} aria-label="Следующая страница">
          ›
        </button>
      )}
    </div>
  );
}
