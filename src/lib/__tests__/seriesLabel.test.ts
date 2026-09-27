import { describe, expect, it } from 'vitest';
import { bookTitleWithoutVolume, displayBookTitle, seriesLabel } from '../seriesLabel';

describe('seriesLabel', () => {
  it('prefers seriesDisplay over the lookup key', () => {
    expect(seriesLabel({ series: 'кодекс охотника', seriesDisplay: 'Кодекс охотника' })).toBe('Кодекс охотника');
  });

  it('capitalizes a stored lowercase key when display is missing', () => {
    expect(seriesLabel({ series: 'кодекс охотника' })).toBe('Кодекс охотника');
  });

  it('returns empty string without a series', () => {
    expect(seriesLabel({})).toBe('');
  });
});

describe('displayBookTitle', () => {
  it('prefixes the volume without changing the stored title', () => {
    expect(displayBookTitle({ title: 'Кодекс Охотника', seriesNo: 17 })).toBe('17. Кодекс Охотника');
  });

  it('prefers a non-numeric volume label', () => {
    expect(displayBookTitle({ title: 'Сборник', seriesNoLabel: '1-2', seriesNo: 1 })).toBe('1-2. Сборник');
  });

  it('leaves a book without a volume unchanged', () => {
    expect(displayBookTitle({ title: 'Отдельная книга' })).toBe('Отдельная книга');
  });

  it('accepts a volume stored as text', () => {
    expect(displayBookTitle({ title: 'Кодекс Охотника', seriesNo: '17' })).toBe('17. Кодекс Охотника');
  });

  it('drops a trailing #volume that repeats the series number', () => {
    expect(displayBookTitle({ title: 'Кодекс Охотника #39', seriesNo: 39 })).toBe('39. Кодекс Охотника');
  });

  it('keeps a different #number in the title', () => {
    expect(displayBookTitle({ title: 'Кодекс Охотника #40', seriesNo: 39 })).toBe('39. Кодекс Охотника #40');
  });

  it('keeps #volume when the book has no series number', () => {
    expect(displayBookTitle({ title: 'Кодекс Охотника #39' })).toBe('Кодекс Охотника #39');
  });
});

describe('bookTitleWithoutVolume', () => {
  it('drops a trailing hash that repeats the volume', () => {
    expect(bookTitleWithoutVolume({ title: 'Сделка #2', seriesNo: 2 })).toBe('Сделка');
  });

  it('returns the title when there is no volume', () => {
    expect(bookTitleWithoutVolume({ title: 'Сделка' })).toBe('Сделка');
  });
});
