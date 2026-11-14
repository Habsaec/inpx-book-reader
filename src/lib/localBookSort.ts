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

/** A section of «Скачанные»: an author, or a series of an author's books. */
export interface LocalBookGroup {
  key: string;
  label: string;
  books: Book[];
}

/** One name per person: `authors` when the book has them, else the joined line split on commas. */
export function bookAuthorNames(book: Book): string[] {
  const list = (book.authors?.length ? book.authors : (book.author || '').split(','))
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

function sortGroups(groups: LocalBookGroup[]): LocalBookGroup[] {
  return groups.sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1;
    return a.label.localeCompare(b.label, 'ru');
  });
}

function byVolume(a: Book, b: Book): number {
  return seriesVolumeSortKey(a) - seriesVolumeSortKey(b) || a.title.localeCompare(b.title, 'ru');
}

/**
 * «Скачанные» like the catalog: one entry per author (a co-written book is listed under each
 * of its authors), sorted by name, «Неизвестный автор» last.
 */
export function groupBooksByAuthor(books: Book[]): LocalBookGroup[] {
  const map = new Map<string, LocalBookGroup>();
  for (const book of books) {
    const names = bookAuthorNames(book);
    for (const name of names.length ? names : ['']) {
      const key = name.toLocaleLowerCase('ru');
      let group = map.get(key);
      if (!group) {
        group = { key, label: name || t('common.unknownAuthor'), books: [] };
        map.set(key, group);
      }
      group.books.push(book);
    }
  }
  return sortGroups([...map.values()]);
}

/** An author's books by series (volume order), books outside a series in a last «Вне серий» section. */
export function groupBooksBySeries(books: Book[]): LocalBookGroup[] {
  const map = new Map<string, LocalBookGroup>();
  for (const book of books) {
    const name = (book.seriesDisplay || book.series || '').trim();
    const key = name.toLocaleLowerCase('ru');
    let group = map.get(key);
    if (!group) {
      group = { key, label: name || t('common.outsideSeries'), books: [] };
      map.set(key, group);
    }
    group.books.push(book);
  }
  const groups = sortGroups([...map.values()]);
  for (const group of groups) group.books.sort(byVolume);
  return groups;
}
