import { describe, expect, it } from 'vitest';
import type { Book } from '../../types';
import { groupBooksLocal } from '../localBookSort';

const b = (id: string, author: string, series?: string, seriesNo?: number): Book => ({
  id, title: `T${id}`, author, ext: 'fb2', ...(series ? { series } : {}), ...(seriesNo ? { seriesNo } : {}),
});

describe('groupBooksLocal', () => {
  const books = [
    b('1', 'Щепетнов Евгений', 'Нед', 2),
    b('2', 'Винокуров Юрий, Сапфир Олег', 'Кодекс Охотника', 5),
    b('3', 'Щепетнов Евгений', 'Нед', 1),
    b('4', 'Винокуров Юрий, Сапфир Олег', 'Кодекс Охотника', 4),
    b('5', '', undefined),
    b('6', 'Щепетнов Евгений'),
  ];

  it('keeps one flat section when grouping is off', () => {
    expect(groupBooksLocal(books, 'none')).toEqual([{ key: '', label: '', books }]);
  });

  it('groups by author: sorted by name, unknown last, series and volume inside', () => {
    const groups = groupBooksLocal(books, 'author');
    expect(groups.map((g) => [g.label, g.books.map((x) => x.id)])).toEqual([
      ['Винокуров Юрий, Сапфир Олег', ['4', '2']],
      ['Щепетнов Евгений', ['3', '1', '6']],
      ['Неизвестный автор', ['5']],
    ]);
  });

  it('groups by series: volume order, books outside a series last', () => {
    const groups = groupBooksLocal(books, 'series');
    expect(groups.map((g) => [g.label, g.books.map((x) => x.id)])).toEqual([
      ['Кодекс Охотника', ['4', '2']],
      ['Нед', ['3', '1']],
      ['Без серии', ['5', '6']],
    ]);
  });
});
