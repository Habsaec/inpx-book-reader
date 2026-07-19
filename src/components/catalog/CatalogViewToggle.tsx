import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import type { CatalogViewMode } from './catalogTypes';

interface CatalogViewToggleProps {
  mode: CatalogViewMode;
  onChange: (mode: CatalogViewMode) => void;
}

export default function CatalogViewToggle({ mode, onChange }: CatalogViewToggleProps) {
  return (
    <div className={`inline-flex rounded-lg border p-0.5 ${theme.chip} border-[color:var(--app-border)]`}>
      <button
        type="button"
        aria-label="Список"
        aria-pressed={mode === 'list'}
        onClick={() => onChange('list')}
        className={`min-w-12 min-h-12 inline-flex items-center justify-center rounded-md ${theme.focusRing} ${mode === 'list' ? theme.accentActive : ''}`}
      >
        <List className="w-4 h-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Сетка"
        aria-pressed={mode === 'grid'}
        onClick={() => onChange('grid')}
        className={`min-w-12 min-h-12 inline-flex items-center justify-center rounded-md ${theme.focusRing} ${mode === 'grid' ? theme.accentActive : ''}`}
      >
        <LayoutGrid className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}
