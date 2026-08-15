import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Book, ReadingProgress } from '../../types';

const readerData = new Map<string, Record<string, unknown>>();

vi.mock('../offlineReaderStore', () => ({
  readOfflineReaderData: (id: string) =>
    readerData.get(id) ?? { positionVersion: 4, position: '', progress: 0 },
}));

import { upsertProgressFromLocalReader } from '../localReadingProgress';

const book: Book = { id: 'b1', title: 'T', author: 'A', ext: 'fb2' };

function serverEntry(overrides: Partial<ReadingProgress> = {}): ReadingProgress {
  return {
    bookId: 'b1',
    bookTitle: 'T',
    authorName: 'A',
    currentChapter: 0,
    percentage: 80,
    scrollPosition: 0,
    charPosition: 0,
    lastRead: Date.parse('2025-06-01T00:00:00Z'),
    finished: false,
    ...overrides,
  };
}

describe('upsertProgressFromLocalReader', () => {
  beforeEach(() => {
    readerData.clear();
  });

  it('ignores corrupt timestamps instead of treating them as "now"', () => {
    readerData.set('b1', { position: 'x', progress: 40, positionChangedAt: 'not-a-date' });
    const list = upsertProgressFromLocalReader([], book);
    expect(list).toHaveLength(0);
  });

  it('does not regress server percentage with an older local snapshot (LWW)', () => {
    readerData.set('b1', { position: 'x', progress: 30, positionChangedAt: '2024-01-01T00:00:00Z' });
    const [merged] = upsertProgressFromLocalReader([serverEntry()], book);
    expect(merged.percentage).toBe(80);
    expect(merged.lastRead).toBe(Date.parse('2025-06-01T00:00:00Z'));
  });

  it('applies local progress when local snapshot is newer', () => {
    readerData.set('b1', { position: 'x', progress: 90, positionChangedAt: '2026-01-01T00:00:00Z' });
    const [merged] = upsertProgressFromLocalReader([serverEntry()], book);
    expect(merged.percentage).toBe(90);
    expect(merged.finished).toBe(false);
    expect(merged.lastRead).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });

  it('marks finished at >= 95% when local wins', () => {
    readerData.set('b1', { position: 'x', progress: 97, positionChangedAt: '2026-01-01T00:00:00Z' });
    const [merged] = upsertProgressFromLocalReader([serverEntry()], book);
    expect(merged.finished).toBe(true);
  });
});
