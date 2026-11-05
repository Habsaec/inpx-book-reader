import { describe, expect, it } from 'vitest';
import { authorInitials } from '../AuthorPortrait';

describe('authorInitials', () => {
  it('keeps the written order (surname, then name)', () => {
    expect(authorInitials('головачев,василий')).toBe('ГВ');
    expect(authorInitials('лукас,дженни')).toBe('ЛД');
    expect(authorInitials('достоевский,фёдор,михайлович')).toBe('ДФ');
    expect(authorInitials('Pushkin,Alexander')).toBe('PA');
    expect(authorInitials('Лев Толстой')).toBe('ЛТ');
  });
  it('handles single words, empty input and several authors', () => {
    expect(authorInitials('Гомер')).toBe('ГО');
    expect(authorInitials('  ')).toBe('?');
    expect(authorInitials('Иванов,Иван:Петров,Пётр')).toBe('ИИ');
  });
});
