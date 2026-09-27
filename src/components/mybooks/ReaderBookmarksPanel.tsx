import React from 'react';
import { Trash2 } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import type { LocalReaderBookmarkItem } from '../../lib/offlineReaderStore';
import type { Book, ServerConfig } from '../../types';
import { bookContentUrl, displayCoverUrl } from '../../lib/inpxClient';
import { useBarHeight } from '../../ui/useBarHeight';
import { textStyles, touchMin, semantic, radii, motion, elevation } from '../../ui/tokens';

function bookmarkToBook(bm: LocalReaderBookmarkItem, config: ServerConfig): Book {
  const ext = (bm.ext || 'fb2').replace(/^\./, '');
  return {
    id: bm.bookId,
    title: bm.bookTitle,
    author: '',
    ext,
    contentUrl: bookContentUrl(config, bm.bookId),
    coverUrl: displayCoverUrl(config, bm.bookId),
  };
}

interface ReaderBookmarksPanelProps {
  bookmarks: LocalReaderBookmarkItem[];
  serverConfig: ServerConfig;
  downloadedBookIds?: string[];
  onOpenBookmark: (bookId: string, position: string, book: Book) => void;
  onRemoveBookmark?: (bookId: string, bmId: number) => void | Promise<void>;
  onRenameBookmark?: (bookId: string, bmId: number, title: string) => void | Promise<void>;
  onGoBack?: () => void;
}

export default function ReaderBookmarksPanel({
  bookmarks,
  serverConfig,
  downloadedBookIds,
  onOpenBookmark,
  onRemoveBookmark,
  onRenameBookmark,
}: ReaderBookmarksPanelProps) {
  const [bookFilter, setBookFilter] = React.useState<string | 'all'>('all');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [setToolEl, toolH] = useBarHeight();

  const bookOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const bm of bookmarks) map.set(bm.bookId, bm.bookTitle);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [bookmarks]);

  const filtered = React.useMemo(() => {
    if (bookFilter === 'all') return bookmarks;
    return bookmarks.filter((b) => b.bookId === bookFilter);
  }, [bookmarks, bookFilter]);

  if (!bookmarks.length) {
    return (
      <div className="flex-1 overflow-y-auto inpx-page-scroll px-5">
        <p className={`${textStyles.body} ${theme.textMuted}`}>Нет закладок. Отмечайте места в тексте во время чтения.</p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0" style={{ ['--inpx-tool' as string]: `${toolH}px` }}>
      <ul className="absolute inset-0 overflow-y-auto inpx-page-scroll px-5 py-3 space-y-3">
        {filtered.map((bm) => (
          <li key={`${bm.bookId}-${bm.id}`} className={`${radii.lg} ${theme.card} ${elevation.card}`}>
            <div className="px-4 py-4">
              <button
                type="button"
                className={`w-full text-left ${theme.focusRing} ${radii.md} ${motion.press}`}
                onClick={() => onOpenBookmark(bm.bookId, bm.position, bookmarkToBook(bm, serverConfig))}
              >
                <p className={`m-0 ${textStyles.caption} ${theme.textMuted} truncate`}>{bm.bookTitle}</p>
              </button>
              {editingId === `${bm.bookId}-${bm.id}` ? (
                <form
                  className="mt-2 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const next = editTitle.trim();
                    if (!next || !onRenameBookmark) return;
                    void onRenameBookmark(bm.bookId, bm.id, next);
                    setEditingId(null);
                  }}
                >
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    aria-label="Название закладки"
                    placeholder="Название закладки"
                    className={`w-full min-h-11 px-3 ${radii.button} ${textStyles.body} ${theme.input} ${theme.inputFocus}`}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className={`min-h-11 px-4 ${radii.button} ${textStyles.captionBold} ${theme.accentBg} ${theme.focusRing} ${motion.press}`}
                    >
                      Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className={`min-h-11 px-4 ${radii.button} ${textStyles.caption} ${theme.chip} ${theme.focusRing} ${motion.press}`}
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              ) : onRenameBookmark ? (
                <button
                  type="button"
                  className={`mt-1 w-full text-left ${theme.focusRing} ${radii.md} ${motion.press}`}
                  onClick={() => {
                    setEditingId(`${bm.bookId}-${bm.id}`);
                    setEditTitle(bm.label === 'Закладка' ? '' : bm.label);
                  }}
                >
                  <p className={`m-0 ${textStyles.bodyBold} line-clamp-2`}>
                    {bm.label === 'Закладка' ? 'Добавить название' : bm.label}
                  </p>
                </button>
              ) : (
                <p className={`m-0 mt-1 ${textStyles.bodyBold} line-clamp-2`}>{bm.label}</p>
              )}
              {downloadedBookIds && !downloadedBookIds.includes(bm.bookId) ? (
                <p className={`m-0 mt-1 ${textStyles.caption} ${theme.textMuted}`}>Не скачана</p>
              ) : null}
              {onRemoveBookmark && editingId !== `${bm.bookId}-${bm.id}` ? (
                <button
                  type="button"
                  aria-label="Удалить закладку"
                  className={`${touchMin} mt-1 inline-flex items-center justify-center ${radii.button} ${semantic.error} ${theme.focusRing} ${motion.press}`}
                  onClick={() => void onRemoveBookmark(bm.bookId, bm.id)}
                >
                  <Trash2 className="w-4 h-4" aria-hidden />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {bookOptions.length > 1 && (
        <div
          ref={setToolEl}
          className="inpx-chrome inpx-chrome-top absolute inset-x-0 z-10 px-5 py-1"
          style={{ top: 'calc(var(--app-header-offset, 4rem) + var(--inpx-under, 0px))' }}
        >
          <select
            className={`w-full bg-transparent ${textStyles.body} ${theme.text} ${theme.focusRing} min-h-11`}
            value={bookFilter}
            onChange={(e) => setBookFilter(e.target.value)}
            aria-label="Книга"
          >
            <option value="all">Все книги</option>
            {bookOptions.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
