import React from 'react';
import { HardDrive, Trash2, FolderPlus, ChevronDown } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, touchMin, radii } from '../ui/tokens';
import { Book, ServerConfig } from '../types';
import EmptyState from '../ui/EmptyState';
import { BookListSkeleton } from '../ui/Skeleton';
import CatalogBookList from './catalog/CatalogBookList';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import ViewModeToggle from '../ui/ViewModeToggle';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { UiShelf } from '../lib/inpxClient';
import Button from '../ui/Button';
import { readOfflineReaderData } from '../lib/offlineReaderStore';
import { parseSyncTs } from '../lib/readerActivitySync';
import { filterBooksLocal, groupBooksLocal, sortBooksLocal, type LocalBookGrouping } from '../lib/localBookSort';
import ChoicePicker from '../ui/ChoicePicker';
import {
  APP_SETTING_KEYS,
  APP_SETTINGS_HYDRATED_EVENT,
  getAppSettingString,
  setAppSettingRaw,
} from '../lib/appSettings';
import LocalBookFilter from './mybooks/LocalBookFilter';
import { usePageTitle } from '../ui/pageTitle';
import { useBarHeight } from '../ui/useBarHeight';
import BookSortBar from './catalog/BookSortBar';
import { t } from '../i18n';

type DeviceSort = 'recent' | 'title' | 'author' | 'volume' | 'rating';

const DEVICE_SORT_OPTIONS: Array<{ id: DeviceSort; label: string }> = [
  { id: 'recent', label: t('deviceLibraryTab.recentlyOpened') },
  { id: 'title', label: t('common.title') },
  { id: 'author', label: t('common.author') },
  { id: 'volume', label: t('common.volumeNumber') },
  { id: 'rating', label: t('common.rating') },
];

const DEVICE_GROUP_OPTIONS: Array<{ id: LocalBookGrouping; label: string }> = [
  { id: 'none', label: t('deviceLibraryTab.groupNone') },
  { id: 'author', label: t('deviceLibraryTab.groupByAuthor') },
  { id: 'series', label: t('deviceLibraryTab.groupBySeries') },
];

function readGrouping(): LocalBookGrouping {
  const raw = getAppSettingString(APP_SETTING_KEYS.downloadedGrouping, 'none');
  return raw === 'author' || raw === 'series' ? raw : 'none';
}

/** Grouping of «Скачанные», a device setting (app_meta): re-read once the settings are loaded. */
function useDownloadedGrouping(): [LocalBookGrouping, (g: LocalBookGrouping) => void] {
  const [grouping, setGrouping] = React.useState<LocalBookGrouping>(readGrouping);
  React.useEffect(() => {
    const onHydrated = () => setGrouping(readGrouping());
    window.addEventListener(APP_SETTINGS_HYDRATED_EVENT, onHydrated);
    return () => window.removeEventListener(APP_SETTINGS_HYDRATED_EVENT, onHydrated);
  }, []);
  const update = React.useCallback((g: LocalBookGrouping) => {
    setGrouping(g);
    setAppSettingRaw(APP_SETTING_KEYS.downloadedGrouping, g);
  }, []);
  return [grouping, update];
}

interface DeviceLibraryTabProps {
  books: Book[];
  serverConfig: ServerConfig;
  storageDirectory: StorageDirectory | null;
  storageDirectoryReady?: boolean;
  isAppDark: boolean;
  isOnline: boolean;
  canDownloadOnline: boolean;
  downloadingId?: string | null;
  readingProgressByBookId?: Record<string, number>;
  readIds?: Set<string>;
  shelves?: UiShelf[];
  onOpenBook: (book: Book) => void;
  /** Tap opens the book page, same as catalog and home. */
  onOpenDetails?: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  /** Resolves `false` when nothing was done (dialog cancelled, request failed): the selection stays. */
  onRemoveBooks?: (bookIds: string[]) => void | boolean | Promise<void | boolean>;
  onAddBooksToShelf?: (shelfId: number | string, bookIds: string[]) => void | boolean | Promise<void | boolean>;
  onGoCatalog?: () => void;
  onGoProfile?: () => void;
  embedded?: boolean;
  /** Bumped to exit multi-select / shelf picker (tab re-tap). */
  resetEpoch?: number;
}

export default function DeviceLibraryTab({
  books,
  serverConfig,
  storageDirectory,
  storageDirectoryReady = true,
  readingProgressByBookId = {},
  readIds,
  shelves = [],
  onOpenBook,
  onOpenDetails,
  onBookLongPress,
  onRemoveBooks,
  onAddBooksToShelf,
  onGoCatalog,
  onGoProfile,
  embedded = false,
  resetEpoch = 0,
}: DeviceLibraryTabProps) {
  usePageTitle(t('common.onTheDevice'), undefined, !embedded);
  const [sort, setSort] = React.useState<DeviceSort>('recent');
  const [selectMode, setSelectMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [shelfPickerOpen, setShelfPickerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [grouping, setGrouping] = useDownloadedGrouping();
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const [setToolEl, toolH] = useBarHeight();
  const { viewMode, setViewMode } = useCatalogViewMode('books');
  const resetEpochSeen = React.useRef(resetEpoch);

  const sorted = React.useMemo(() => {
    if (sort !== 'recent') return sortBooksLocal(books, sort);
    return [...books].sort((a, b) => {
      const da = readOfflineReaderData(a.id);
      const db = readOfflineReaderData(b.id);
      const ra = parseSyncTs(da.positionChangedAt || da.updatedAt);
      const rb = parseSyncTs(db.positionChangedAt || db.updatedAt);
      if (ra !== rb) return rb - ra;
      const pa = readingProgressByBookId[a.id] ?? a.readProgress ?? 0;
      const pb = readingProgressByBookId[b.id] ?? b.readProgress ?? 0;
      if (pa !== pb) return pb - pa;
      return a.title.localeCompare(b.title, 'ru');
    });
  }, [books, readingProgressByBookId, sort]);

  const visible = React.useMemo(() => filterBooksLocal(sorted, query), [sorted, query]);
  const groups = React.useMemo(() => groupBooksLocal(visible, grouping), [visible, grouping]);
  const downloadedIds = React.useMemo(() => sorted.map((b) => b.id), [sorted]);

  React.useEffect(() => {
    setCollapsed(new Set());
  }, [grouping]);

  const toggleGroup = React.useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const exitSelect = React.useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
    setShelfPickerOpen(false);
  }, []);

  // Системный Back: сначала закрывает выбор полки, затем выходит из multi-select.
  useOverlayBackHandler(selectMode, exitSelect);
  useOverlayBackHandler(shelfPickerOpen, () => setShelfPickerOpen(false));

  React.useEffect(() => {
    if (resetEpochSeen.current === resetEpoch) return;
    resetEpochSeen.current = resetEpoch;
    exitSelect();
  }, [resetEpoch, exitSelect]);

  const toggleSelected = React.useCallback((bookId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }, []);

  const handleDeleteSelected = React.useCallback(async () => {
    if (!onRemoveBooks || selected.size === 0) return;
    setBusy(true);
    try {
      const done = await onRemoveBooks([...selected]);
      if (done !== false) exitSelect();
    } finally {
      setBusy(false);
    }
  }, [exitSelect, onRemoveBooks, selected]);

  const handleAddToShelf = React.useCallback(
    async (shelfId: number | string) => {
      if (!onAddBooksToShelf || selected.size === 0) return;
      setBusy(true);
      try {
        const done = await onAddBooksToShelf(shelfId, [...selected]);
        if (done !== false) exitSelect();
      } finally {
        setBusy(false);
      }
    },
    [exitSelect, onAddBooksToShelf, selected],
  );

  if (!storageDirectoryReady) {
    return (
      <div className="flex-1 overflow-y-auto inpx-page-scroll px-5 py-4" aria-busy aria-label={t('deviceLibraryTab.preparingTheStorage')}>
        <BookListSkeleton count={4} />
      </div>
    );
  }

  if (!storageDirectory?.uri) {
    return (
      <div className="flex-1 overflow-y-auto inpx-page-scroll">
      <EmptyState
        icon={HardDrive}
        title={t('deviceLibraryTab.chooseAFolder')}
        description={t('deviceLibraryTab.booksAreKeptOnThe')}
        actionLabel={onGoProfile ? t('common.chooseAFolder') : undefined}
        actionVariant="primary"
        onAction={onGoProfile}
      />
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto inpx-page-scroll">
      <EmptyState
        icon={HardDrive}
        title={t('deviceLibraryTab.noDownloadsYet')}
        description={t('deviceLibraryTab.booksYouDownloadFromThe')}
        actionLabel={onGoCatalog ? t('common.catalog') : undefined}
        actionVariant="primary"
        onAction={onGoCatalog}
      />
      </div>
    );
  }

  return (
    <div
      className="relative flex-1 min-h-0 h-full"
      style={{ ['--inpx-tool' as string]: `${toolH}px` }}
    >
      <div className="absolute inset-0 overflow-y-auto inpx-page-scroll px-5 py-4">
        {visible.length === 0 ? (
          <p className={`py-8 text-center ${textStyles.body} ${theme.textMuted}`}>{t('common.nothingFound')}</p>
        ) : null}
        {groups.map((group) => {
          const open = !collapsed.has(group.key);
          return (
            <section key={group.key || '_'} className={grouping === 'none' ? '' : 'mb-4'}>
              {grouping !== 'none' ? (
                <button
                  type="button"
                  className={`w-full flex items-center gap-2 py-2 text-left ${theme.focusRing}`}
                  aria-expanded={open}
                  onClick={() => toggleGroup(group.key)}
                >
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 ${theme.textMuted} ${open ? '' : '-rotate-90'}`}
                    aria-hidden
                  />
                  <span className={`flex-1 min-w-0 truncate ${textStyles.bodyBold} ${theme.text}`}>{group.label}</span>
                  <span className={`shrink-0 ${textStyles.caption} ${theme.textMuted}`}>{group.books.length}</span>
                </button>
              ) : null}
              {open ? (
              <CatalogBookList
                books={group.books}
                viewMode={viewMode}
                serverConfig={serverConfig}
                storageDirectory={storageDirectory}
                downloadedBookIds={downloadedIds}
                readingProgressByBookId={readingProgressByBookId}
                readIds={readIds}
                selectedBookIds={selectMode ? selected : undefined}
                virtualizeList={false}
                onBookClick={(book) => {
                  if (selectMode) {
                    toggleSelected(book.id);
                    return;
                  }
                  if (onOpenDetails) {
                    onOpenDetails(book);
                    return;
                  }
                  onOpenBook(book);
                }}
                onBookLongPress={
                  selectMode
                    ? (book) => toggleSelected(book.id)
                    : onBookLongPress
                }
              />
              ) : null}
            </section>
          );
        })}
      </div>
      <div
        ref={setToolEl}
        className="inpx-chrome inpx-chrome-top absolute inset-x-0 z-10 px-5 py-1 space-y-2"
        style={{ top: 'calc(var(--app-header-offset, 4rem) + var(--inpx-under, 0px))' }}
      >
        {sorted.length > 1 ? <LocalBookFilter value={query} onChange={setQuery} /> : null}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ChoicePicker
              value={grouping}
              options={DEVICE_GROUP_OPTIONS}
              onChange={(id) => setGrouping(id as LocalBookGrouping)}
              title={t('deviceLibraryTab.grouping')}
              className="max-w-[9rem]"
            />
            {grouping === 'none' ? (
              <BookSortBar
                value={sort}
                options={DEVICE_SORT_OPTIONS}
                onChange={(id) => setSort(id as DeviceSort)}
              />
            ) : null}
          </div>
          <div className="flex items-center shrink-0">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <button
              type="button"
              className={`${touchMin} px-2 inline-flex items-center gap-1.5 ${textStyles.captionBold} ${theme.accentText} ${theme.focusRing}`}
              onClick={() => {
                if (selectMode) exitSelect();
                else setSelectMode(true);
              }}
              aria-pressed={selectMode}
            >
              {selectMode ? t('common.cancel') : t('deviceLibraryTab.select')}
            </button>
          </div>
        </div>
        {selectMode && (
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`${textStyles.caption} ${theme.textMuted}`}>
              {t('deviceLibraryTab.selected')} {selected.size}
            </p>
            <Button
              variant="secondary"
              disabled={busy || selected.size === 0 || !onRemoveBooks}
              onClick={() => void handleDeleteSelected()}
            >
              <Trash2 className="w-4 h-4" aria-hidden />
              {t('deviceLibraryTab.deleteFiles')}
            </Button>
            {shelves.length > 0 && onAddBooksToShelf && (
              <Button
                variant="secondary"
                disabled={busy || selected.size === 0}
                onClick={() => setShelfPickerOpen((v) => !v)}
              >
                <FolderPlus className="w-4 h-4" aria-hidden />
                {t('common.addToShelf')}
              </Button>
            )}
          </div>
        )}
        {selectMode && shelfPickerOpen && (
          <div className={`rounded-xl border p-2 space-y-1 ${theme.panel}`}>
            {shelves.map((s) => (
              <button
                key={String(s.id)}
                type="button"
                disabled={busy}
                className={`w-full text-left px-3 py-2.5 ${radii.button} text-sm font-medium ${theme.chipButton} ${theme.focusRing}`}
                onClick={() => void handleAddToShelf(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
