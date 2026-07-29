import React from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import type { LocalReaderBookmarkItem } from '../../lib/offlineReaderStore';
import type { Book, ServerConfig } from '../../types';
import { bookContentUrl, displayCoverUrl } from '../../lib/inpxClient';
import EmptyState from '../../ui/EmptyState';
import { textStyles, touchMin } from '../../ui/tokens';

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
  onOpenBookmark: (bookId: string, position: string, book: Book) => void;
  onRemoveBookmark?: (bookId: string, bmId: number) => void | Promise<void>;
}

export default function ReaderBookmarksPanel({
  bookmarks,
  serverConfig,
  onOpenBookmark,
  onRemoveBookmark,
}: ReaderBookmarksPanelProps) {
  const [bookFilter, setBookFilter] = React.useState<string | 'all'>('all');

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
      <EmptyState
        icon={Bookmark}
        title="Нет закладок"
        description="Откройте книгу и добавьте закладку — она появится здесь."
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {bookOptions.length > 1 && (
        <div className={`px-4 py-2 shrink-0 border-b ${theme.header}`}>
          <select
            className={`w-full rounded-xl px-3 py-2 ${textStyles.body} ${theme.chip} ${theme.text} ${theme.focusRing}`}
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
      <ul className="flex-1 min-h-0 overflow-y-auto m-0 p-0 list-none">
        {filtered.map((bm) => (
          <li key={`${bm.bookId}-${bm.id}`} className={`border-b ${theme.divider}`}>
            <div className="flex items-stretch gap-1">
              <button
                type="button"
                className={`flex-1 min-w-0 text-left px-4 py-3 ${theme.focusRing}`}
                onClick={() => onOpenBookmark(bm.bookId, bm.position, bookmarkToBook(bm, serverConfig))}
              >
                <p className={`m-0 ${textStyles.caption} ${theme.textMuted} truncate`}>{bm.bookTitle}</p>
                <p className={`m-0 mt-0.5 ${textStyles.bodyBold} line-clamp-2`}>{bm.label}</p>
              </button>
              {onRemoveBookmark && (
                <button
                  type="button"
                  aria-label="Удалить закладку"
                  className={`${touchMin} shrink-0 self-center mr-2 inline-flex items-center justify-center rounded-xl ${theme.textMuted} ${theme.focusRing}`}
                  onClick={() => void onRemoveBookmark(bm.bookId, bm.id)}
                >
                  <Trash2 className="w-4 h-4" aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
