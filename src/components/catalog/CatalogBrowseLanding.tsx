import React from 'react';
import { ChevronRight, Layers, Tags, User, Users } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles, motion, radii } from '../../ui/tokens';
import { getRecentBrowse, type RecentBrowseItem } from '../../lib/recentBrowseHistory';
import { displayAuthorName } from '../../lib/inpxClient';
import { type CatalogSubTab } from './catalogTypes';

interface CatalogBrowseLandingProps {
  onOpenAuthor?: (name: string) => void;
  onOpenSeries?: (name: string) => void;
  onBrowseTab?: (tab: CatalogSubTab) => void;
}

const BROWSE_SHORTCUTS = [
  { id: 'authors' as const, label: 'Авторы', icon: Users },
  { id: 'series' as const, label: 'Серии', icon: Layers },
  { id: 'genres' as const, label: 'Жанры', icon: Tags },
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
      <div className="grid grid-cols-3 gap-3">
        {BROWSE_SHORTCUTS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onBrowseTab?.(id)}
            className={`flex flex-col items-start justify-between gap-6 p-4 min-h-[6.5rem] text-left ${radii.lg} ${theme.card} ${theme.focusRing} ${motion.press}`}
          >
            <span className={`inline-flex w-10 h-10 items-center justify-center ${radii.full} ${theme.accentMuted}`}>
              <Icon className="w-5 h-5" aria-hidden />
            </span>
            <span className={`${textStyles.bodyBold} ${theme.text}`}>{label}</span>
          </button>
        ))}
      </div>

      {recent.length > 0 && (onOpenAuthor || onOpenSeries) ? (
        <section className="space-y-2">
          <h4 className={`${textStyles.sectionLabel} ${theme.text}`}>Недавние</h4>
          <div>
            {recent.map((item) => {
              const isAuthor = item.kind === 'author';
              const label = isAuthor
                ? displayAuthorName(item.name, item.displayName)
                : item.displayName || item.name;
              const KindIcon = isAuthor ? User : Layers;
              return (
                <button
                  key={`${item.kind}:${item.name}`}
                  type="button"
                  onClick={() => (isAuthor ? onOpenAuthor?.(item.name) : onOpenSeries?.(item.name))}
                  className={`w-full min-h-14 flex items-center gap-3 py-2 text-left ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
                >
                  <span className={`inline-flex w-10 h-10 shrink-0 items-center justify-center ${radii.full} ${theme.panel} ${theme.textMuted}`}>
                    <KindIcon className="w-5 h-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${textStyles.bodyBold} ${theme.text}`}>{label}</span>
                    <span className={`block ${textStyles.caption} ${theme.textMuted}`}>{isAuthor ? 'Автор' : 'Серия'}</span>
                  </span>
                  <ChevronRight className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
