import { describe, expect, it } from 'vitest';
import { authorInitials } from '../AuthorPortrait';

describe('authorInitials', () => {
  it('uses the name first, then the surname', () => {
    expect(authorInitials('достоевский,фёдор,михайлович')).toBe('ФД');
    expect(authorInitials('Pushkin,Alexander')).toBe('AP');
    expect(authorInitials('Лев Толстой')).toBe('ЛТ');
  });
  it('handles single words, empty input and several authors', () => {
    expect(authorInitials('Гомер')).toBe('ГО');
    expect(authorInitials('  ')).toBe('?');
    expect(authorInitials('Иванов,Иван:Петров,Пётр')).toBe('ИИ');
  });
});
