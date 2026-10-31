import React from 'react';
import { AlertCircle, ChevronRight, ListOrdered } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { Book, ServerConfig } from '../types';
import type { StorageDirectory } from '../lib/storageDirectory';
import {
  fetchCollection,
  fetchCollections,
  isAuthError,
  isUnreachableServerError,
  mapServerBook,
  type ServerCollectionDetail,
  type ServerCollectionSummary,
} from '../lib/inpxClient';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import CatalogBookList from './catalog/CatalogBookList';
import ShelfHomeToggle from './shelves/ShelfHomeToggle';
import { Reorder } from 'motion/react';
import { DragRow, useDragOrder } from '../ui/DragReorder';
import { orderCollections, useHomeLayout } from '../lib/homeLayout';
import ViewModeToggle from '../ui/ViewModeToggle';
import { BookGridSkeleton, BookListSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import { textStyles, motion } from '../ui/tokens';
import { usePageTitle } from '../ui/pageTitle';

interface CollectionsPanelProps {
  serverConfig: ServerConfig;
  storageDirectory?: StorageDirectory | null;
  downloadedBookIds: string[];
  readingProgressByBookId?: Record<string, number>;
  readIds?: Set<string>;
  isAppDark?: boolean;
  isTabActive?: boolean;
  onClose: () => void;
  onOpenDetails?: (book: Book) => void;
  onBookLongPress?: (book: Book) => void;
  onAuthExpired?: () => void;
  onConnectionLost?: () => void;
  /** Home toggle on each row and on a collection, like server shelves in «Мои книги»; → new state, null on error. */
  onSetOnHome?: (slug: string, on: boolean) => Promise<boolean | null>;
  /** Drag by ⠿ (all slugs in the new order) → `homeLayout.collectionOrder`. Omitted offline. */
  onReorder?: (slugs: string[]) => void;
  /** «Искать» on a book the library does not have → catalog search (title + author). */
  onSearch?: (query: string) => void;
}

function foundLabel(found: number, total: number) {
  return `В библиотеке ${found.toLocaleString('ru-RU')} из ${total.toLocaleString('ru-RU')}`;
}

/**
 * «Подборки» (server `/api/collections`), built from the shelf screens: rows like «Мои книги → Полки»,
 * a collection like a shelf (`HomeShelfPanel`: covers / list, same view toggle) in the list's order;
 * entries the library does not have follow as plain rows.
 */
export default function CollectionsPanel({
  serverConfig,
  storageDirectory,
  downloadedBookIds,
  readingProgressByBookId,
  readIds,
  isAppDark = false,
  isTabActive = true,
  onClose,
  onOpenDetails,
  onBookLongPress,
  onAuthExpired,
  onConnectionLost,
  onSetOnHome,
  onReorder,
  onSearch,
}: CollectionsPanelProps) {
  const homeLayout = useHomeLayout();
  const [collections, setCollections] = React.useState<ServerCollectionSummary[]>([]);
  const [listLoading, setListLoading] = React.useState(true);
  const [openSlug, setOpenSlug] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ServerCollectionDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const { viewMode, setViewMode } = useCatalogViewMode('books');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const closeDetail = React.useCallback(() => {
    setOpenSlug(null);
    setDetail(null);
  }, []);

  useOverlayBackHandler(isTabActive && !openSlug, onClose);
  useOverlayBackHandler(isTabActive && Boolean(openSlug), closeDetail);
  usePageTitle('Подборки', onClose, isTabActive && !openSlug);
  const openTitle = detail?.title || collections.find((c) => c.slug === openSlug)?.title || 'Подборка';
  usePageTitle(openTitle, closeDetail, isTabActive && Boolean(openSlug));

  React.useEffect(() => {
    if (!isTabActive) onClose();
  }, [isTabActive, onClose]);

  React.useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    fetchCollections(serverConfig)
      .then((items) => {
        if (!cancelled) setCollections(items);
      })
      .catch((e: unknown) => {
        if (!cancelled && isAuthError(e)) onAuthExpired?.();
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverConfig, reloadKey, onAuthExpired]);

  React.useEffect(() => {
    if (!openSlug) return undefined;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(false);
    fetchCollection(serverConfig, openSlug)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setDetailError(!data);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (isAuthError(e)) onAuthExpired?.();
        else if (isUnreachableServerError(e)) onConnectionLost?.();
        setDetail(null);
        setDetailError(true);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverConfig, openSlug, reloadKey, onAuthExpired, onConnectionLost]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [openSlug]);

  const books = React.useMemo(
    () => (detail?.items || []).flatMap((item) => (item.book ? [mapServerBook(item.book, serverConfig) as Book] : [])),
    [detail, serverConfig],
  );
  const missing = React.useMemo(() => (detail?.items || []).filter((item) => !item.book), [detail]);
  /** The open collection's list entry: holds its `onHome`, which the house icon flips. */
  const openSummary = collections.find((c) => c.slug === openSlug) || null;

  /** Optimistic, like `useInpxServer.setShelfOnHome`: flip now, roll back when the server refuses. */
  const toggleOnHome = React.useCallback(async (c: ServerCollectionSummary) => {
    if (!onSetOnHome) return;
    const next = !Number(c.onHome);
    const apply = (value: boolean) => setCollections((list) => list.map((item) => (
      item.slug === c.slug ? { ...item, onHome: value ? 1 : 0 } : item
    )));
    apply(next);
    const result = await onSetOnHome(c.slug, next);
    if (result === null) apply(!next);
    else if (result !== next) apply(result);
  }, [onSetOnHome]);

  /* The user's order (homeLayout.collectionOrder, shared with the web /collections list). */
  const ordered = React.useMemo(
    () => orderCollections(collections, homeLayout.collectionOrder),
    [collections, homeLayout.collectionOrder],
  );
  const slugs = ordered.map((c) => c.slug);
  const drag = useDragOrder(slugs, (next) => onReorder?.(next));
  const sortable = Boolean(onReorder) && ordered.length > 1;

  const renderList = () => {
    if (listLoading) return <BookListSkeleton count={5} />;
    if (!collections.length) {
      return <EmptyState icon={ListOrdered} title="Подборок нет" description="Администратор может включить их в Админка → Контент." />;
    }
    if (sortable) {
      // Same as the shelves list in «Мои книги» (`SortableShelfList`): drag by ⠿, ↑↓ on the handle.
      const bySlug = new Map(ordered.map((c) => [c.slug, c]));
      return (
        <Reorder.Group axis="y" as="ul" values={drag.order} onReorder={drag.setOrder} aria-label="Порядок подборок" className={`border-t ${theme.divider}`}>
          {drag.order.map((slug) => {
            const c = bySlug.get(slug);
            if (!c) return null;
            return (
              <DragRow
                key={slug}
                value={slug}
                label={c.title}
                onDragStart={drag.start}
                onDragEnd={drag.finish}
                onMove={(step) => drag.moveBy(slug, step)}
                className={`border-b ${theme.divider}`}
              >
                <div className="flex-1 min-w-0 [&>*]:border-b-0">{renderRow(c)}</div>
              </DragRow>
            );
          })}
        </Reorder.Group>
      );
    }
    return <div className={`border-t ${theme.divider}`}>{ordered.map((c) => <React.Fragment key={c.slug}>{renderRow(c)}</React.Fragment>)}</div>;
  };

  function renderRow(c: ServerCollectionSummary) {
    return (
          <div className={`flex items-center border-b ${theme.divider}`}>
          <button
            type="button"
            onClick={() => setOpenSlug(c.slug)}
            className={`flex-1 min-w-0 min-h-14 flex items-center gap-3.5 px-0.5 py-2 text-left ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
          >
            <ListOrdered className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className={`block truncate ${textStyles.bodyBold} ${theme.text}`}>{c.title}</span>
              {c.description ? <span className={`block ${textStyles.caption} ${theme.textMuted} line-clamp-2`}>{c.description}</span> : null}
            </span>
            <span className={`shrink-0 ${textStyles.caption} tabular-nums ${theme.textMuted}`}>
              {c.matching ? '…' : `${c.found}/${c.total}`}
            </span>
            <ChevronRight className={`w-5 h-5 shrink-0 ${theme.textMuted}`} aria-hidden />
          </button>
          {onSetOnHome && c.onHome !== undefined ? (
            <ShelfHomeToggle name={c.title} onHome={Boolean(Number(c.onHome))} onToggle={() => { void toggleOnHome(c); }} />
          ) : null}
          </div>
    );
  }

  const renderDetail = () => {
    if (detailError && !detailLoading) {
      return (
        <EmptyState
          compact
          tone="error"
          icon={AlertCircle}
          title="Не удалось загрузить подборку"
          description="Проверьте соединение с сервером."
          actionLabel="Повторить"
          actionVariant="secondary"
          onAction={() => setReloadKey((k) => k + 1)}
        />
      );
    }
    if (detailLoading || !detail) {
      return (
        <div aria-busy aria-label="Загрузка">
          <BookGridSkeleton count={9} />
        </div>
      );
    }
    const summary = [
      detail.matching ? 'Сопоставляется с каталогом…' : foundLabel(detail.found, detail.total),
      detail.found ? `прочитано ${detail.read.toLocaleString('ru-RU')}` : '',
    ].filter(Boolean).join(' · ');
    return (
      <>
        {detail.description ? <p className={`mb-1 ${textStyles.caption} ${theme.textMuted}`}>{detail.description}</p> : null}
        {detail.source ? (
          // Plain text: the app has no way to open an external page (a link would navigate the WebView away).
          <p className={`mb-3 ${textStyles.caption} ${theme.textMuted}`}>Источник: {detail.source}</p>
        ) : <div className="mb-2" />}
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className={`${textStyles.micro} ${theme.textMuted}`}>{summary}</p>
          <span className="flex items-center gap-1 shrink-0">
            {/* «На главной» here too, like the house icon on the web collection page. */}
            {onSetOnHome && openSummary?.onHome !== undefined ? (
              <ShelfHomeToggle name={openSummary.title} onHome={Boolean(Number(openSummary.onHome))} onToggle={() => { void toggleOnHome(openSummary); }} />
            ) : null}
            {books.length ? <ViewModeToggle value={viewMode} onChange={setViewMode} /> : null}
          </span>
        </div>
        {books.length ? (
          <CatalogBookList
            books={books}
            viewMode={viewMode}
            isServerBrowse
            serverConfig={serverConfig}
            storageDirectory={storageDirectory}
            isAppDark={isAppDark}
            downloadedBookIds={downloadedBookIds}
            readingProgressByBookId={readingProgressByBookId}
            readIds={readIds}
            onBookClick={(book) => onOpenDetails?.(book)}
            onBookLongPress={onBookLongPress}
          />
        ) : null}
        {missing.length ? (
          <section className="mt-7">
            <h2 className={`mb-1.5 ${textStyles.captionBold} ${theme.textMuted}`}>Нет в библиотеке</h2>
            <div className={`border-t ${theme.divider}`}>
              {missing.map((item) => (
                <div key={item.position} className={`min-h-14 flex items-center gap-3 px-0.5 py-2 border-b ${theme.divider}`}>
                  <span className="min-w-0 flex-1 flex flex-col">
                    <span className={`${textStyles.bodyBold} ${theme.text}`}>{item.title}</span>
                    <span className={`${textStyles.caption} ${theme.textMuted}`}>
                      {[item.author, item.year ? String(item.year) : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {/* «искать» like the web page: the catalog search for title + author. */}
                  {onSearch ? (
                    <button
                      type="button"
                      onClick={() => onSearch([item.title, item.author].filter(Boolean).join(' '))}
                      className={`shrink-0 min-h-10 px-3 rounded-full ${textStyles.micro} ${theme.chip} ${theme.chipHover} ${theme.focusRing} ${motion.press}`}
                    >
                      Искать
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </>
    );
  };

  return (
    <div className="relative flex-1 min-h-0 h-full">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto inpx-page-scroll px-5 py-3 min-[600px]:px-8">
        {openSlug ? renderDetail() : renderList()}
      </div>
    </div>
  );
}
