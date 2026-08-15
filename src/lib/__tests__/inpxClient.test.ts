import { describe, it, expect, vi } from 'vitest';
import {
  normalizeBaseUrl,
  authHeader,
  formatAuthorLabel,
  formatAuthorsFromItem,
  pickSeriesFromItem,
  mapServerBook,
  starsFromLibRate,
  coverUrl,
  readerPosition,
  parseReaderPosition,
  isAppReaderPosition,
  isEpubCfiPosition,
  ApiError,
  isAuthError,
  parsePairingQrPayload,
  testConnection,
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

  it('strips userinfo, query and fragment (fetch rejects credentialed URLs)', () => {
    expect(normalizeBaseUrl('http://user:pass@192.168.1.10:3000/?x=1#f')).toBe('http://192.168.1.10:3000');
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

describe('ApiError helpers', () => {
  it('isAuthError detects 401/403 ApiError', () => {
    expect(isAuthError(new ApiError('x', 401))).toBe(true);
    expect(isAuthError(new ApiError('x', 403))).toBe(true);
    expect(isAuthError(new ApiError('x', 500))).toBe(false);
    expect(isAuthError(new Error('HTTP 401'))).toBe(true);
    expect(isAuthError(new Error('HTTP 403 — forbidden'))).toBe(true);
    expect(isAuthError(new Error('HTTP 500'))).toBe(false);
  });
});

describe('testConnection', () => {
  it('marks Bearer-only 401 as authExpired', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      if (url.includes('/health')) {
        return new Response('ok', { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    }));

    await expect(testConnection({
      ...baseConfig,
      password: '',
      deviceToken: 'dead-token',
    })).resolves.toMatchObject({
      ok: false,
      authExpired: true,
    });

    vi.unstubAllGlobals();
  });
});

describe('patchReaderAnnotationApi', () => {
  it('throws ApiError with server message on HTTP failure', async () => {
    const { patchReaderAnnotationApi } = await import('../inpxClient');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Нет доступа' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(
      patchReaderAnnotationApi(baseConfig, 'book-1', 7, { note: 'test' }),
    ).rejects.toMatchObject({ name: 'ApiError', status: 403, message: 'Нет доступа' });

    vi.unstubAllGlobals();
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

describe('starsFromLibRate', () => {
  it('maps 0..5 INPX scale like the server cover badge', () => {
    expect(starsFromLibRate(0)).toBeUndefined();
    expect(starsFromLibRate(1)).toBe(1);
    expect(starsFromLibRate(4.9)).toBe(4);
    expect(starsFromLibRate(5)).toBe(5);
  });

  it('maps legacy percent-like values', () => {
    expect(starsFromLibRate(80)).toBe(4);
    expect(starsFromLibRate(100)).toBe(5);
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

  it('maps 1..5 libRate without dividing by 20', () => {
    const book = mapServerBook({ ...item, libRate: 5 }, baseConfig);
    expect(book.rating).toBe(5);
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

describe('parsePairingQrPayload', () => {
  it('accepts inpx-pair JSON and normalizes the server URL', () => {
    const payload = parsePairingQrPayload(JSON.stringify({
      type: 'inpx-pair',
      url: '192.168.1.10:3000/',
      code: 'ABC123',
      user: 'reader',
    }));
    expect(payload.url).toBe('http://192.168.1.10:3000');
    expect(payload.code).toBe('ABC123');
    expect(payload.user).toBe('reader');
  });

  it('accepts host:port without a scheme', () => {
    expect(parsePairingQrPayload(JSON.stringify({
      type: 'inpx-pair',
      url: 'localhost:3000',
      code: 'XYZ',
    })).url).toBe('http://localhost:3000');
  });

  it('rejects non-http(s) URLs', () => {
    expect(() => parsePairingQrPayload(JSON.stringify({
      type: 'inpx-pair',
      url: 'javascript:alert(1)',
      code: 'ABC123',
    }))).toThrow(/некорректный адрес/i);
    expect(() => parsePairingQrPayload(JSON.stringify({
      type: 'inpx-pair',
      url: 'file:///etc/passwd',
      code: 'ABC123',
    }))).toThrow(/некорректный адрес/i);
    expect(() => parsePairingQrPayload(JSON.stringify({
      type: 'inpx-pair',
      url: 'data:text/html,hi',
      code: 'ABC123',
    }))).toThrow(/некорректный адрес/i);
  });

  it('rejects unrelated QR payloads', () => {
    expect(() => parsePairingQrPayload('not-json')).toThrow();
    expect(() => parsePairingQrPayload(JSON.stringify({ type: 'wifi', url: 'http://x', code: '1' }))).toThrow();
  });
});
