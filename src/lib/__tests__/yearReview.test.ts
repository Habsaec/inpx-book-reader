import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchYearReview } from '../inpxClient';
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

describe('year review API', () => {
  it('asks for the year and normalizes books, months and tones', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(decodeURIComponent(String(input)));
      return json({
        year: 2025, total: 2, goal: 10, byMonth: [0, 2], busiestMonth: 2,
        first: { id: '6:1', title: 'A', authors: 'X,Y', coverColor: '#112233', coverLqip: 'javascript:x' },
        last: { id: '6:2', title: 'B', authors: '' },
        favorite: null,
        covers: [{ id: '6:2', title: 'B' }, { nope: true }],
        topAuthors: [{ name: 'x', count: 2 }], topGenres: [], topSeries: [],
        ratedCount: 0, averageRating: null, years: [2025, '2023'],
      });
    }));
    const r = await fetchYearReview(config, 2025);
    expect(urls.some((u) => u.includes('/api/reading-stats/year?year=2025'))).toBe(true);
    expect(r?.byMonth).toHaveLength(12);
    expect(r?.byMonth[1]).toBe(2);
    expect(r?.first?.coverColor).toBe('#112233');
    expect(r?.first?.coverLqip).toBeUndefined();
    expect(r?.covers).toHaveLength(1);
    expect(r?.years).toEqual([2025, 2023]);
  });

  it('an older server (404) gives null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'not found' }, 404)));
    expect(await fetchYearReview(config)).toBeNull();
  });
});
