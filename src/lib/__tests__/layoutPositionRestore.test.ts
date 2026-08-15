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
  it('preserveLocationAfterLayoutChange prefers textAnchor over fraction', () => {
    const fn = readerPreserveSource();
    const textAnchorIdx = fn.indexOf('await view.goToTextAnchor(snap.sectionIndex');
    const sectionFracIdx = fn.indexOf('restoreSectionFrac(\'anchor\')');
    const fractionIdx = fn.indexOf('await seekReaderToFraction(snap.fraction)');
    const verifyIdx = fn.indexOf('layoutAnchorVerified');

    expect(textAnchorIdx).toBeGreaterThanOrEqual(0);
    expect(sectionFracIdx).toBeGreaterThan(textAnchorIdx);
    expect(fractionIdx).toBeGreaterThan(sectionFracIdx);
    expect(verifyIdx).toBeGreaterThanOrEqual(0);
    expect(fn).toContain('holdRendererLayout()');
    expect(fn).toContain('releaseRendererLayout()');
    expect(fn).toContain('beginLayoutSuppress()');
    expect(fn).toContain('waitForFontsReady');
    expect(fn).toContain('keepLayoutAnchor(snap)');
    expect(fn).toContain('Book-level fraction jumps FB2 chapters');
    expect(fn).not.toContain('scrollToAnchor(range)');
  });

  it('restores text-anchor and does not fall through to coarse fb2Href', () => {
    const fn = readerPreserveSource();
    const textIdx = fn.indexOf('if (hasTextAnchor)');
    const returnAfterText = fn.indexOf('return;', textIdx);
    const fb2Idx = fn.indexOf('fb2Href');
    expect(textIdx).toBeGreaterThanOrEqual(0);
    expect(returnAfterText).toBeGreaterThan(textIdx);
    expect(fn).toContain('await view.goToTextAnchor(snap.sectionIndex');
    expect(fb2Idx).toBe(-1);
  });

  it('debounces layout preserve and snapshots range before reflow', () => {
    const readerPath = fileURLToPath(
      new URL('../../../public/inpx-reader/reader.js', import.meta.url),
    );
    const source = readFileSync(readerPath, 'utf8');
    expect(source).toContain('function estimateTextOffsetFromPage');
    expect(source).toContain('textOffset <= 0 && page > 1');
    expect(source).toContain('cloneRange');
    expect(source).toContain('captureStickyLayoutAnchor');
    expect(source).toContain('import \'/foliate/view.js?v=page-turn-1\'');
    expect(source).toContain('holdRendererLayout()');
    expect(source).toContain('layoutAnchorSticky = snap;\n      pinRendererTextAnchor(snap);');

    const start = source.indexOf('function onViewportResize');
    const end = source.indexOf('window.addEventListener(\'resize\', onViewportResize)', start);
    const resizeFn = source.slice(start, end);
    expect(resizeFn).toContain('captureStickyLayoutAnchor');
    expect(resizeFn).toContain('pinRendererTextAnchor');
    expect(resizeFn).toContain('preserveLocationAfterLayoutChange(snap');
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
    expect(source).toContain('let bootRestoreInProgress = true');
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

  it('pins a layout-independent text offset on the Foliate paginator', () => {
    const paginatorPath = fileURLToPath(
      new URL('../../../public/foliate/paginator.js', import.meta.url),
    );
    const viewPath = fileURLToPath(
      new URL('../../../public/foliate/view.js', import.meta.url),
    );
    const source = readFileSync(paginatorPath, 'utf8');
    const view = readFileSync(viewPath, 'utf8');
    expect(source).toContain('pinTextAnchor(offset, quote = \'\')');
    expect(source).toContain('rangeFromTextOffset(doc, this.#textOffset, this.#textQuote)');
    expect(source).toContain('if (!this.scrolled && !(size > 8)) return');
    expect(source).toContain('holdLayout()');
    expect(source).toContain('releaseLayout()');
    expect(source).toContain('async restoreTextAnchor(offset, quote = \'\')');
    expect(source).toContain('if (this.#layoutHeld) return');
    expect(source).toContain('this.#anchor = doc => rangeFromTextOffset(doc, this.#textOffset, this.#textQuote)');
    expect(source).toContain('async restoreSectionFrac(reason = \'anchor\')');
    expect(source).toContain('rememberSectionFrac()');
    expect(source).toContain('#syncSectionFracFromPage()');
    expect(source).toContain('#textOffsetFromCurrentPage()');
    expect(source).toContain('this.#scrollToPage(this.#pageFromTextOffset(this.#textOffset), \'navigation\')');
    expect(source).toContain('mappedPage <= 1 && pinFrac > 0.02');
    expect(source).toContain('clearTextAnchor()');
    expect(source).toContain('async #landAtSectionEdge(atEnd)');
    expect(source).toContain('if (numericDest)');
    expect(source).toContain('#beginSectionTurn(prev)');
    expect(view).toContain('await import(\'./paginator.js?v=page-turn-1\')');
    expect(view).toContain('async goToTextAnchor(index, textOffset, textQuote = \'\')');
  });

  it('numeric 0/1 section dest beats text pin (foliate-js page turn)', () => {
    const paginatorPath = fileURLToPath(
      new URL('../../../public/foliate/paginator.js', import.meta.url),
    );
    const source = readFileSync(paginatorPath, 'utf8');
    const fnStart = source.indexOf('async #scrollToAnchor(anchor, reason = \'anchor\')');
    const fnEnd = source.indexOf('#getVisibleRange()', fnStart);
    const fn = source.slice(fnStart, fnEnd);
    const numericIdx = fn.indexOf('if (numericDest)');
    const pinHijack = fn.indexOf('if (this.#textOffset != null)');
    expect(numericIdx).toBeGreaterThanOrEqual(0);
    expect(fn).toContain('this.clearTextAnchor()');
    expect(fn).toContain('this.#anchor = resolved');
    // Pin fallback, if present, must come after numeric dest returns.
    if (pinHijack >= 0) expect(numericIdx).toBeLessThan(pinHijack);
    expect(fn).not.toContain('Never let that overwrite the layout-independent pin');
  });

  it('skips Foliate sentinel pages between sections', () => {
    const paginatorPath = fileURLToPath(
      new URL('../../../public/foliate/paginator.js', import.meta.url),
    );
    const source = readFileSync(paginatorPath, 'utf8');
    expect(source).toContain('page >= pages - 1 && this.#adjacentIndex(1) != null');
    expect(source).toContain('page <= 0 && this.#adjacentIndex(-1) != null');
    expect(source).toContain('#landAtSectionEdge(prev)');
    expect(source).toContain('anchor: prev ? () => 1 : () => 0');
  });

  it('does not hide foliate-view during restore and skips blank sentinel on open', () => {
    const readerPath = fileURLToPath(
      new URL('../../../public/inpx-reader/reader.js', import.meta.url),
    );
    const cssPath = fileURLToPath(
      new URL('../../../public/inpx-reader/reader.css', import.meta.url),
    );
    const reader = readFileSync(readerPath, 'utf8');
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toContain('.reader-restore-veil');
    expect(css).not.toMatch(/html\.is-restoring-position\s+foliate-view\s*\{\s*visibility:\s*hidden/);
    expect(reader).toContain('async function ensurePaginatorContentPage');
    expect(reader).toContain('async function waitForPaginatorReady');
    expect(reader).toContain('reader-restore-veil');
  });

  it('cache-busts Foliate reader scripts so Android WebView cannot keep stale JS', () => {
    const genPath = fileURLToPath(
      new URL('../../../scripts/generate-reader-html.mjs', import.meta.url),
    );
    const gen = readFileSync(genPath, 'utf8');
    expect(gen).toContain('function readerAssetVersion');
    expect(gen).toContain('reader.js?v=${version}');
    expect(gen).toContain('bootstrap.js?v=${version}');
    expect(gen).toContain('WebView will keep stale JS');
  });
});
