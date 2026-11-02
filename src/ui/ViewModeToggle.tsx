import { LayoutGrid, List } from 'lucide-react';
import { theme } from '../lib/appTheme';
import IconButton from './IconButton';
import type { CatalogViewMode } from '../lib/catalogViewMode';
import { t } from '../i18n';

/** One control: the icon is the view the tap switches to. */
export default function ViewModeToggle({
  value,
  onChange,
}: {
  value: CatalogViewMode;
  onChange: (mode: CatalogViewMode) => void;
}) {
  const next: CatalogViewMode = value === 'grid' ? 'list' : 'grid';
  const label = next === 'list' ? t('viewModeToggle.list') : t('viewModeToggle.cards');
  const Icon = next === 'list' ? List : LayoutGrid;

  return (
    <IconButton
      label={label}
      aria-pressed={value === 'list'}
      onClick={() => onChange(next)}
      className={`inpx-view-toggle ${theme.text}`}
    >
      <Icon className="w-5 h-5" aria-hidden />
    </IconButton>
  );
}
