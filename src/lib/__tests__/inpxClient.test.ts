import { describe, it, expect } from 'vitest';
import {
  normalizeBaseUrl,
  authHeader,
  formatAuthorLabel,
  formatAuthorsFromItem,
  pickSeriesFromItem,
  mapServerBook,
  coverUrl,
  readerPosition,
  parseReaderPosition,
  isAppReaderPosition,
  isEpubCfiPosition,
  type InpxBookItem,
} from '../inpxClient';
import type { ServerConfig } from '../../types';

const baseConfig: ServerConfig = {
  url: 'http://192.168.1.10:8080/',
  username: 'user',
  password: 'pass',
  connectionStatus: 'connected',
};

describe('normalizeBaseUrl', () => {
  it('adds http for local hosts and strips trailing slash', () => {
    expect(normalizeBaseUrl('192.168.1.10:8080/')).toBe('http://192.168.1.10:8080');
  });

  it('removes /opds/v2 suffix', () => {
    expect(normalizeBaseUrl('https://lib.example/opds/v2')).toBe('https://lib.example');
  });
});

describe('authHeader', () => {
  it('prefers basic auth when password is present even if device token exists', () => {
    const headers = authHeader({ ...baseConfig, deviceToken: 'dev-token-abc' });
    expect(headers.Authorization).toMatch(/^Basic /);
  });

  it('uses device token when password is absent', () => {
    const headers = authHeader({
      ...baseConfig,
      password: '',
      deviceToken: 'dev-token-abc',
    });
    expect(headers.Authorization).toBe('Bearer dev-token-abc');
  });

  it('returns basic auth when credentials present', () => {
    const headers = authHeader(baseConfig);
    expect(headers.Authorization).toMatch(/^Basic /);
  });

  it('trims username for basic auth', () => {
    const withSpaces = authHeader({ ...baseConfig, username: '  user  ' });
    const trimmed = authHeader(baseConfig);
    expect(withSpaces.Authorization).toBe(trimmed.Authorization);
  });

  it('returns empty object without credentials', () => {
    expect(authHeader({ url: 'http://localhost', connectionStatus: 'disconnected' })).toEqual({});
  });

  it('encodes long UTF-8 credentials without RangeError', () => {
    const longUser = 'ю'.repeat(100_000);
    const longPass = 'я'.repeat(100_000);
    expect(() => authHeader({ ...baseConfig, username: longUser, password: longPass })).not.toThrow();
    const headers = authHeader({ ...baseConfig, username: longUser, password: longPass });
    expect(headers.Authorization).toMatch(/^Basic /);
  });
});

describe('author and series formatting', () => {
  it('formats multiple authors from colon-separated INPX field', () => {
    expect(formatAuthorLabel('Tolstoy,Leo:Dostoevsky,Fyodor')).toContain('Tolstoy');
  });

  it('uses authorsDisplay when present', () => {
    expect(formatAuthorsFromItem({ authorsDisplay: 'Display Name' })).toBe('Display Name');
  });

  it('picks series from seriesList fallback', () => {
    expect(pickSeriesFromItem({ seriesList: [{ name: 'Cycle', seriesNo: 2 }] })).toEqual({
      series: 'Cycle',
      seriesNo: 2,
      seriesNoLabel: '2',
    });
  });

  it('prefers seriesList entry matching preferred series name', () => {
    expect(
      pickSeriesFromItem(
        {
          series: 'Other',
          seriesNo: 9,
          seriesList: [
            { name: 'Other', seriesNo: 9 },
            { name: 'Cycle', seriesNo: 3 },
          ],
        },
        'Cycle',
      ),
    ).toEqual({
      series: 'Cycle',
      seriesNo: 3,
      seriesNoLabel: '3',
    });
  });
});

describe('mapServerBook', () => {
  const item: InpxBookItem = {
    id: 'book-1',
    title: 'Test Book',
    authors: 'Author,One',
    genres: 'Fantasy:Epic',
    ext: '.fb2',
    size: 1024,
    libRate: 80,
    readProgress: 42.7,
  };

  it('maps server fields to client Book shape', () => {
    const book = mapServerBook(item, baseConfig);
    expect(book.id).toBe('book-1');
    expect(book.ext).toBe('fb2');
    expect(book.rating).toBe(4);
    expect(book.readProgress).toBe(43);
    expect(book.coverUrl).toMatch(/cover-thumb/);
    expect(book.contentUrl).toContain('/api/books/book-1/content');
  });
});

describe('coverUrl', () => {
  it('builds thumb and full URLs', () => {
    expect(coverUrl(baseConfig, 'abc', 'thumb')).toBe('http://192.168.1.10:8080/api/books/abc/cover-thumb');
    expect(coverUrl(baseConfig, 'abc', 'full')).toBe('http://192.168.1.10:8080/api/books/abc/cover');
  });
});

describe('reader position helpers', () => {
  it('round-trips app reader position', () => {
    const pos = readerPosition(3, 12);
    expect(parseReaderPosition(pos)).toEqual({ chapter: 3, paragraph: 12 });
    expect(isAppReaderPosition(pos)).toBe(true);
    expect(isEpubCfiPosition(pos)).toBe(false);
  });

  it('detects EPUB CFI', () => {
    expect(isEpubCfiPosition('epubcfi(/6/4!/2/2)')).toBe(true);
  });
});
