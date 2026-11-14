import { describe, expect, it } from 'vitest';
import type { Book } from '../../types';
import { bookAuthorNames, groupBooksByAuthor, groupBooksBySeries } from '../localBookSort';

const b = (id: string, author: string, series?: string, seriesNo?: number): Book => ({
  id, title: `T${id}`, author, ext: 'fb2', ...(series ? { series } : {}), ...(seriesNo ? { seriesNo } : {}),
});

describe('Downloaded: authors → series', () => {
  const books = [
    b('1', 'Щепетнов Евгений', 'Нед', 2),
    b('2', 'Винокуров Юрий, Сапфир Олег', 'Кодекс Охотника', 5),
    b('3', 'Щепетнов Евгений', 'Нед', 1),
    b('4', 'Винокуров Юрий', 'Кодекс Охотника', 4),
    b('5', ''),
    b('6', 'Щепетнов Евгений'),
  ];

  it('splits the author line into people (authors[] first)', () => {
    expect(bookAuthorNames(books[1])).toEqual(['Винокуров Юрий', 'Сапфир Олег']);
    expect(bookAuthorNames({ ...books[1], authors: ['Винокуров Юрий'] })).toEqual(['Винокуров Юрий']);
    expect(bookAuthorNames(books[4])).toEqual([]);
  });

  it('lists a co-written book under each author, names sorted, unknown last', () => {
    expect(groupBooksByAuthor(books).map((g) => [g.label, g.books.map((x) => x.id)])).toEqual([
      ['Винокуров Юрий', ['2', '4']],
      ['Сапфир Олег', ['2']],
      ['Щепетнов Евгений', ['1', '3', '6']],
      ['Неизвестный автор', ['5']],
    ]);
  });

  it("orders an author's series by volume, books outside a series last", () => {
    const shchepetnov = groupBooksByAuthor(books).find((g) => g.label === 'Щепетнов Евгений')!;
    expect(groupBooksBySeries(shchepetnov.books).map((g) => [g.label, g.books.map((x) => x.id)])).toEqual([
      ['Нед', ['3', '1']],
      ['Вне серий', ['6']],
    ]);
  });
});
