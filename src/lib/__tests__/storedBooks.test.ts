import { describe, expect, it } from 'vitest';
import { bookIdFromFileKey, parseStoredBookPath, pickStoredBooks } from '../storedBooks';
import { encodeBookRef } from '../bookRef';

describe('storedBooks', () => {
  it('turns a file key back into the book id', () => {
    expect(bookIdFromFileKey('8_701371')).toBe('8:701371');
    expect(bookIdFromFileKey(`b64_${encodeBookRef('8:742370\u0000fb2-742060-743418.7z\u0000742370\u0000fb2')}`))
      .toBe('8:742370\u0000fb2-742060-743418.7z\u0000742370\u0000fb2');
    expect(bookIdFromFileKey('0123456789abcdef0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
    expect(bookIdFromFileKey('Путь')).toBeNull();
    expect(bookIdFromFileKey('')).toBeNull();
  });

  it('reads author, series, number, title, id and ext from a stored path (real names from a Go 7)', () => {
    expect(parseStoredBookPath('Винокуров Юрий, Сапфир Олег/Кодекс Охотника/5-Кодекс Охотника _05.8_703519.fb2')).toEqual({
      id: '8:703519',
      title: 'Кодекс Охотника _05',
      author: 'Винокуров Юрий, Сапфир Олег',
      series: 'Кодекс Охотника',
      seriesNo: 5,
      ext: 'fb2',
      localFileName: 'Винокуров Юрий, Сапфир Олег/Кодекс Охотника/5-Кодекс Охотника _05.8_703519.fb2',
      duplicate: false,
    });
    const dup = parseStoredBookPath('Щепетнов Евгений Владимирович/Нед/1-Путь Найденыша.9_357207 (2).epub');
    expect(dup).toMatchObject({ id: '9:357207', title: 'Путь Найденыша', ext: 'epub', duplicate: true });
    expect(parseStoredBookPath('Автор/Без серии/Книга. Часть 2.8_1.fb2.zip')).toMatchObject({
      id: '8:1',
      title: 'Книга. Часть 2',
      ext: 'fb2',
    });
    expect(parseStoredBookPath('Автор/Без серии/Книга.8_1.fb2')?.series).toBeUndefined();
    // Outside a series a leading «N-» belongs to the title, it is not a volume number.
    expect(parseStoredBookPath('Автор/Без серии/13-й воин.8_1.fb2')).toMatchObject({ title: '13-й воин' });
    expect(parseStoredBookPath('Кинг Стивен/Без серии/11-22-63.8_2.epub')).toMatchObject({ title: '11-22-63' });
    expect(parseStoredBookPath('Автор/Без серии/13-й воин.8_1.fb2')?.seriesNo).toBeUndefined();
    // A file another reader put into the folder: no id in the name → not ours.
    expect(parseStoredBookPath('Толстой/Война и мир.fb2')).toBeNull();
  });

  it('keeps the original over its «(N)» copies and skips books the app knows', () => {
    const paths = [
      'A/S/1-T.9_357207 (1).epub',
      'A/S/1-T.9_357207.epub',
      'A/S/1-T.9_357207 (2).epub',
      'A/S/2-U.8_2.fb2',
      'A/S/3-V.8_3 (1).fb2',
    ];
    const picked = pickStoredBooks(paths, [{ id: '8:2', localFileName: '' }]);
    expect(picked.map((b) => [b.id, b.localFileName])).toEqual([
      ['9:357207', 'A/S/1-T.9_357207.epub'],
      ['8:3', 'A/S/3-V.8_3 (1).fb2'],
    ]);
  });
});
