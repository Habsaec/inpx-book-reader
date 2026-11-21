import { describe, expect, it } from 'vitest';
import { genrePatternHash, genrePatternStyle } from '../genrePattern';

describe('genre pattern tiles', () => {
  it('is stable per group and differs between groups', () => {
    expect(genrePatternStyle('Фантастика')).toEqual(genrePatternStyle('Фантастика'));
    expect(genrePatternHash('Фантастика')).not.toBe(genrePatternHash('Детективы'));
  });

  it('matches the server hash (djb2-xor over code points)', () => {
    // same value as genreSwatchHash('Фантастика') on the server (test/genre-swatch.test.js)
    expect(genrePatternHash('abc')).toBe(193409669);
  });
});
