import { describe, expect, it } from 'vitest';
import { createSuppressionCounter } from '../../../public/inpx-reader/reader-shared/suppression-counter.js';

describe('position save suppression counter', () => {
  it('stays suppressed until every nested scope exits', async () => {
    const counter = createSuppressionCounter();
    counter.begin();
    expect(counter.isSuppressed()).toBe(true);

    await counter.run(async () => {
      expect(counter.isSuppressed()).toBe(true);
    });

    expect(counter.isSuppressed()).toBe(true);
    counter.end();
    expect(counter.isSuppressed()).toBe(false);
  });

  it('releases suppression when a nested task throws', async () => {
    const counter = createSuppressionCounter();
    await expect(counter.run(async () => {
      throw new Error('restore failed');
    })).rejects.toThrow('restore failed');
    expect(counter.isSuppressed()).toBe(false);
  });
});
