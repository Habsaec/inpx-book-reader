import type { Book } from '../types';
import { seriesVolumeSortKey } from './seriesVolumeSort';

/** `recent` keeps the incoming order (server lists are newest-first). */
export type LocalBookSort = 'recent' | 'title' | 'author' | 'volume' | 'rating';

export const LOCAL_BOOK_SORT_OPTIONS: Array<{ id: LocalBookSort; label: string }> = [
  { id: 'recent', label: 'Недавние' },
  { id: 'title', label: 'Название' },
  { id: 'author', label: 'Автор' },
  { id: 'volume', label: 'Номер тома' },
  { id: 'rating', label: 'Рейтинг' },
];

export function sortBooksLocal(books: Book[], sort: LocalBookSort): Book[] {
  if (sort === 'recent') return books;
  const list = [...books];
  const byTitle = (a: Book, b: Book) => a.title.localeCompare(b.title, 'ru');
  if (sort === 'title') {
    list.sort(byTitle);
  } else if (sort === 'author') {
    list.sort((a, b) => (a.author || '').localeCompare(b.author || '', 'ru') || byTitle(a, b));
  } else if (sort === 'volume') {
    list.sort((a, b) => {
      const sa = (a.series || '').trim();
      const sb = (b.series || '').trim();
      if (!sa !== !sb) return sa ? -1 : 1;
      return sa.localeCompare(sb, 'ru') || seriesVolumeSortKey(a) - seriesVolumeSortKey(b) || byTitle(a, b);
    });
  } else {
    list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || byTitle(a, b));
  }
  return list;
}
