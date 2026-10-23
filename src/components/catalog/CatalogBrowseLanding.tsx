import React from 'react';
import { ChevronRight, Layers, Tags, User, Users } from 'lucide-react';
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
    <div className="py-2 space-y-8 w-full max-w-[45rem] mx-auto">
      <div className={`border-t ${theme.divider}`}>
        {BROWSE_SHORTCUTS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onBrowseTab?.(id)}
            className={`w-full min-h-[3.75rem] flex items-center gap-3.5 px-0.5 text-left border-b ${theme.divider} ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
          >
            <Icon className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
            <span className={`flex-1 min-w-0 ${textStyles.bodyBold} ${theme.text}`}>{label}</span>
            <ChevronRight className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
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
                  className={`w-full min-h-14 flex items-center gap-3.5 px-0.5 py-2 text-left border-b ${theme.divider} ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
                >
                  <KindIcon className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
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
