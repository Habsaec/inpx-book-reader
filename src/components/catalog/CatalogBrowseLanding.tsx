import React from 'react';
import { User, Layers3, Tag, ChevronRight } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { textStyles } from '../../ui/tokens';
import type { CatalogSubTab } from './catalogTypes';

interface CatalogBrowseLandingProps {
  onBrowse: (tab: Exclude<CatalogSubTab, 'books'>) => void;
}

const ITEMS = [
  { id: 'authors' as const, label: 'Авторы', hint: 'По алфавиту и популярности', icon: User },
  { id: 'series' as const, label: 'Серии', hint: 'Циклы и сборники', icon: Layers3 },
  { id: 'genres' as const, label: 'Жанры', hint: 'Разделы каталога', icon: Tag },
];

/** Empty search state: browse entry points instead of equal sub-tabs. */
export default function CatalogBrowseLanding({
  onBrowse,
}: CatalogBrowseLandingProps) {
  return (
    <div className="py-2 space-y-4">
      <div>
        <h3 className={`${textStyles.sectionLabel} ${theme.text}`}>Поиск и обзор</h3>
        <p className={`${textStyles.caption} ${theme.textMuted} mt-1`}>
          Введите запрос выше — откроются Книги, Авторы и Серии — или выберите раздел каталога
        </p>
      </div>
      <div className="space-y-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onBrowse(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left ${theme.interactive} ${theme.focusRing}`}
            >
              <span className={`w-11 h-11 rounded-xl inline-flex items-center justify-center ${theme.iconBg}`}>
                <Icon className={`w-5 h-5 ${theme.accentText}`} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block ${textStyles.bodyBold}`}>{item.label}</span>
                <span className={`block ${textStyles.caption} ${theme.textMuted}`}>{item.hint}</span>
              </span>
              <ChevronRight className={`w-4 h-4 shrink-0 ${theme.textMuted}`} aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
