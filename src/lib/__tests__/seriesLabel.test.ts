import { describe, expect, it } from 'vitest';
import { bookTitleWithoutVolume, cleanFileLikeTitle, displayBookTitle, seriesLabel, volumeCaption, sameSeriesName } from '../seriesLabel';

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
  it('adds the volume after the name without changing the stored title', () => {
    expect(displayBookTitle({ title: 'Кодекс Охотника', seriesNo: 17 })).toBe('Кодекс Охотника, том 17');
  });

  it('prefers a non-numeric volume label', () => {
    expect(displayBookTitle({ title: 'Сборник', seriesNoLabel: '1-2', seriesNo: 1 })).toBe('Сборник, том 1-2');
  });

  it('leaves a book without a volume unchanged', () => {
    expect(displayBookTitle({ title: 'Отдельная книга' })).toBe('Отдельная книга');
  });

  it('accepts a volume stored as text', () => {
    expect(displayBookTitle({ title: 'Кодекс Охотника', seriesNo: '17' })).toBe('Кодекс Охотника, том 17');
  });

  it('drops a trailing #volume that repeats the series number', () => {
    expect(displayBookTitle({ title: 'Кодекс Охотника #39', seriesNo: 39 })).toBe('Кодекс Охотника, том 39');
  });

  it('keeps a different #number in the title', () => {
    expect(displayBookTitle({ title: 'Кодекс Охотника #40', seriesNo: 39 })).toBe('Кодекс Охотника #40, том 39');
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

describe('volumeCaption', () => {
  it('names the volume for tiles and rows', () => {
    expect(volumeCaption({ seriesNo: 33 })).toBe('Том 33');
    expect(volumeCaption({})).toBe('');
  });
});

describe('cleanFileLikeTitle', () => {
  it('turns a file name into a readable title', () => {
    expect(cleanFileLikeTitle('GKN_5_-_Mihajlov_Dem')).toBe('GKN 5 — Mihajlov Dem');
    expect(cleanFileLikeTitle('Melnik_Sergei_CHuchie_igry_Litmir.net_bid212581_8d7a7')).toBe('Melnik Sergei CHuchie igry');
    expect(cleanFileLikeTitle('Пикник на обочине.fb2')).toBe('Пикник на обочине');
  });

  it('leaves real titles alone', () => {
    expect(cleanFileLikeTitle('Кодекс Охотника. Книга XXXIII')).toBe('Кодекс Охотника. Книга XXXIII');
    expect(cleanFileLikeTitle("Assassin's Creed. Братство")).toBe("Assassin's Creed. Братство");
  });
});

describe('sameSeriesName', () => {
  it('matches the book spelling against the lowercase catalog key', () => {
    expect(sameSeriesName('Адвокат империи', 'адвокат империи')).toBe(true);
    expect(sameSeriesName('Ёлки  Палки ', 'елки палки')).toBe(true);
    expect(sameSeriesName('Адвокат империи', 'Адвокат')).toBe(false);
    expect(sameSeriesName('', '')).toBe(false);
  });
});
