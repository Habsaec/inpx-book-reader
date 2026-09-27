import React from 'react';
import { ChevronRight, Clock } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles, motion } from '../../ui/tokens';
import { getRecentBrowse, type RecentBrowseItem } from '../../lib/recentBrowseHistory';
import { displayAuthorName } from '../../lib/inpxClient';
import { type CatalogSubTab } from './catalogTypes';

interface CatalogBrowseLandingProps {
  onOpenAuthor?: (name: string) => void;
  onOpenSeries?: (name: string) => void;
  onBrowseTab?: (tab: CatalogSubTab) => void;
}

const BROWSE_SHORTCUTS = [
  { id: 'authors' as const, label: 'Авторы' },
  { id: 'series' as const, label: 'Серии' },
  { id: 'genres' as const, label: 'Жанры' },
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
    <div className="py-2 space-y-8">
      <div>
        {BROWSE_SHORTCUTS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onBrowseTab?.(id)}
            className={`w-full min-h-12 flex items-center justify-between gap-3 py-3 border-b last:border-b-0 text-left ${theme.divider} ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
          >
            <span className={`${textStyles.bodyBold} ${theme.text}`}>{label}</span>
            <ChevronRight className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
          </button>
        ))}
      </div>

      {recent.length > 0 && (onOpenAuthor || onOpenSeries) ? (
        <div className="space-y-1">
          <h4 className={`${textStyles.caption} ${theme.textMuted} inline-flex items-center gap-2`}>
            <Clock className="w-4 h-4" aria-hidden />
            Недавние
          </h4>
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
                className={`w-full min-h-12 flex items-center justify-between gap-3 py-3 border-b last:border-b-0 text-left ${theme.divider} ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
              >
                <span className={`min-w-0 truncate ${textStyles.body} ${theme.text}`}>{label}</span>
                <span className={`shrink-0 ${textStyles.caption} ${theme.textMuted}`}>
                  {item.kind === 'author' ? 'Автор' : 'Серия'}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
