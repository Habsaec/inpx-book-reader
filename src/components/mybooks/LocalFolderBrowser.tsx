import React from 'react';
import { ArrowLeft, Folder } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import type { Book, ServerConfig } from '../../types';
import type { StorageDirectory } from '../../lib/storageDirectory';
import type { CatalogViewMode } from '../../lib/catalogViewMode';
import CatalogBookList from '../catalog/CatalogBookList';
import ViewModeToggle from '../../ui/ViewModeToggle';
import EmptyState from '../../ui/EmptyState';
import { textStyles, touchMin, radii } from '../../ui/tokens';
import { BookStorage } from '../../lib/bookStoragePlugin';
import { getAllBooks, upsertBook } from '../../lib/localDb';
import { hasStoredCover, saveCoverToDirectory } from '../../lib/coverCache';
import {
  defaultLibraryFolder,
  readLibraryFolders,
  sameLibraryFolder,
  setHideDefaultInLocal,
  type LibraryFolder,
} from '../../lib/libraryFolders';
import { safeBookIdFileKey } from '../../lib/bookRef';
import { useOverlayBackHandler } from '../../hooks/useBackHandler';

interface DirEntry {
  name: string;
  path: string;
  directory: boolean;
}

const dirListMem = new Map<string, DirEntry[]>();

function dirListKey(uri: string, path: string): string {
  return `${uri}\n${path}`;
}

function sameDirList(a: DirEntry[], b: DirEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].name !== b[i].name || a[i].directory !== b[i].directory) return false;
  }
  return true;
}

function coverBlob(data: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const type = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';
  return new Blob([bytes], { type });
}

function titleFromFile(name: string): string {
  return name.replace(/\.(fb2\.zip|fb2|epub|fbz|zip|pdf|txt)$/i, '') || name;
}

function extFromLocalName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.fb2.zip') || lower.endsWith('.zip')) return 'fb2.zip';
  return (lower.match(/\.([a-z0-9]+)$/)?.[1] || 'fb2');
}

function FolderCells({
  viewMode,
  items,
}: {
  viewMode: CatalogViewMode;
  items: { key: string; label: string; hint?: string; onClick: () => void; onHide?: () => void }[];
}) {
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-3 min-[480px]:grid-cols-4 min-[640px]:grid-cols-5 gap-4">
        {items.map((item) => (
          <div key={item.key} className="min-w-0 flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={item.onClick}
              className={`min-w-0 w-full flex flex-col items-center gap-2 px-1 py-2 text-center ${radii.button} ${theme.focusRing}`}
            >
              <Folder className={`w-12 h-12 ${theme.accentText}`} aria-hidden />
              <span className={`w-full line-clamp-2 ${textStyles.caption} ${theme.text}`}>{item.label}</span>
              {item.hint ? (
                <span className={`w-full line-clamp-1 ${textStyles.caption} ${theme.textMuted}`}>{item.hint}</span>
              ) : null}
            </button>
            {item.onHide ? (
              <button type="button" onClick={item.onHide} className={`${textStyles.caption} ${theme.textMuted} ${theme.focusRing}`}>
                Скрыть
              </button>
            ) : null}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key} className={`w-full min-h-12 px-3 flex items-center gap-3 ${radii.button} ${theme.chip}`}>
          <button
            type="button"
            onClick={item.onClick}
            className={`min-w-0 flex-1 flex items-center gap-3 text-left ${theme.focusRing}`}
          >
            <Folder className="w-5 h-5 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className={`block truncate ${textStyles.body} ${theme.text}`}>{item.label}</span>
              {item.hint ? (
                <span className={`block truncate ${textStyles.caption} ${theme.textMuted}`}>{item.hint}</span>
              ) : null}
            </span>
          </button>
          {item.onHide ? (
            <button type="button" onClick={item.onHide} className={`shrink-0 ${textStyles.caption} ${theme.textMuted} ${theme.focusRing}`}>
              Скрыть
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function naturalNameCompare(a: string, b: string): number {
  const parts = /(\d+|\D+)/g;
  const as = a.match(parts) ?? [];
  const bs = b.match(parts) ?? [];
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const x = as[i] ?? '';
    const y = bs[i] ?? '';
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const dx = x.replace(/^0+(?=\d)/, '');
      const dy = y.replace(/^0+(?=\d)/, '');
      if (dx.length !== dy.length) return dx.length - dy.length;
      if (dx !== dy) return dx < dy ? -1 : 1;
    } else {
      const cmp = x.localeCompare(y, 'ru', { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

type LocalFileMeta = {
  title: string;
  author: string;
  series: string;
  seriesNo: string;
  lang: string;
  genre: string;
};

const LOCAL_META_INDEX_KEY = 'inpx_local_file_meta_v1';
const localMetaIndex = new Map<string, LocalFileMeta>();
let localMetaIndexLoad: Promise<void> | null = null;

function localMetaKey(uri: string, path: string): string {
  return `${uri}\n${path}`;
}

function loadLocalMetaIndex(): Promise<void> {
  if (!localMetaIndexLoad) {
    localMetaIndexLoad = (async () => {
      try {
        const { get } = await import('idb-keyval');
        const raw = await get<Record<string, LocalFileMeta>>(LOCAL_META_INDEX_KEY);
        if (raw && typeof raw === 'object') {
          for (const [id, meta] of Object.entries(raw)) {
            if (meta && typeof meta === 'object') localMetaIndex.set(id, meta);
          }
        }
      } catch {
        /* индекс необязателен */
      }
    })();
  }
  return localMetaIndexLoad;
}

let localMetaFlush: ReturnType<typeof setTimeout> | null = null;

function rememberLocalMeta(key: string, meta: LocalFileMeta): void {
  localMetaIndex.set(key, meta);
  if (localMetaFlush) clearTimeout(localMetaFlush);
  localMetaFlush = setTimeout(() => {
    localMetaFlush = null;
    const snapshot: Record<string, LocalFileMeta> = {};
    for (const [id, value] of localMetaIndex) snapshot[id] = value;
    void import('idb-keyval').then(({ set }) => set(LOCAL_META_INDEX_KEY, snapshot)).catch(() => {});
  }, 400);
}

function seriesNoFromMeta(raw: string): { seriesNo?: number; seriesNoLabel?: string } {
  const label = raw.trim();
  if (!label) return {};
  const n = Number(label.replace(',', '.'));
  return {
    seriesNoLabel: label,
    ...(Number.isFinite(n) && n > 0 ? { seriesNo: n } : {}),
  };
}

function applyLocalFileMeta(book: Book, meta: LocalFileMeta | undefined, fileName: string): Book {
  const ext = extFromLocalName(fileName) || book.ext;
  if (!meta || isCatalogBook(book) || (!meta.title && !meta.author && !meta.series && !meta.genre)) {
    return { ...book, ext };
  }
  return {
    ...book,
    ext,
    title: meta.title || book.title,
    author: meta.author || book.author,
    ...(meta.series ? { series: meta.series, seriesDisplay: meta.series } : {}),
    ...seriesNoFromMeta(meta.seriesNo),
    ...(meta.genre ? { genre: meta.genre } : {}),
    ...(meta.lang ? { lang: meta.lang } : {}),
  };
}

const LOCAL_COVER_INDEX_KEY = 'inpx_local_cover_index_v1';
const localCoverIndex = new Map<string, 'hit' | 'miss'>();
let localCoverIndexLoad: Promise<void> | null = null;

function loadLocalCoverIndex(): Promise<void> {
  if (!localCoverIndexLoad) {
    localCoverIndexLoad = (async () => {
      try {
        const { get } = await import('idb-keyval');
        const raw = await get<Record<string, 'hit' | 'miss'>>(LOCAL_COVER_INDEX_KEY);
        if (raw && typeof raw === 'object') {
          for (const [id, status] of Object.entries(raw)) {
            if (status === 'hit' || status === 'miss') localCoverIndex.set(id, status);
          }
        }
      } catch {
        /* индекс необязателен */
      }
    })();
  }
  return localCoverIndexLoad;
}

let localCoverFlush: ReturnType<typeof setTimeout> | null = null;

function rememberLocalCover(bookId: string, status: 'hit' | 'miss'): void {
  localCoverIndex.set(bookId, status);
  if (localCoverFlush) clearTimeout(localCoverFlush);
  localCoverFlush = setTimeout(() => {
    localCoverFlush = null;
    const snapshot: Record<string, 'hit' | 'miss'> = {};
    for (const [id, value] of localCoverIndex) snapshot[id] = value;
    void import('idb-keyval').then(({ set }) => set(LOCAL_COVER_INDEX_KEY, snapshot)).catch(() => {});
  }, 400);
}

function normPath(value: string): string {
  return value.replace(/\\/g, '/').normalize('NFC');
}

function baseName(value: string): string {
  const path = normPath(value);
  return (path.split('/').pop() || path).toLocaleLowerCase('ru');
}

function fileHasBookIdKey(fileName: string, bookId: string): boolean {
  const key = safeBookIdFileKey(bookId).toLowerCase();
  return key.length >= 4 && fileName.toLowerCase().includes(`.${key}.`);
}

function isCatalogBook(book: Book): boolean {
  return Boolean(book.id) && !book.id.startsWith('local:') && !book.id.startsWith('pending:');
}

function pickBook(books: Book[]): Book | undefined {
  if (books.length === 1) return books[0];
  const server = books.filter(isCatalogBook);
  return server.length === 1 ? server[0] : undefined;
}

function knownBookForFile(filePath: string, known: Book[], folderUri: string): Book | undefined {
  const norm = normPath(filePath);
  const fileBase = baseName(norm);
  const pathOf = (book: Book) => normPath(book.localFileName || '');
  const inFolder = (book: Book) => !book.storageUri || sameLibraryFolder(book.storageUri, folderUri);

  const exact = known.filter((book) => pathOf(book) === norm && inFolder(book));
  const exactHit = pickBook(exact);
  if (exactHit) return exactHit;

  const byName = known.filter((book) => {
    const local = pathOf(book);
    return !!local && baseName(local) === fileBase;
  });
  const nameHit = pickBook(byName);
  if (nameHit) return nameHit;

  const byId = known.filter((book) => isCatalogBook(book) && fileHasBookIdKey(fileBase, book.id));
  return byId.length === 1 ? byId[0] : undefined;
}

function bookIdFor(folderId: string, filePath: string, known: Book[], folderUri: string): string {
  return knownBookForFile(filePath, known, folderUri)?.id || `pending:${folderId}:${filePath}`;
}

export default function LocalFolderBrowser({
  storageDirectory,
  serverConfig,
  viewMode,
  onChangeViewMode,
  downloadedBookIds,
  libraryBooks = [],
  readingProgressByBookId,
  readIds,
  onOpenBook,
  onRegisterBook,
}: {
  storageDirectory: StorageDirectory | null;
  serverConfig: ServerConfig;
  viewMode: CatalogViewMode;
  onChangeViewMode: (mode: CatalogViewMode) => void;
  downloadedBookIds: string[];
  libraryBooks?: Book[];
  readingProgressByBookId: Record<string, number>;
  readIds?: Set<string>;
  onOpenBook: (book: Book) => void;
  onRegisterBook?: (book: Book) => void;
}) {
  const [, setFolderListTick] = React.useState(0);
  const set = readLibraryFolders(storageDirectory);
  const [folder, setFolder] = React.useState<LibraryFolder | null>(null);
  const [trail, setTrail] = React.useState<{ name: string; path: string }[]>([]);
  const [entries, setEntries] = React.useState<DirEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [known, setKnown] = React.useState<Book[]>([]);
  const [knownReady, setKnownReady] = React.useState(false);
  const [fileMeta, setFileMeta] = React.useState<Record<string, LocalFileMeta>>({});
  const [pending, setPending] = React.useState(false);
  const path = trail.length ? trail[trail.length - 1].path : '';
  const inside = Boolean(folder);
  const savedBooks = React.useMemo(() => {
    const map = new Map<string, Book>();
    for (const book of known) map.set(book.id, book);
    for (const book of libraryBooks) map.set(book.id, book);
    return [...map.values()];
  }, [known, libraryBooks]);
  const savedBooksRef = React.useRef(savedBooks);
  savedBooksRef.current = savedBooks;

  useOverlayBackHandler(inside, () => {
    if (trail.length) setTrail((prev) => prev.slice(0, -1));
    else setFolder(null);
  });

  React.useEffect(() => {
    const refresh = () => setFolderListTick((n) => n + 1);
    window.addEventListener('inpx-settings', refresh);
    return () => window.removeEventListener('inpx-settings', refresh);
  }, []);

  React.useEffect(() => {
    if (set.hideDefaultInLocal && folder?.id === set.defaultId) {
      setFolder(null);
      setTrail([]);
    }
  }, [set.hideDefaultInLocal, set.defaultId, folder?.id]);

  React.useEffect(() => {
    let cancelled = false;
    setKnownReady(false);
    void getAllBooks()
      .then((rows) => {
        if (cancelled) return;
        setKnown(rows);
        setKnownReady(true);
      })
      .catch(() => {
        if (!cancelled) setKnownReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [folder, path]);

  React.useEffect(() => {
    if (!folder) return;
    let cancelled = false;
    setError(null);
    const key = dirListKey(folder.uri, path);
    const remembered = dirListMem.get(key);
    let waitTimer = 0;
    if (remembered?.length) {
      setEntries(remembered);
      setPending(false);
      setLoading(false);
    } else {
      setEntries([]);
      setPending(true);
      waitTimer = window.setTimeout(() => {
        if (!cancelled) setLoading(true);
      }, 200);
    }
    const apply = (rows: DirEntry[]) => {
      if (cancelled) return;
      if (waitTimer) window.clearTimeout(waitTimer);
      dirListMem.set(key, rows);
      setEntries((prev) => (sameDirList(prev, rows) ? prev : rows));
      setPending(false);
      setLoading(false);
    };
    const sorted = (res: { entries?: DirEntry[] }) => {
      const rows = Array.isArray(res?.entries) ? res.entries : [];
      return rows.filter((row) => row?.name && row?.path).sort((a, b) => {
        if (Boolean(a.directory) !== Boolean(b.directory)) return a.directory ? -1 : 1;
        return naturalNameCompare(a.name, b.name);
      });
    };
    void (async () => {
      let shown = Boolean(remembered?.length);
      try {
        const first = await BookStorage.listDirectory({ treeUri: folder.uri, path });
        if (cancelled) return;
        const rows = sorted(first);
        if (rows.length || !first.stale) {
          apply(rows);
          shown = true;
        }
        if (!first.stale) return;
        const fresh = await BookStorage.listDirectory({ treeUri: folder.uri, path, refresh: true });
        if (!cancelled) apply(sorted(fresh));
      } catch (err: unknown) {
        if (!cancelled) {
          if (waitTimer) window.clearTimeout(waitTimer);
          setPending(false);
          setLoading(false);
          if (!shown) setError(err instanceof Error ? err.message : 'Не удалось открыть папку');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (waitTimer) window.clearTimeout(waitTimer);
    };
  }, [folder, path]);

  React.useEffect(() => {
    const files = entries.filter((entry) => !entry.directory);
    if (!folder?.uri || !files.length || !knownReady) return;
    let cancelled = false;
    const folderUri = folder.uri;
    const folderId = folder.id;
    const label = folder.label;
    void (async () => {
      await loadLocalCoverIndex();
      let cursor = 0;
      const worker = async () => {
        while (!cancelled) {
          const file = files[cursor++];
          if (!file) return;
          const id = bookIdFor(folderId, file.path, savedBooksRef.current, folderUri);
          const remembered = localCoverIndex.get(id);
          if (remembered === 'hit' || remembered === 'miss') continue;
          if (await hasStoredCover(id)) {
            rememberLocalCover(id, 'hit');
            continue;
          }
          try {
            const { data } = await BookStorage.extractBookCover({ treeUri: folderUri, path: file.path });
            if (cancelled) return;
            if (data) {
              await saveCoverToDirectory({ uri: folderUri, label }, id, coverBlob(data), 'thumb');
              rememberLocalCover(id, 'hit');
              window.dispatchEvent(new CustomEvent('inpx-local-cover', { detail: id }));
            } else {
              rememberLocalCover(id, 'miss');
            }
          } catch {
            rememberLocalCover(id, 'miss');
          }
        }
      };
      await worker();
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, folder, known, knownReady]);

  React.useEffect(() => {
    const files = entries.filter((entry) => !entry.directory);
    if (!folder?.uri || !files.length || !knownReady) return;
    let cancelled = false;
    const folderUri = folder.uri;
    void (async () => {
      await loadLocalMetaIndex();
      if (cancelled) return;
      const cached: Record<string, LocalFileMeta> = {};
      for (const file of files) {
        const key = localMetaKey(folderUri, file.path);
        const hit = localMetaIndex.get(key);
        if (hit) cached[key] = hit;
      }
      if (Object.keys(cached).length) {
        setFileMeta((prev) => ({ ...cached, ...prev }));
      }
      for (const file of files) {
        if (cancelled) return;
        const key = localMetaKey(folderUri, file.path);
        if (localMetaIndex.has(key)) continue;
        let meta: LocalFileMeta = { title: '', author: '', series: '', seriesNo: '', lang: '', genre: '' };
        try {
          const raw = await BookStorage.extractBookMeta({ treeUri: folderUri, path: file.path });
          meta = {
            title: String(raw?.title || '').trim(),
            author: String(raw?.author || '').trim(),
            series: String(raw?.series || '').trim(),
            seriesNo: String(raw?.seriesNo || '').trim(),
            lang: String(raw?.lang || '').trim(),
            genre: String(raw?.genre || '').trim(),
          };
        } catch {
          meta = { title: '', author: '', series: '', seriesNo: '', lang: '', genre: '' };
        }
        if (cancelled) return;
        rememberLocalMeta(key, meta);
        setFileMeta((prev) => ({ ...prev, [key]: meta }));
        const saved = knownBookForFile(file.path, savedBooksRef.current, folderUri);
        if (!saved || isCatalogBook(saved) || (!meta.title && !meta.author && !meta.series)) continue;
        const updated = applyLocalFileMeta(saved, meta, file.name);
        if (updated.title === saved.title && updated.author === saved.author && updated.series === saved.series) continue;
        await upsertBook(updated);
        if (cancelled) return;
        setKnown((prev) => [...prev.filter((book) => book.id !== updated.id), updated]);
        onRegisterBook?.(updated);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, folder, knownReady, onRegisterBook]);

  const dirs = entries.filter((e) => e.directory);
  const books: Book[] = entries.filter((entry) => !entry.directory).map((file) => {
    const saved = folder?.uri ? knownBookForFile(file.path, savedBooks, folder.uri) : undefined;
    const parent = file.path.split('/').slice(0, -1).pop() || folder?.label || '';
    const base: Book = saved ?? {
      id: `pending:${folder?.id}:${file.path}`,
      title: titleFromFile(file.name),
      author: parent,
      ext: extFromLocalName(file.name),
      localFileName: file.path,
      storageUri: folder?.uri,
    };
    const meta = folder?.uri
      ? fileMeta[localMetaKey(folder.uri, file.path)] ?? localMetaIndex.get(localMetaKey(folder.uri, file.path))
      : undefined;
    return applyLocalFileMeta(base, meta, file.name);
  });

  const openFile = async (book: Book) => {
    if (!folder?.uri || !book.localFileName) return;
    const matched = knownBookForFile(book.localFileName, savedBooksRef.current, folder.uri);
    if (matched && isCatalogBook(matched)) {
      onOpenBook(matched);
      return;
    }
    if (!book.id.startsWith('pending:')) {
      const saved = matched || book;
      onRegisterBook?.(saved);
      onOpenBook(saved);
      return;
    }
    try {
      const info = await BookStorage.getStorageFileInfo({ treeUri: folder.uri, path: book.localFileName });
      const digest = String(info?.digestSha256 || '').toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Не удалось опознать файл');
      const saved: Book = { ...book, id: `local:${digest}` };
      await upsertBook(saved);
      setKnown((prev) => [...prev.filter((b) => b.id !== saved.id), saved]);
      onRegisterBook?.(saved);
      onOpenBook(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть книгу');
    }
  };

  const hideDefault = (current = set) => {
    const next = setHideDefaultInLocal(current, true);
    setFolderListTick((n) => n + 1);
    window.dispatchEvent(new Event('inpx-settings'));
    return next;
  };

  if (!inside) {
    const def = defaultLibraryFolder(set);
    const roots = set.folders.filter((item) => !(set.hideDefaultInLocal && item.id === def.id));
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-end">
          <ViewModeToggle value={viewMode} onChange={onChangeViewMode} />
        </div>
        {roots.length ? (
          <FolderCells
            viewMode={viewMode}
            items={roots.map((item) => ({
              key: item.id,
              label: item.label,
              hint: item.id === def.id ? 'Папка по умолчанию' : undefined,
              onHide: item.id === def.id ? () => { hideDefault(); } : undefined,
              onClick: () => {
                setFolder(item);
                setTrail([]);
              },
            }))}
          />
        ) : (
          <EmptyState
            icon={Folder}
            title="Папки скрыты"
            description="Папка по умолчанию скрыта. Вернуть её можно в Профиле, в разделе «Хранилище»."
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (trail.length) setTrail((prev) => prev.slice(0, -1));
            else setFolder(null);
          }}
          className={`${touchMin} inline-flex items-center justify-center ${radii.button} ${theme.focusRing}`}
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <p className={`min-w-0 flex-1 truncate ${textStyles.bodyBold} ${theme.text}`}>
          {trail.length ? trail[trail.length - 1].name : folder.label}
        </p>
        <ViewModeToggle value={viewMode} onChange={onChangeViewMode} />
      </div>
      {error ? <p className={`${textStyles.caption} text-[var(--app-danger)]`}>{error}</p> : null}
      {dirs.length > 0 ? (
        <FolderCells
          viewMode={viewMode}
          items={dirs.map((dir) => ({
            key: dir.path,
            label: dir.name,
            onClick: () => setTrail((prev) => [...prev, { name: dir.name, path: dir.path }]),
          }))}
        />
      ) : null}
      {loading ? (
        <p className={`${textStyles.caption} ${theme.textMuted}`}>Открываем папку…</p>
      ) : null}
      {!pending && !loading && !dirs.length && !books.length ? (
        <EmptyState icon={Folder} title="Папка пуста" description="Нет подпапок и книг fb2, epub, pdf, txt или zip." />
      ) : null}
      {books.length > 0 ? (
        <CatalogBookList
          books={books}
          viewMode={viewMode}
          serverConfig={serverConfig}
          storageDirectory={folder}
          downloadedBookIds={downloadedBookIds}
          readingProgressByBookId={readingProgressByBookId}
          readIds={readIds}
          showFileExt
          onBookClick={(book) => void openFile(book)}
          virtualizeList={false}
        />
      ) : null}
    </div>
  );
}
