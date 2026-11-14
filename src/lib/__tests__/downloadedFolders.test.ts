import { describe, expect, it } from 'vitest';
import type { Book } from '../../types';
import { downloadedFolderView, existingDownloadedPath } from '../downloadedFolders';

const b = (id: string, localFileName?: string): Book => ({ id, title: `T${id}`, author: '', ext: 'fb2', localFileName });

describe('downloadedFolders', () => {
  const books = [
    b('1', 'Щепетнов Евгений/Нед/10-Десятая.8_10.fb2'),
    b('2', 'Щепетнов Евгений/Нед/2-Вторая.8_2.fb2'),
    b('3', 'Щепетнов Евгений/Без серии/Книга.8_3.fb2'),
    b('4', 'Винокуров Юрий, Сапфир Олег/Кодекс Охотника/5-Кодекс.8_5.fb2'),
    b('5', 'Отдельно.8_6.epub'),
    b('6'),
  ];

  it('lists the top level: folders with book counts, loose books', () => {
    const view = downloadedFolderView(books, []);
    expect(view.folders).toEqual([
      { name: 'Винокуров Юрий, Сапфир Олег', count: 1 },
      { name: 'Щепетнов Евгений', count: 3 },
    ]);
    expect(view.books.map((x) => x.id)).toEqual(['5', '6']);
  });

  it('opens a folder; files keep the natural volume order', () => {
    expect(downloadedFolderView(books, ['Щепетнов Евгений']).folders.map((f) => f.name)).toEqual(['Без серии', 'Нед']);
    expect(downloadedFolderView(books, ['Щепетнов Евгений', 'Нед']).books.map((x) => x.id)).toEqual(['2', '1']);
  });

  it('falls back to the nearest folder that still has books', () => {
    expect(existingDownloadedPath(books, ['Щепетнов Евгений', 'Пропала'])).toEqual(['Щепетнов Евгений']);
    expect(existingDownloadedPath([], ['A', 'B'])).toEqual([]);
  });
});
