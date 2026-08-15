import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { enrichAndroidPositionPayload } from '../../../public/inpx-reader/reader-shared/android-position.js';
import { isTextAnchorLandingVerified } from '../../../public/inpx-reader/reader-shared/text-anchor.js';

describe('Android reader position payload', () => {
  it('adds section, paginator, page fraction, and layout anchors', () => {
    const payload = enrichAndroidPositionPayload(
      { position: 'epubcfi(/6/8)', fraction: 0.4 },
      {
        section: { current: 3 },
        textOffset: 1234,
        textQuote: 'Exact words after the anchor',
        textSectionLength: 9000,
      },
      { page: 5, pages: 12 },
      'paginated',
    );

    expect(payload).toMatchObject({
      sectionIndex: 3,
      textOffset: 1234,
      textQuote: 'Exact words after the anchor',
      textSectionLength: 9000,
      sectionPageFraction: 0.4,
      paginatorPage: 5,
      paginatorPages: 12,
      layoutMode: 'paginated',
    });
  });

  it('verifies exact anchors by section plus quote or offset tolerance', () => {
    const saved = { sectionIndex: 3, textOffset: 1234, textQuote: 'Exact words after the anchor' };

    expect(isTextAnchorLandingVerified(saved, {
      section: { current: 3 },
      textOffset: 1240,
      textQuote: 'Exact words after the anchor and more',
    })).toBe(true);
    expect(isTextAnchorLandingVerified(saved, {
      section: { current: 3 },
      textOffset: 1300,
      textQuote: 'Exact words after the anchor and more',
    })).toBe(true);
    expect(isTextAnchorLandingVerified(saved, {
      section: { current: 4 },
      textOffset: 1234,
      textQuote: 'Exact words after the anchor',
    })).toBe(false);
  });

  it('waits for parent prompt response without a short auto-decline timeout', () => {
    const bootstrapPath = fileURLToPath(
      new URL('../../../public/inpx-reader/bootstrap.js', import.meta.url),
    );
    const source = readFileSync(bootstrapPath, 'utf8');
    const start = source.indexOf('function requestParentCrossDevicePrompt');
    const end = source.indexOf('function serverSnapshotRestorePayload', start);
    const promptSource = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    // Safety unload timeout is OK; do not auto-decline after a few seconds.
    expect(promptSource).not.toContain('8000');
    expect(promptSource).toContain('120_000');
    expect(promptSource).toContain('pagehide');
  });

  it('forces every iframe store write to positionVersion 4', () => {
    const bootstrapPath = fileURLToPath(
      new URL('../../../public/inpx-reader/bootstrap.js', import.meta.url),
    );
    const source = readFileSync(bootstrapPath, 'utf8');
    const start = source.indexOf('function writeReaderData');
    const end = source.indexOf('function notifyParentReaderSync', start);
    const writeSource = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(writeSource).toContain('positionVersion: 4');
  });
});
