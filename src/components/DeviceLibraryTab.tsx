import React from 'react';
import { HardDrive, Trash2, FolderPlus } from 'lucide-react';
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
import { seriesVolumeSortKey } from '../lib/seriesVolumeSort';
import { usePageTitle } from '../ui/pageTitle';
import { useBarHeight } from '../ui/useBarHeight';

type DeviceSort = 'recent' | 'title' | 'author' | 'volume';

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
  onRemoveBooks?: (bookIds: string[]) => void | Promise<void>;
  onAddBooksToShelf?: (shelfId: number | string, bookIds: string[]) => void | Promise<void>;
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
  usePageTitle('На устройстве', undefined, !embedded);
  const [sort, setSort] = React.useState<DeviceSort>('recent');
  const [selectMode, setSelectMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [shelfPickerOpen, setShelfPickerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [setToolEl, toolH] = useBarHeight();
  const { viewMode, setViewMode } = useCatalogViewMode('books');
  const resetEpochSeen = React.useRef(resetEpoch);

  const sorted = React.useMemo(() => {
    const list = [...books];
    if (sort === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    } else if (sort === 'author') {
      list.sort((a, b) => {
        const byAuthor = (a.author || '').localeCompare(b.author || '', 'ru');
        return byAuthor !== 0 ? byAuthor : a.title.localeCompare(b.title, 'ru');
      });
    } else if (sort === 'volume') {
      list.sort((a, b) => {
        const sa = (a.series || '').trim();
        const sb = (b.series || '').trim();
        if (!sa !== !sb) return sa ? -1 : 1;
        const bySeries = sa.localeCompare(sb, 'ru');
        if (bySeries !== 0) return bySeries;
        const ka = seriesVolumeSortKey(a);
        const kb = seriesVolumeSortKey(b);
        if (ka !== kb) return ka - kb;
        return a.title.localeCompare(b.title, 'ru');
      });
    } else {
      list.sort((a, b) => {
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
    }
    return list;
  }, [books, readingProgressByBookId, sort]);

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
      await onRemoveBooks([...selected]);
      exitSelect();
    } finally {
      setBusy(false);
    }
  }, [exitSelect, onRemoveBooks, selected]);

  const handleAddToShelf = React.useCallback(
    async (shelfId: number | string) => {
      if (!onAddBooksToShelf || selected.size === 0) return;
      setBusy(true);
      try {
        await onAddBooksToShelf(shelfId, [...selected]);
        exitSelect();
      } finally {
        setBusy(false);
      }
    },
    [exitSelect, onAddBooksToShelf, selected],
  );

  if (!storageDirectoryReady) {
    return (
      <div className="flex-1 overflow-y-auto inpx-page-scroll px-5 py-4" aria-busy aria-label="Подготовка хранилища">
        <BookListSkeleton count={4} />
      </div>
    );
  }

  if (!storageDirectory?.uri) {
    return (
      <div className="flex-1 overflow-y-auto inpx-page-scroll">
      <EmptyState
        icon={HardDrive}
        title="Выберите папку"
        description="Книги хранятся на устройстве и доступны без интернета."
        actionLabel={onGoProfile ? 'Выбрать папку' : undefined}
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
        title="Загрузок пока нет"
        description="Здесь появятся книги, которые вы скачаете из каталога."
        actionLabel={onGoCatalog ? 'Каталог' : undefined}
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
        <CatalogBookList
          books={sorted}
          viewMode={viewMode}
          serverConfig={serverConfig}
          storageDirectory={storageDirectory}
          downloadedBookIds={sorted.map((b) => b.id)}
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
      </div>
      <div
        ref={setToolEl}
        className="inpx-chrome inpx-chrome-top absolute inset-x-0 z-10 px-5 py-1 space-y-2"
        style={{ top: 'calc(var(--app-header-offset, 4rem) + var(--inpx-under, 0px))' }}
      >
        <div className="flex items-center justify-between gap-3">
          <label className={`min-w-0 ${textStyles.caption} ${theme.textMuted}`}>
            <span className="sr-only">Сортировка</span>
            <select
              className={`max-w-full bg-transparent pr-1 py-2 min-h-11 ${textStyles.body} ${theme.text} ${theme.focusRing}`}
              value={sort}
              onChange={(e) => setSort(e.target.value as DeviceSort)}
              aria-label="Сортировка"
            >
              <option value="recent">Недавно читал</option>
              <option value="title">Название</option>
              <option value="author">Автор</option>
              <option value="volume">Номер тома</option>
            </select>
          </label>
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
              {selectMode ? 'Отмена' : 'Выбрать'}
            </button>
          </div>
        </div>
        {selectMode && (
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`${textStyles.caption} ${theme.textMuted}`}>
              Выбрано: {selected.size}
            </p>
            <Button
              variant="secondary"
              disabled={busy || selected.size === 0 || !onRemoveBooks}
              onClick={() => void handleDeleteSelected()}
            >
              <Trash2 className="w-4 h-4" aria-hidden />
              Удалить файлы
            </Button>
            {shelves.length > 0 && onAddBooksToShelf && (
              <Button
                variant="secondary"
                disabled={busy || selected.size === 0}
                onClick={() => setShelfPickerOpen((v) => !v)}
              >
                <FolderPlus className="w-4 h-4" aria-hidden />
                На полку
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
