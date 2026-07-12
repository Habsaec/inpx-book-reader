import { describe, expect, it } from 'vitest';
import {
  filterAnnotationsByColor,
  filterAnnotationsByBook,
  formatAnnotationCopyText,
  exportAnnotationsMarkdown,
} from '../readerNotesUtils';
import type { LocalReaderAnnotationItem } from '../offlineReaderStore';

const sample: LocalReaderAnnotationItem[] = [
  {
    id: 1,
    bookId: 'a',
    bookTitle: 'Book A',
    text: 'Quote one',
    note: 'My note',
    cfi: 'cfi1',
    color: 'yellow',
  },
  {
    id: 2,
    bookId: 'b',
    bookTitle: 'Book B',
    text: 'Quote two',
    note: '',
    cfi: 'cfi2',
    color: 'blue',
  },
];

describe('readerNotesUtils', () => {
  it('filters by highlight color', () => {
    expect(filterAnnotationsByColor(sample, 'blue')).toHaveLength(1);
    expect(filterAnnotationsByColor(sample, 'all')).toHaveLength(2);
  });

  it('formats copy text with quote and note', () => {
    const text = formatAnnotationCopyText(sample[0]);
    expect(text).toContain('«Quote one»');
    expect(text).toContain('My note');
    expect(text).toContain('Book A');
  });

  it('exports markdown list', () => {
    const md = exportAnnotationsMarkdown(sample);
    expect(md).toContain('# Заметки');
    expect(md).toContain('> Quote one');
    expect(md).toContain('## Book B');
  });

  it('filters by book', () => {
    expect(filterAnnotationsByBook(sample, 'a')).toHaveLength(1);
  });
});
