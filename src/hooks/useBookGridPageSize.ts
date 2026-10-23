import React from 'react';
import { bookGridColumnsForViewport } from '../components/BookCoverGrid';
import type { CatalogViewMode } from '../lib/catalogViewMode';

/** Largest page of whole cover rows that fits the server limit (24). */
export function fullRowsPageSize(cols: number, limit = 24): number {
  return Math.max(cols, cols * Math.floor(limit / cols));
}

/**
 * Page size for a paginated cover grid: whole rows only, so a page never ends with a
 * short row (24 books in 5 columns would leave 4 on the last row of every page).
 */
export function useBookGridPageSize(viewMode: CatalogViewMode, limit = 24): number {
  const [cols, setCols] = React.useState(() => bookGridColumnsForViewport(window.innerWidth));
  React.useEffect(() => {
    const onResize = () => setCols(bookGridColumnsForViewport(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return viewMode === 'grid' ? fullRowsPageSize(cols, limit) : limit;
}

/**
 * Keeps the first visible book in view when the page size changes (rotation, list ↔ grid):
 * maps the current page to the page that now holds its first item.
 */
export function useRepageOnSizeChange(pageSize: number, setPage: React.Dispatch<React.SetStateAction<number>>) {
  const prev = React.useRef(pageSize);
  React.useEffect(() => {
    const before = prev.current;
    prev.current = pageSize;
    if (before === pageSize) return;
    setPage((page) => Math.floor(((page - 1) * before) / pageSize) + 1);
  }, [pageSize, setPage]);
}
