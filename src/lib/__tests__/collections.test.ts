import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchBookPublishInfo, fetchCollection, fetchCollections } from '../inpxClient';
import { sanitizeHtml } from '../sanitizeHtml';
import type { ServerConfig } from '../../types';

const config: ServerConfig = {
  url: 'http://192.168.1.10:8080/',
  username: 'user',
  password: 'pass',
  connectionStatus: 'connected',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('collections API', () => {
  it('lists collections from /api/collections', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(decodeURIComponent(String(input)));
      return json({ items: [{ slug: 'russian-classics', title: 'Классика', description: '', source: '', sourceUrl: '', total: 3, found: 2, matching: false, previewBookIds: ['1:2'] }, { bad: true }] });
    }));
    const items = await fetchCollections(config);
    expect(urls.some((u) => u.includes('/api/collections') && !u.includes('/api/collections/'))).toBe(true);
    expect(items.map((c) => [c.slug, c.found, c.total])).toEqual([['russian-classics', 2, 3]]);
  });

  it('treats an old server (404) as no collections', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'not found' }, 404)));
    expect(await fetchCollections(config)).toEqual([]);
  });

  it('loads one collection with missing items as book: null', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      expect(decodeURIComponent(String(input))).toContain('/api/collections/school-reading-100');
      return json({
        slug: 'school-reading-100', title: 'Школа', description: '', source: '', sourceUrl: '', total: 2, found: 1, read: 0, matching: false,
        items: [
          { position: 1, author: 'Айтматов', title: 'Белый пароход', year: 1970, note: '', book: { id: '6:1', title: 'Белый пароход' }, read: false },
          { position: 2, author: 'Кто-то', title: 'Нет', year: null, note: '', book: null, read: false },
        ],
      });
    }));
    const detail = await fetchCollection(config, 'school-reading-100');
    expect(detail?.items.map((i) => i.book?.id ?? null)).toEqual(['6:1', null]);
  });
});

describe('fetchBookPublishInfo', () => {
  it('reads year and ISBN', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      expect(decodeURIComponent(String(input))).toContain('/publish-info');
      return json({ publishYear: 2003, isbn: '5-17-012345-6' });
    }));
    expect(await fetchBookPublishInfo(config, '6:42')).toEqual({ publishYear: 2003, isbn: '5-17-012345-6' });
  });

  it('is empty on servers without the route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 404)));
    expect(await fetchBookPublishInfo(config, '6:42')).toEqual({ publishYear: null, isbn: '' });
  });
});

describe('sanitizeHtml and server BB-code markup', () => {
  it('keeps spoilers and u / s from BB-codes', () => {
    const html = sanitizeHtml('<details onclick="x()"><summary>Финал</summary><div><u>u</u> <s>s</s></div></details>');
    expect(html).toBe('<details><summary>Финал</summary><div><u>u</u> <s>s</s></div></details>');
  });
});

describe('pinned collections on Home', () => {
  it('asks /api/home/shelves with collections=1 and keeps pinned collections', async () => {
    const { fetchHomeShelves } = await import('../inpxClient');
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(decodeURIComponent(String(input)));
      return json({
        items: [
          { id: 3, kind: 'collection', slug: 'russian-classics', title: 'Классика', href: '/collections/russian-classics', items: [{ id: 'b1', title: 'Книга' }] },
          { id: 4, kind: 'collection', title: 'Без slug', href: '/collections/x', items: [{ id: 'b2', title: 'Книга' }] },
          { id: 5, kind: 'future', title: 'Неизвестное', href: '/x', items: [{ id: 'b3', title: 'Книга' }] },
        ],
      });
    }));
    const shelves = await fetchHomeShelves(config);
    expect(urls.some((u) => u.includes('/api/home/shelves?collections=1'))).toBe(true);
    expect(shelves.map((s) => [s.kind, s.slug])).toEqual([['collection', 'russian-classics']]);
  });

  it('pins a collection with POST /api/collections/:slug/home', async () => {
    const { setCollectionOnHomeApi } = await import('../inpxClient');
    let body = '';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(decodeURIComponent(String(input))).toContain('/api/collections/russian-classics/home');
      body = String(init?.body || '');
      return json({ ok: true, onHome: 1 });
    }));
    expect(await setCollectionOnHomeApi(config, 'russian-classics', true)).toBe(true);
    expect(JSON.parse(body)).toEqual({ on: true });
  });
});
