import React from 'react';
import { Clock, Users, Layers, Tags } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles, radii, motion, elevation } from '../../ui/tokens';
import { getRecentBrowse, type RecentBrowseItem } from '../../lib/recentBrowseHistory';
import { displayAuthorName } from '../../lib/inpxClient';
import { type CatalogSubTab } from './catalogTypes';

interface CatalogBrowseLandingProps {
  onOpenAuthor?: (name: string) => void;
  onOpenSeries?: (name: string) => void;
  onBrowseTab?: (tab: CatalogSubTab) => void;
}

const BROWSE_SHORTCUTS = [
  { id: 'authors' as const, label: 'Авторы', icon: Users, hint: 'По алфавиту' },
  { id: 'series' as const, label: 'Серии', icon: Layers, hint: 'Все циклы' },
  { id: 'genres' as const, label: 'Жанры', icon: Tags, hint: 'По интересам' },
];

export default function CatalogBrowseLanding({
  onOpenAuthor,
  onOpenSeries,
  onBrowseTab,
}: CatalogBrowseLandingProps) {
  const [recent, setRecent] = React.useState<RecentBrowseItem[]>([]);
  React.useEffect(() => {
    setRecent(getRecentBrowse(8));
  }, []);

  return (
    <div className="py-4 space-y-6">
      <div>
        <p className={`${textStyles.body} ${theme.textMuted}`}>
          Найдите книгу по названию или откройте раздел ниже
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {BROWSE_SHORTCUTS.map(({ id, label, icon: Icon, hint }) => (
          <button
            key={id}
            type="button"
            onClick={() => onBrowseTab?.(id)}
            className={`flex flex-col items-start gap-3 p-4 ${radii.lg} ${theme.card} ${elevation.card} ${theme.focusRing} ${motion.press} text-left`}
          >
            <span className={`inline-flex items-center justify-center w-10 h-10 ${radii.md} ${theme.accentMuted}`}>
              <Icon className={`w-5 h-5 ${theme.accentText}`} aria-hidden />
            </span>
            <span>
              <span className={`block ${textStyles.bodyBold} ${theme.text}`}>{label}</span>
              <span className={`block ${textStyles.caption} ${theme.textMuted} mt-0.5`}>{hint}</span>
            </span>
          </button>
        ))}
      </div>

      {recent.length > 0 && (onOpenAuthor || onOpenSeries) ? (
        <div className="space-y-3">
          <h4 className={`${textStyles.sectionLabel} ${theme.text} inline-flex items-center gap-2`}>
            <Clock className={`w-4 h-4 ${theme.textMuted}`} aria-hidden />
            Недавние
          </h4>
          <div className="flex flex-wrap gap-2">
            {recent.map((item) => {
              const label =
                item.kind === 'author'
                  ? displayAuthorName(item.name, item.displayName)
                  : item.displayName || item.name;
              return (
                <button
                  key={`${item.kind}:${item.name}`}
                  type="button"
                  onClick={() =>
                    item.kind === 'author' ? onOpenAuthor?.(item.name) : onOpenSeries?.(item.name)
                  }
                  className={`min-h-11 px-4 ${radii.button} ${textStyles.captionBold} ${theme.chip} ${theme.chipHover} ${theme.focusRing} ${motion.press}`}
                >
                  {item.kind === 'author' ? 'Автор' : 'Серия'}: {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
