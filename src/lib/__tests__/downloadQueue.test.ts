import { describe, it, expect } from 'vitest';
import { MAX_CONCURRENT_DOWNLOADS, statusLabel } from '../downloadQueue';

describe('downloadQueue', () => {
  it('allows two parallel downloads', () => {
    expect(MAX_CONCURRENT_DOWNLOADS).toBe(2);
  });

  it('labels download statuses in Russian', () => {
    expect(statusLabel('queued')).toBe('В очереди');
    expect(statusLabel('downloading')).toBe('Скачивается');
  });
});
