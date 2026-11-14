import React from 'react';
import { ArrowLeft, HardDrive, Trash2, FolderPlus } from 'lucide-react';
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
import { filterBooksLocal, groupBooksByAuthor, groupBooksBySeries, sortBooksLocal } from '../lib/localBookSort';
import LiteEntityRow from './LiteEntityRow';
import LocalBookFilter from './mybooks/LocalBookFilter';
import { usePageTitle } from '../ui/pageTitle';
import { useBarHeight } from '../ui/useBarHeight';
import { t, tn } from '../i18n';

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
  const [openAuthor, setOpenAuthor] = React.useState<string | null>(null);
  const [selectMode, setSelectMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [shelfPickerOpen, setShelfPickerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [setToolEl, toolH] = useBarHeight();
  const { viewMode, setViewMode } = useCatalogViewMode('books');
  const resetEpochSeen = React.useRef(resetEpoch);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const authorsScrollTop = React.useRef(0);

  // Like the catalog: authors → an author's books by series. A search shows the matching books flat.
  const sorted = books;
  const authors = React.useMemo(() => groupBooksByAuthor(books), [books]);
  const current = openAuthor == null ? null : authors.find((g) => g.key === openAuthor) ?? null;
  const seriesGroups = React.useMemo(() => (current ? groupBooksBySeries(current.books) : []), [current]);
  const searchHits = React.useMemo(
    () => (query.trim() ? sortBooksLocal(filterBooksLocal(books, query), 'title') : null),
    [books, query],
  );
  const downloadedIds = React.useMemo(() => books.map((b) => b.id), [books]);
  const showBooks = Boolean(searchHits || current);

  // The open author lost every book (files deleted): back to the authors.
  React.useEffect(() => {
    if (openAuthor != null && !current) setOpenAuthor(null);
  }, [openAuthor, current]);

  useOverlayBackHandler(openAuthor != null && !searchHits, () => setOpenAuthor(null));

  // An author opens at the top; back to the authors returns to where the list was.
  const openAuthorPage = React.useCallback((key: string) => {
    authorsScrollTop.current = scrollRef.current?.scrollTop ?? 0;
    setOpenAuthor(key);
  }, []);
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = openAuthor == null ? authorsScrollTop.current : 0;
  }, [openAuthor]);

  const exitSelect = React.useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
    setShelfPickerOpen(false);
  }, []);

  // Системный Back: сначала закрывает выбор полки, затем выходит из multi-select.
  useOverlayBackHandler(selectMode, exitSelect);
  useOverlayBackHandler(shelfPickerOpen, () => setShelfPickerOpen(false));

  // Selection belongs to the list on screen: leaving or opening an author drops it.
  React.useEffect(() => {
    exitSelect();
  }, [openAuthor, exitSelect]);

  React.useEffect(() => {
    if (resetEpochSeen.current === resetEpoch) return;
    resetEpochSeen.current = resetEpoch;
    exitSelect();
    setOpenAuthor(null);
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
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto inpx-page-scroll px-5 py-4">
        {searchHits ? (
          searchHits.length === 0 ? (
            <p className={`py-8 text-center ${textStyles.body} ${theme.textMuted}`}>{t('common.nothingFound')}</p>
          ) : (
            <CatalogBookList
              books={searchHits}
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
          )
        ) : current ? (
          <>
            <button
              type="button"
              onClick={() => setOpenAuthor(null)}
              className={`${touchMin} -ml-1 px-1 inline-flex items-center gap-2 ${textStyles.captionBold} ${theme.accentText} ${theme.focusRing}`}
            >
              <ArrowLeft className="w-5 h-5" aria-hidden /> {t('common.back')}
            </button>
            <div className="mt-1 mb-3">
              <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('common.author')}</p>
              <h2 className={`${textStyles.bookTitle} ${theme.text}`}>{current.label}</h2>
            </div>
            <div className="flex flex-col gap-5">
              {seriesGroups.map((group) => (
                <section key={group.key || '_'} className="min-w-0">
                  <div className="mb-1 flex items-baseline justify-between gap-2 min-h-10 px-0.5">
                    <h3 className={`${textStyles.bookTitle} truncate`}>{group.label}</h3>
                    <span className={`shrink-0 ${textStyles.caption} ${theme.textMuted} tabular-nums`}>
                      {tn('common.booksShort', group.books.length)}
                    </span>
                  </div>
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
                </section>
              ))}
            </div>
          </>
        ) : (
          <div>
            {authors.map((group) => (
              <LiteEntityRow
                key={group.key || '_'}
                name={group.label}
                count={group.books.length}
                onClick={() => openAuthorPage(group.key)}
              />
            ))}
          </div>
        )}
      </div>
      <div
        ref={setToolEl}
        className="inpx-chrome inpx-chrome-top absolute inset-x-0 z-10 px-5 py-1 space-y-2"
        style={{ top: 'calc(var(--app-header-offset, 4rem) + var(--inpx-under, 0px))' }}
      >
        {sorted.length > 1 ? <LocalBookFilter value={query} onChange={setQuery} /> : null}
        {showBooks ? (
        <div className="flex items-center justify-end gap-3">
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
        ) : null}
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
