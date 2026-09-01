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
    expect(source).toContain('import \'/foliate/view.js?v=swipe-4\'');
    expect(source).toContain('holdRendererLayout()');
    expect(source).toContain('layoutAnchorSticky = snap;\n      pinRendererTextAnchor(snap);');
    expect(source).toContain('function pinRendererTextAnchor(snap, force = false)');

    const start = source.indexOf('function freezeViewportLayoutAnchor');
    const end = source.indexOf('window.addEventListener(\'resize\', onViewportResize)', start);
    const resizeFn = source.slice(start, end);
    expect(resizeFn).toContain('freezeViewportLayoutAnchor');
    expect(resizeFn).toContain('captureStickyLayoutAnchor');
    expect(resizeFn).toContain('anchorFromCommittedPosition');
    expect(resizeFn).toContain('pinRendererTextAnchor(layoutAnchorSticky, true)');
    expect(resizeFn).toContain('isLayoutAnchorJump(committed, snap)');
    expect(resizeFn).toContain('preserveLocationAfterLayoutChange(snap');
    expect(resizeFn).toContain(', 320)');
    expect(resizeFn).toContain('pendingViewportPreserve');
    expect(resizeFn).toContain('lastViewportBox');
    expect(source).not.toContain('visualViewport?.addEventListener(\'resize\'');
    expect(resizeFn).not.toContain('rememberSectionFrac');
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
    expect(source).toContain('previewPositionUntilUserTurn = true');
    expect(source).toContain('is-restoring-position');
    expect(source).toContain('cfi-malformed-skip');
    expect(source).not.toContain('await preserveLocationAfterLayoutChange(restoreAnchor');
  });

  it('does not force chapter starts onto a new page', () => {
    const readerPath = fileURLToPath(
      new URL('../../../public/inpx-reader/reader.js', import.meta.url),
    );
    const source = readFileSync(readerPath, 'utf8');
    const cssStart = source.indexOf('function getBookCSS');
    const cssEnd = source.indexOf('function applyBookStyles', cssStart);
    const css = source.slice(cssStart, cssEnd);
    expect(css).not.toContain('break-before: column !important');
    expect(css).toContain('epub|type~="chapter"');
    expect(css).toContain('break-before: auto !important');
    expect(css).toContain('font-size: inherit !important');
    expect(css).toContain('invert(1) hue-rotate(180deg)');
    expect(source).toContain('isStaleExplodedFb2Anchor');
  });

  it('keeps FB2 fiction in one Foliate section for paper-book flow', () => {
    const fb2Path = fileURLToPath(
      new URL('../../../public/foliate/fb2.js', import.meta.url),
    );
    const source = readFileSync(fb2Path, 'utf8');
    expect(source).toContain('stitchFictionEls');
    expect(source).toContain('collectChapterTitles');
    expect(source).not.toContain('explodeChapterSections');
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
    expect(source).toContain('this.#pageFromTextOffset(this.#textOffset)');
    expect(source).toContain('await this.#scrollToPage(page, \'anchor\')');
    expect(source).toContain('#visibleTextOffset()');
    expect(source).toContain("prefix.toString().replace(/[\\t\\n\\f\\r ]+/g, ' ').replace(/^ /, '')");
    expect(source).toContain('#restoreAfterReflow()');
    expect(source).toContain('#restoreBusy');
    expect(source).toContain('flips pages back and forth while the user is reading');
    expect(source).toContain('#pinched()');
    expect(source).toContain('Pinch-zoom is a visual scale');
    expect(source).toContain('this.render(true)');
    expect(source).toContain('if (Number(globalThis.visualViewport?.scale) > 1.01) return');
    expect(source).toContain('mappedPage <= 1 && pinFrac > 0.02');
    expect(source).toContain('clearTextAnchor()');
    expect(source).toContain('async #landAtSectionEdge(atEnd)');
    expect(source).toContain('if (numericDest)');
    expect(source).toContain('#beginSectionTurn(prev)');
    expect(view).toContain('await import(\'./paginator.js?v=swipe-4\')');
    expect(view).toContain('await import(\'./fb2.js?v=paper-flow\')');
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
    expect(css).toContain('bottom:max(var(--r-safe-bottom), var(--r-status-h));');
    expect(css).not.toMatch(/#reader-body\{[^}]*bottom:var\(--r-bottom-reserve\)/);
    expect(reader).not.toContain('applyReserveAndRelayout');
    expect(css).not.toMatch(/html\.is-restoring-position\s+foliate-view\s*\{\s*visibility:\s*hidden/);
    expect(reader).toContain('async function ensurePaginatorContentPage');
    expect(reader).toContain('async function waitForPaginatorReady');
    expect(reader).toContain('async function revealReaderAfterRestore');
    expect(reader).toContain('function ensureRestoreVeil');
    expect(reader).toContain('reader-restore-veil');
    const htmlPath = fileURLToPath(
      new URL('../../../public/inpx-reader/index.html', import.meta.url),
    );
    const html = readFileSync(htmlPath, 'utf8');
    expect(html).toContain('id="reader-restore-veil"');
    const resizeStart = reader.indexOf('function onViewportResize');
    const resizeEnd = reader.indexOf('window.addEventListener(\'resize\', onViewportResize)', resizeStart);
    expect(reader.slice(resizeStart, resizeEnd)).toContain('is-restoring-position');
    expect(reader).toContain('__READER_WAIT_OPEN_SYNC__');
    expect(reader).toContain('__SHOW_DEFERRED_CROSS_DEVICE_PROMPT__');
    const bootStart = reader.indexOf('} finally {', reader.indexOf('async function loadBook'));
    const bootEnd = reader.indexOf('function onViewportResize', bootStart);
    const boot = reader.slice(bootStart, bootEnd);
    expect(boot.indexOf('__READER_WAIT_OPEN_SYNC__')).toBeGreaterThanOrEqual(0);
    expect(boot.indexOf('__SHOW_DEFERRED_CROSS_DEVICE_PROMPT__')).toBeGreaterThan(boot.indexOf('__READER_WAIT_OPEN_SYNC__'));
    expect(boot.indexOf('setRestoreVeil(false)')).toBeGreaterThan(boot.indexOf('__SHOW_DEFERRED_CROSS_DEVICE_PROMPT__'));
    expect(boot).toContain('if (replayViewport) onViewportResize()');
  });

  it('pinch changes font size, not page scale', () => {
    const readerPath = fileURLToPath(
      new URL('../../../public/inpx-reader/reader.js', import.meta.url),
    );
    const source = readFileSync(readerPath, 'utf8');
    expect(source).toContain('function applyPinchFontSize(size)');
    expect(source).toContain('function commitPinchFont()');
    expect(source).toContain('applyPinchFontSize(pinchStartSize * dampened)');
    expect(source).toContain('requestApplySettings()');
    expect(source).toContain('flushApplySettings()');
    expect(source).not.toContain('function setPinchPreview(scale)');
    expect(source).not.toContain('view.style.transform = next ? `scale(${next})` : \'\'');
    expect(source).not.toContain('if (newSize !== S.fontSize) { S.fontSize = newSize; applySettings(); refreshSettingsUI(); }');
  });

  it('does not silently restore from a late seed after the book is shown', () => {
    const bootstrapPath = fileURLToPath(
      new URL('../../../public/inpx-reader/bootstrap.js', import.meta.url),
    );
    const bootstrap = readFileSync(bootstrapPath, 'utf8');
    expect(bootstrap).toContain('positionsDiffer(before, merged)');
    expect(bootstrap).toContain('seedRestoreEnabled');
    expect(bootstrap).toContain('seedNeedsRestore');
    expect(bootstrap).not.toContain('seedTouchedStore');
    expect(bootstrap).toContain('inpx-reader-open-sync-done');
    expect(bootstrap).not.toContain('Number(before.sectionIndex) !== Number(merged.sectionIndex)');
    expect(bootstrap).not.toContain('Late silent pull after open');
  });

  it('cache-busts Foliate reader scripts so Android WebView cannot keep stale JS', () => {
    const genPath = fileURLToPath(
      new URL('../../../scripts/generate-reader-html.mjs', import.meta.url),
    );
    const gen = readFileSync(genPath, 'utf8');
    expect(gen).toContain('function readerAssetVersion');
    expect(gen).toContain('reader.js?v=${version}');
    expect(gen).toContain('bootstrap.js?v=${version}');
    expect(gen).toContain('public/foliate/fb2.js');
    expect(gen).toContain('WebView will keep stale JS');
    expect(gen).toContain('id="reader-restore-veil"');
  });
});
