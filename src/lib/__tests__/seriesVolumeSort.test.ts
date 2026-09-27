import { describe, expect, it } from 'vitest';
import { booksAfterInSeries, seriesPageForVolume } from '../seriesVolumeSort';
import type { Book } from '../../types';

function book(partial: Pick<Book, 'id' | 'title'> & Partial<Book>): Book {
  return { author: 'Автор', ext: 'fb2', ...partial };
}

describe('booksAfterInSeries', () => {
  const series = [
    book({ id: 'a', title: 'Первая', seriesNo: 1 }),
    book({ id: 'b', title: 'Вторая', seriesNo: 2 }),
    book({ id: 'c', title: 'Третья', seriesNo: 3 }),
  ];

  it('returns later volumes in series order', () => {
    const shelf = booksAfterInSeries(series[0], [series[2], series[0], series[1]]);
    expect(shelf.later).toBe(true);
    expect(shelf.books.map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('falls back to the rest of the series when this volume is last', () => {
    const shelf = booksAfterInSeries(series[2], series);
    expect(shelf.later).toBe(false);
    expect(shelf.books.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('keeps the nearest earlier volumes, not the start of a long series', () => {
    const items = Array.from({ length: 20 }, (_, index) => book({
      id: String(index + 1),
      title: `Том ${index + 1}`,
      seriesNo: index + 1,
    }));
    const shelf = booksAfterInSeries(items[19], items, 4);
    expect(shelf.later).toBe(false);
    expect(shelf.books.map((item) => item.seriesNo)).toEqual([16, 17, 18, 19]);
  });

  it('drops the current book and keeps unnumbered companions', () => {
    const current = book({ id: 'solo', title: 'Без номера' });
    const other = book({ id: 'other', title: 'Сосед' });
    const shelf = booksAfterInSeries(current, [current, other]);
    expect(shelf.later).toBe(false);
    expect(shelf.books.map((item) => item.id)).toEqual(['other']);
  });

  it('returns nothing when the series page is only this book', () => {
    expect(booksAfterInSeries(series[0], [series[0]])).toEqual({ later: false, books: [] });
  });
});

describe('seriesPageForVolume', () => {
  it('stays on the first page for an early volume', () => {
    expect(seriesPageForVolume(2, 24, 80)).toBe(1);
  });

  it('jumps to the page that holds a late volume', () => {
    expect(seriesPageForVolume(38, 24, 80)).toBe(2);
  });

  it('does not request a page past the end of the series', () => {
    expect(seriesPageForVolume(100, 24, 30)).toBe(2);
  });
});
