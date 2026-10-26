import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Book, ReadingProgress } from '../../types';

const readerData = new Map<string, Record<string, unknown>>();

vi.mock('../offlineReaderStore', () => ({
  readOfflineReaderData: (id: string) =>
    readerData.get(id) ?? { positionVersion: 4, position: '', progress: 0 },
}));

import {
  recentRemovedOnServer,
  upsertProgressFromLocalReader,
  withoutFinishedReading,
  type LocalRecentReadingItem,
} from '../localReadingProgress';

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
  it('a stored lastRead ahead of the device clock does not pin the old percentage', () => {
    // Emulator clock 19 Oct; the stored row came from 20 Oct → before the fix 30% stayed forever.
    const now = Date.parse('2026-10-19T11:12:00Z');
    readerData.set('b1', { position: 'x', progress: 34, positionChangedAt: '2026-10-19T11:11:45Z' });
    const [merged] = upsertProgressFromLocalReader(
      [serverEntry({ percentage: 30, lastRead: Date.parse('2026-10-20T21:24:54Z') })],
      book,
      now,
    );
    expect(merged.percentage).toBe(34);
    expect(merged.lastRead).toBe(Date.parse('2026-10-19T11:11:45Z'));
  });
});

function recent(id: string, lastOpenedAt: string, readProgress = 40): LocalRecentReadingItem {
  return { id, title: id, authorsDisplay: '', ext: 'fb2', readProgress, lastOpenedAt };
}

describe('withoutFinishedReading', () => {
  it('drops books read on the server or finished here', () => {
    const items = [recent('a', '2026-10-20T10:00:00Z'), recent('b', '2026-10-20T10:00:00Z'), recent('c', '2026-10-20T10:00:00Z', 99)];
    expect(withoutFinishedReading(items, new Set(['b'])).map((i) => i.id)).toEqual(['a']);
  });

  it('prefers the live progress map over the stored item progress', () => {
    const items = [recent('a', '2026-10-20T10:00:00Z', 40)];
    expect(withoutFinishedReading(items, null, { a: 100 })).toEqual([]);
  });
});

describe('recentRemovedOnServer', () => {
  const rev = '2026-10-21T12:00:00Z';

  it('hides books read before the server history changed and missing there', () => {
    const local = [recent('gone', '2026-10-20T10:00:00Z'), recent('kept', '2026-10-20T10:00:00Z')];
    expect(recentRemovedOnServer(local, new Set(['kept']), rev)).toEqual(['gone']);
  });

  it('keeps books read after the change (history may not have reached the server yet)', () => {
    expect(recentRemovedOnServer([recent('new', '2026-10-22T08:00:00Z')], new Set(), rev)).toEqual([]);
  });

  it('leaves read books to the read filter and does nothing without a server revision', () => {
    const local = [recent('read', '2026-10-20T10:00:00Z')];
    expect(recentRemovedOnServer(local, new Set(), rev, new Set(['read']))).toEqual([]);
    expect(recentRemovedOnServer(local, new Set(), null)).toEqual([]);
  });
});
