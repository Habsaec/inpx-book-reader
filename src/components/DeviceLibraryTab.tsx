import React from 'react';
import { CheckSquare, HardDrive, Trash2, FolderPlus, X } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, touchMin, radii } from '../ui/tokens';
import { Book, ServerConfig } from '../types';
import EmptyState from '../ui/EmptyState';
import { ScreenLoader } from '../ui/Skeleton';
import CatalogBookList from './catalog/CatalogBookList';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import type { StorageDirectory } from '../lib/storageDirectory';
import type { UiShelf } from '../lib/inpxClient';
import Button from '../ui/Button';
import { readOfflineReaderData } from '../lib/offlineReaderStore';

type DeviceSort = 'recent' | 'title' | 'author';

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
  shelves?: UiShelf[];
  onOpenBook: (book: Book) => void;
  onContinueBook: (book: Book) => void;
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
  isOnline,
  readingProgressByBookId = {},
  shelves = [],
  onOpenBook,
  onContinueBook,
  onOpenDetails,
  onBookLongPress,
  onRemoveBooks,
  onAddBooksToShelf,
  onGoCatalog,
  onGoProfile,
  embedded = false,
  resetEpoch = 0,
}: DeviceLibraryTabProps) {
  const [sort, setSort] = React.useState<DeviceSort>('recent');
  const [selectMode, setSelectMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [shelfPickerOpen, setShelfPickerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const { viewMode } = useCatalogViewMode('books');
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
    } else {
      list.sort((a, b) => {
        const da = readOfflineReaderData(a.id);
        const db = readOfflineReaderData(b.id);
        const ra = Date.parse(da.positionChangedAt || da.updatedAt || '') || 0;
        const rb = Date.parse(db.positionChangedAt || db.updatedAt || '') || 0;
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
    return <ScreenLoader label="Подготовка хранилища…" />;
  }

  if (!storageDirectory?.uri) {
    return (
      <EmptyState
        icon={HardDrive}
        title="Папка хранения не выбрана"
        description="Укажите папку для книг в настройках, затем скачайте книги из поиска."
        actionLabel={onGoProfile ? 'Открыть настройки' : undefined}
        onAction={onGoProfile}
      />
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={HardDrive}
        title="На устройстве пока нет книг"
        description={
          isOnline
            ? 'Скачайте книги из поиска — они появятся здесь и будут доступны без сети.'
            : 'Подключитесь к серверу и скачайте книги, пока есть сеть.'
        }
        actionLabel={onGoCatalog ? 'Открыть поиск' : undefined}
        onAction={onGoCatalog}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
      <div className={`px-5 pt-3 pb-3 shrink-0 space-y-3 ${theme.bg}`}>
        {!embedded && (
          <>
            <h2 className={textStyles.title}>На устройстве</h2>
            <p className={`${textStyles.caption} ${theme.textMuted}`}>
              {sorted.length} {sorted.length === 1 ? 'книга' : sorted.length < 5 ? 'книги' : 'книг'}
            </p>
          </>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <label className={`inline-flex min-w-0 max-w-[10.5rem] ${textStyles.caption} ${theme.textMuted}`}>
            <span className="sr-only">Сортировка</span>
            <select
              className={`w-full ${radii.button} border px-3 py-2.5 min-h-12 ${theme.input} ${theme.inputFocus}`}
              value={sort}
              onChange={(e) => setSort(e.target.value as DeviceSort)}
              aria-label="Сортировка"
            >
              <option value="recent">Недавно читал</option>
              <option value="title">Название</option>
              <option value="author">Автор</option>
            </select>
          </label>
          <button
            type="button"
            className={`${touchMin} px-4 ${radii.button} inline-flex items-center gap-1.5 text-sm font-semibold ${theme.chip} ${theme.chipHover} ${theme.focusRing}`}
            onClick={() => {
              if (selectMode) exitSelect();
              else setSelectMode(true);
            }}
            aria-pressed={selectMode}
          >
            {selectMode ? <X className="w-4 h-4" aria-hidden /> : <CheckSquare className="w-4 h-4" aria-hidden />}
            {selectMode ? 'Отмена' : 'Выбрать'}
          </button>
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

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <CatalogBookList
          books={sorted}
          viewMode={viewMode}
          serverConfig={serverConfig}
          storageDirectory={storageDirectory}
          downloadedBookIds={sorted.map((b) => b.id)}
          readingProgressByBookId={readingProgressByBookId}
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
            const progress = readingProgressByBookId[book.id] ?? book.readProgress ?? 0;
            if (progress > 0) onContinueBook(book);
            else onOpenBook(book);
          }}
          onBookLongPress={
            selectMode
              ? (book) => toggleSelected(book.id)
              : onBookLongPress
          }
        />
      </div>
    </div>
  );
}
