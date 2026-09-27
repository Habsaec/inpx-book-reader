import { describe, it, expect } from 'vitest';
import { isBookDownloadInFlight, isBookFinished, resolveBookPrimaryAction } from '../bookOpenPolicy';

describe('resolveBookPrimaryAction', () => {
  it('downloads when there is no local file', () => {
    expect(resolveBookPrimaryAction({ hasFile: false })).toEqual({
      kind: 'download',
      label: 'Скачать',
      disabled: false,
    });
  });

  it('disables the action while the file is downloading', () => {
    expect(resolveBookPrimaryAction({ hasFile: false, isDownloading: true })).toEqual({
      kind: 'downloading',
      label: 'Скачивается',
      disabled: true,
    });
  });

  it('reads a downloaded book with no progress', () => {
    expect(resolveBookPrimaryAction({ hasFile: true, progress: 0 })).toEqual({
      kind: 'read',
      label: 'Читать',
      disabled: false,
    });
  });

  it('continues when progress is below 99%', () => {
    expect(resolveBookPrimaryAction({ hasFile: true, progress: 42 })).toEqual({
      kind: 'continue',
      label: 'Продолжить',
      disabled: false,
    });
  });

  it('rereads a finished or marked-read book', () => {
    expect(resolveBookPrimaryAction({ hasFile: true, progress: 99 })).toEqual({
      kind: 'reread',
      label: 'Читать',
      disabled: false,
    });
    expect(resolveBookPrimaryAction({ hasFile: true, progress: 0, isRead: true })).toEqual({
      kind: 'reread',
      label: 'Читать',
      disabled: false,
    });
  });

  it('prefers continue when an in-progress book is still marked read', () => {
    expect(resolveBookPrimaryAction({ hasFile: true, progress: 20, isRead: true })).toEqual({
      kind: 'continue',
      label: 'Продолжить',
      disabled: false,
    });
  });
});

describe('isBookFinished', () => {
  it('treats 99% and a read flag with no progress as finished', () => {
    expect(isBookFinished(99, false)).toBe(true);
    expect(isBookFinished(100, false)).toBe(true);
    expect(isBookFinished(0, true)).toBe(true);
  });

  it('shows the mark for every book flagged read, even with an older position', () => {
    expect(isBookFinished(20, true)).toBe(true);
    expect(isBookFinished(96, true)).toBe(true);
    expect(isBookFinished(0, false)).toBe(false);
    expect(isBookFinished(98, false)).toBe(false);
  });
});

describe('isBookDownloadInFlight', () => {
  it('matches the active download or queued ids', () => {
    expect(isBookDownloadInFlight('a', 'a', new Set())).toBe(true);
    expect(isBookDownloadInFlight('b', 'a', new Set(['b']))).toBe(true);
    expect(isBookDownloadInFlight('c', 'a', ['b'])).toBe(false);
  });
});
