import { describe, it, expect } from 'vitest';
import { resolveBookTapAction } from '../bookOpenPolicy';
import type { Book } from '../../types';

const book: Book = { id: '1:1', title: 'T', author: 'A', ext: 'fb2' };

describe('resolveBookTapAction', () => {
  it('opens details whether the book is downloaded or not', () => {
    expect(resolveBookTapAction(book, [])).toBe('details');
    expect(resolveBookTapAction(book, ['1:1'])).toBe('details');
    expect(resolveBookTapAction(book, new Set(['1:1']))).toBe('details');
  });
});
