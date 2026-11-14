import type { Book } from '../types';
import { seriesVolumeSortKey } from './seriesVolumeSort';
import { t } from '../i18n';

/** `recent` keeps the incoming order (server lists are newest-first). */
export type LocalBookSort = 'recent' | 'title' | 'author' | 'volume' | 'rating';

export const LOCAL_BOOK_SORT_OPTIONS: Array<{ id: LocalBookSort; label: string }> = [
  { id: 'recent', label: t('localBookSort.byDateAdded') },
  { id: 'title', label: t('common.title') },
  { id: 'author', label: t('common.author') },
  { id: 'volume', label: t('common.volumeNumber') },
  { id: 'rating', label: t('common.rating') },
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

function normalizeForSearch(value: string): string {
  return value.toLocaleLowerCase('ru').replace(/ё/g, 'е');
}

/** «Мои книги» filter: every word of the query must appear in the title, author or series. */
export function filterBooksLocal(books: Book[], query: string): Book[] {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return books;
  return books.filter((book) => {
    const haystack = normalizeForSearch(
      [book.title, book.author, book.seriesDisplay, book.series].filter(Boolean).join(' '),
    );
    return words.every((word) => haystack.includes(word));
  });
}

/** «Скачанные» grouping: one flat list, a section per author, or a section per series. */
export type LocalBookGrouping = 'none' | 'author' | 'series';

export interface LocalBookGroup {
  key: string;
  label: string;
  books: Book[];
}

function bySeriesVolume(a: Book, b: Book): number {
  const sa = (a.seriesDisplay || a.series || '').trim();
  const sb = (b.seriesDisplay || b.series || '').trim();
  if (!sa !== !sb) return sa ? -1 : 1;
  return sa.localeCompare(sb, 'ru') || seriesVolumeSortKey(a) - seriesVolumeSortKey(b) || a.title.localeCompare(b.title, 'ru');
}

/**
 * Sections for «Скачанные». Authors: the book's author line as written (co-authors stay one group,
 * so a book is never listed twice), books by series and volume inside. Series: books by volume,
 * books outside a series in one last section. Sections are sorted by name; the unnamed one goes last.
 */
export function groupBooksLocal(books: Book[], grouping: LocalBookGrouping): LocalBookGroup[] {
  if (grouping === 'none') return [{ key: '', label: '', books }];
  const map = new Map<string, LocalBookGroup>();
  const fallback = grouping === 'author' ? t('common.unknownAuthor') : t('common.noSeries');
  for (const book of books) {
    const raw = grouping === 'author' ? (book.author || '').trim() : (book.seriesDisplay || book.series || '').trim();
    const key = raw.toLocaleLowerCase('ru');
    let group = map.get(key);
    if (!group) {
      group = { key, label: raw || fallback, books: [] };
      map.set(key, group);
    }
    group.books.push(book);
  }
  const groups = [...map.values()];
  for (const group of groups) group.books.sort(bySeriesVolume);
  groups.sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1;
    return a.label.localeCompare(b.label, 'ru');
  });
  return groups;
}
