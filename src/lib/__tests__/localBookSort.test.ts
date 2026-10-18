import { describe, it, expect } from 'vitest';
import { sortBooksLocal } from '../localBookSort';
import type { Book } from '../../types';

const books: Book[] = [
  { id: '1', title: 'Вторая', author: 'Борисов', ext: 'fb2', series: 'Цикл', seriesNo: 2, rating: 3 },
  { id: '2', title: 'Альфа', author: 'Яковлев', ext: 'fb2', rating: 5 },
  { id: '3', title: 'Первая', author: 'Борисов', ext: 'fb2', series: 'Цикл', seriesNo: 1 },
];

const ids = (list: Book[]) => list.map((b) => b.id);

describe('sortBooksLocal', () => {
  it('keeps server order for recent', () => {
    expect(ids(sortBooksLocal(books, 'recent'))).toEqual(['1', '2', '3']);
  });

  it('sorts by title, author, volume and rating', () => {
    expect(ids(sortBooksLocal(books, 'title'))).toEqual(['2', '1', '3']);
    expect(ids(sortBooksLocal(books, 'author'))).toEqual(['1', '3', '2']);
    expect(ids(sortBooksLocal(books, 'volume'))).toEqual(['3', '1', '2']);
    expect(ids(sortBooksLocal(books, 'rating'))).toEqual(['2', '1', '3']);
  });
});
