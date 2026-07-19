import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readerPreserveSource() {
  const readerPath = fileURLToPath(
    new URL('../../../public/inpx-reader/reader.js', import.meta.url),
  );
  const source = readFileSync(readerPath, 'utf8');
  const start = source.indexOf('async function preserveLocationAfterLayoutChange');
  const end = source.indexOf('function applyPreset', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('layout position restore after typography change', () => {
  it('preserveLocationAfterLayoutChange prefers range and textAnchor over fraction', () => {
    const fn = readerPreserveSource();
    const rangeIdx = fn.indexOf('await view.renderer.scrollToAnchor(range)');
    const textAnchorIdx = fn.indexOf('await view.goToTextAnchor(anchorSnap.sectionIndex');
    const fractionIdx = fn.indexOf('await seekReaderToFraction(anchorSnap.fraction)');
    const verifyIdx = fn.indexOf('layoutAnchorVerified');

    expect(rangeIdx).toBeGreaterThanOrEqual(0);
    expect(textAnchorIdx).toBeGreaterThan(rangeIdx);
    expect(fractionIdx).toBeGreaterThan(textAnchorIdx);
    expect(verifyIdx).toBeGreaterThanOrEqual(0);
    expect(fn).toContain('positionSaveSuppression.begin()');
    expect(fn).toContain('waitForFontsReady');
  });

  it('does not use fraction when a text anchor snapshot exists', () => {
    const fn = readerPreserveSource();
    expect(fn).toContain('const needsFraction = !hasTextAnchor');
    expect(fn).not.toMatch(/Math\.abs\(currentFrac - targetFrac\) <= 0\.03/);
    expect(fn).not.toMatch(/targetFrac < 0\.01/);
  });

  it('debounces layout preserve and snapshots range before reflow', () => {
    const readerPath = fileURLToPath(
      new URL('../../../public/inpx-reader/reader.js', import.meta.url),
    );
    const source = readFileSync(readerPath, 'utf8');
    expect(source).toContain('function snapshotLayoutAnchor');
    expect(source).toContain('cloneRange');
    expect(source).toContain('scheduleLayoutPreserve(anchorSnap)');

    const start = source.indexOf('function onViewportResize');
    const end = source.indexOf('window.addEventListener(\'resize\', onViewportResize)', start);
    const resizeFn = source.slice(start, end);
    expect(resizeFn).toContain('snapshotLayoutAnchor');
    expect(resizeFn).toContain('preserveLocationAfterLayoutChange(anchorSnap)');
  });

  it('reopens with exact paginator page and rejects backward flush drift', () => {
    const readerPath = fileURLToPath(
      new URL('../../../public/inpx-reader/reader.js', import.meta.url),
    );
    const source = readFileSync(readerPath, 'utf8');
    expect(source).toContain('async function tryRestorePaginatorPage');
    expect(source).toContain('async function nudgeIfLandedOnePageEarly');
    expect(source).toContain('scrollToPageIndex(savedPage)');
    expect(source).toContain('flush-keep-committed');
    expect(source).toContain('commitReadingPosition');
    expect(source).toContain('let bootRestoreInProgress = needsRestore');
    expect(source).not.toContain('await preserveLocationAfterLayoutChange(restoreAnchor');
  });

  it('forces chapter starts onto a new page via column breaks', () => {
    const readerPath = fileURLToPath(
      new URL('../../../public/inpx-reader/reader.js', import.meta.url),
    );
    const source = readFileSync(readerPath, 'utf8');
    const cssStart = source.indexOf('function getBookCSS');
    const cssEnd = source.indexOf('function applyBookStyles', cssStart);
    const css = source.slice(cssStart, cssEnd);
    expect(css).toContain('break-before: column !important');
    expect(css).toContain('epub|type~="chapter"');
    expect(css).toContain('break-before: auto !important');
  });

  it('splits FB2 chapters into separate Foliate sections', () => {
    const fb2Path = fileURLToPath(
      new URL('../../../public/foliate/fb2.js', import.meta.url),
    );
    const source = readFileSync(fb2Path, 'utf8');
    expect(source).toContain('explodeChapterSections');
    expect(source).toContain('isTitleEl');
    expect(source).toContain('flatMap(({ el }) => explodeChapterSections(el)');
  });

  it('skips Foliate sentinel pages between sections', () => {
    const paginatorPath = fileURLToPath(
      new URL('../../../public/foliate/paginator.js', import.meta.url),
    );
    const source = readFileSync(paginatorPath, 'utf8');
    expect(source).toContain('page >= pages - 1 && this.#adjacentIndex(1) != null');
    expect(source).toContain('page <= 0 && this.#adjacentIndex(-1) != null');
  });
});
