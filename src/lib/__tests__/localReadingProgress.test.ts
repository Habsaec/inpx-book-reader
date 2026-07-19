import { describe, expect, it } from 'vitest';
import { mergeRecentReadingLists, type LocalRecentReadingItem } from '../localReadingProgress';

function item(overrides: Partial<LocalRecentReadingItem> = {}): LocalRecentReadingItem {
  return {
    id: 'book-1',
    title: 'Book',
    authorsDisplay: 'Author',
    ext: 'fb2',
    readProgress: 100,
    lastOpenedAt: '2026-07-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('mergeRecentReadingLists', () => {
  it('lets newer rereading progress replace an older completed value', () => {
    const merged = mergeRecentReadingLists(
      [item({ readProgress: 100 })],
      [item({ readProgress: 85, lastOpenedAt: '2026-07-12T11:00:00.000Z' })],
    );

    expect(merged[0].readProgress).toBe(85);
    expect(merged[0].lastOpenedAt).toBe('2026-07-12T11:00:00.000Z');
  });

  it('keeps server progress when the server entry is newer', () => {
    const merged = mergeRecentReadingLists(
      [item({ readProgress: 80, lastOpenedAt: '2026-07-12T12:00:00.000Z' })],
      [item({ readProgress: 40, lastOpenedAt: '2026-07-12T11:00:00.000Z' })],
    );

    expect(merged[0].readProgress).toBe(80);
  });
});
