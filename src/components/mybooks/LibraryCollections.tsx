import React from 'react';
import {
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Download,
  FolderOpen,
  HardDrive,
  Heart,
  Highlighter,
  Library,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { theme } from '../../lib/appTheme';
import { motion, radii, textStyles } from '../../ui/tokens';
import { shelfKey, type UiShelf } from '../../lib/inpxClient';
import { useLongPress } from '../../hooks/useLongPress';

export type LibrarySeg = 'downloaded' | 'local' | 'favorites' | 'shelves' | 'read' | 'bookmarks' | 'notes';

export const LIBRARY_SEG_LABELS: Record<LibrarySeg, string> = {
  downloaded: 'На устройстве',
  local: 'Папки',
  favorites: 'Избранное',
  shelves: 'Полки',
  read: 'Прочитано',
  bookmarks: 'Закладки',
  notes: 'Заметки',
};

const LIBRARY_GROUP: { seg: LibrarySeg; icon: LucideIcon }[] = [
  { seg: 'downloaded', icon: HardDrive },
  { seg: 'local', icon: FolderOpen },
  { seg: 'favorites', icon: Heart },
  { seg: 'read', icon: CheckCircle2 },
];

const NOTES_GROUP: { seg: LibrarySeg; icon: LucideIcon }[] = [
  { seg: 'bookmarks', icon: Bookmark },
  { seg: 'notes', icon: Highlighter },
];

function Row({
  icon: Icon,
  label,
  count,
  current,
  accent,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
  current?: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={current || undefined}
      onClick={onClick}
      className={`w-full min-h-14 flex items-center gap-3.5 px-0.5 text-left border-b ${theme.divider} ${
        current ? 'bg-[var(--app-accent-soft)]' : theme.rowPress
      } ${theme.focusRing} ${motion.press}`}
    >
      <Icon className={`w-5 h-5 shrink-0 ${accent || current ? theme.accentText : theme.textMuted}`} aria-hidden />
      <span className={`flex-1 min-w-0 truncate ${textStyles.bodyBold} ${accent ? theme.accentText : theme.text}`}>{label}</span>
      {typeof count === 'number' ? (
        <span className={`shrink-0 ${textStyles.caption} tabular-nums ${theme.textMuted}`}>{count}</span>
      ) : null}
      <ChevronRight className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
    </button>
  );
}

function ShelfRow({
  shelf,
  current,
  onOpen,
  onDelete,
}: {
  shelf: UiShelf;
  current: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  // Delete on long-press, like a shelf card: no red bin on every row.
  const press = useLongPress(onOpen, onDelete);
  return (
    <button
      type="button"
      aria-current={current || undefined}
      {...press}
      aria-description={onDelete ? 'Удерживайте, чтобы удалить полку' : undefined}
      className={`w-full min-h-14 flex items-center gap-3.5 px-0.5 text-left border-b select-none ${theme.divider} ${
        current ? 'bg-[var(--app-accent-soft)]' : theme.rowPress
      } ${theme.focusRing} ${motion.press}`}
    >
      <Library className={`w-5 h-5 shrink-0 ${current ? theme.accentText : theme.textMuted}`} aria-hidden />
      <span className={`flex-1 min-w-0 truncate ${textStyles.bodyBold} ${theme.text}`}>{shelf.name}</span>
      <span className={`shrink-0 ${textStyles.caption} tabular-nums ${theme.textMuted}`}>{shelf.bookCount ?? 0}</span>
      <ChevronRight className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
    </button>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 first:mt-2">
      <div className="mb-1.5">
        <h2 className={`${textStyles.captionBold} ${theme.textMuted}`}>{title}</h2>
        {/* Own line: beside the title it was cut off in the narrow tablet column. */}
        {hint ? <p className={`${textStyles.caption} ${theme.textMuted}`}>{hint}</p> : null}
      </div>
      <div className={`border-t ${theme.divider}`}>{children}</div>
    </section>
  );
}

/** «Мои книги» index: collections grouped like a library card catalogue, not a tab strip. */
export default function LibraryCollections({
  seg,
  activeShelfKey,
  highlightCurrent,
  counts,
  shelves,
  queueCount = 0,
  onSelect,
  onSelectShelf,
  onRemoveShelf,
  onNewShelf,
  onOpenQueue,
}: {
  seg: LibrarySeg;
  activeShelfKey: string | null;
  /** Wide layout keeps the list beside the content, so the open collection is marked. */
  highlightCurrent: boolean;
  counts: Partial<Record<LibrarySeg, number>>;
  shelves: UiShelf[];
  queueCount?: number;
  onSelect: (seg: LibrarySeg) => void;
  onSelectShelf: (shelf: UiShelf) => void;
  onRemoveShelf?: (shelf: UiShelf) => void;
  onNewShelf?: () => void;
  onOpenQueue?: () => void;
}) {
  const isCurrent = (s: LibrarySeg) => highlightCurrent && seg === s && !(s === 'shelves' && activeShelfKey != null);
  const regularShelves = shelves.filter((shelf) => shelf.kind !== 'smart');
  const smartShelves = shelves.filter((shelf) => shelf.kind === 'smart');
  const removeShelf = onRemoveShelf
    ? (shelf: UiShelf) => () => onRemoveShelf(shelf)
    : undefined;
  return (
    <nav aria-label="Коллекции">
      {queueCount > 0 && onOpenQueue ? (
        <div className={`mt-2 border-y ${theme.divider}`}>
          <Row icon={Download} label="Очередь загрузок" count={queueCount} accent onClick={onOpenQueue} />
        </div>
      ) : null}
      <Group title="Библиотека">
        {LIBRARY_GROUP.map(({ seg: s, icon }) => (
          <Row
            key={s}
            icon={icon}
            label={LIBRARY_SEG_LABELS[s]}
            count={counts[s]}
            current={isCurrent(s)}
            onClick={() => onSelect(s)}
          />
        ))}
      </Group>
      <Group title="Из книг">
        {NOTES_GROUP.map(({ seg: s, icon }) => (
          <Row
            key={s}
            icon={icon}
            label={LIBRARY_SEG_LABELS[s]}
            count={counts[s]}
            current={isCurrent(s)}
            onClick={() => onSelect(s)}
          />
        ))}
      </Group>
      {regularShelves.length > 0 || onNewShelf ? <Group title="Полки" hint={regularShelves.length > 0 && onRemoveShelf ? 'Удерживайте полку, чтобы удалить' : undefined}>
        {regularShelves.map((shelf) => (
          <ShelfRow
            key={shelfKey(shelf)}
            shelf={shelf}
            current={highlightCurrent && seg === 'shelves' && activeShelfKey === shelfKey(shelf)}
            onOpen={() => onSelectShelf(shelf)}
            onDelete={removeShelf?.(shelf)}
          />
        ))}
        {onNewShelf ? (
          regularShelves.length === 0 ? (
            <Row icon={Plus} label="Создать полку" accent onClick={onNewShelf} />
          ) : (
            <button
              type="button"
              onClick={onNewShelf}
              title="Создать полку"
              aria-label="Создать полку"
              className={`inline-flex items-center justify-center w-12 h-12 mt-1 ${radii.md} ${theme.accentText} ${theme.focusRing} ${motion.press}`}
            >
              <Plus className="w-5 h-5" aria-hidden />
            </button>
          )
        ) : null}
      </Group> : null}
      {smartShelves.length > 0 ? <Group title="Умные полки" hint={regularShelves.length === 0 && onRemoveShelf ? 'Удерживайте полку, чтобы удалить' : undefined}>
        {smartShelves.map((shelf) => (
          <ShelfRow
            key={shelfKey(shelf)}
            shelf={shelf}
            current={highlightCurrent && seg === 'shelves' && activeShelfKey === shelfKey(shelf)}
            onOpen={() => onSelectShelf(shelf)}
            onDelete={removeShelf?.(shelf)}
          />
        ))}
      </Group> : null}
    </nav>
  );
}
