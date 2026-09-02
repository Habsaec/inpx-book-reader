import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readPublic(rel: string) {
  return readFileSync(fileURLToPath(new URL(`../../../public/${rel}`, import.meta.url)), 'utf8');
}

function sliceFn(source: string, start: string, end: string) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThan(a);
  return source.slice(a, b);
}

describe('reading gestures do not steal the page', () => {
  it('edge brightness/warmth wait for a real swipe before eating taps', () => {
    const source = readPublic('inpx-reader/reader.js');
    const brightnessStart = sliceFn(source, 'function onBrightnessTouchStart', 'function onBrightnessTouchMove');
    const brightnessEnd = sliceFn(source, 'function onBrightnessTouchEnd', 'function wireBrightnessEdge');
    const warmthStart = sliceFn(source, 'function onWarmthTouchStart', 'function onWarmthTouchMove');
    const warmthEnd = sliceFn(source, 'function onWarmthTouchEnd', 'function wireWarmthEdge');

    expect(brightnessStart).not.toContain('suppressBookGesture = true');
    expect(warmthStart).not.toContain('suppressBookGesture = true');
    expect(brightnessEnd).not.toContain('else if (suppressBookGesture)');
    expect(warmthEnd).not.toContain('else if (suppressBookGesture)');
    expect(source).toContain('function beginLightAdjust() {\n    suppressBookGesture = true;');
  });

  it('a short tap preventDefault so Foliate cannot snap the same lift', () => {
    const reader = readPublic('inpx-reader/reader.js');
    const paginator = readPublic('foliate/paginator.js');
    const tapEnd = sliceFn(reader, '/* Короткий тап: только preventDefault', 'doc.addEventListener(\'touchcancel\'');
    expect(tapEnd).toContain('e.preventDefault();\n      runTapAction(action);');

    const onEnd = sliceFn(paginator, '#onTouchEnd(e) {', '#getRectMapper()');
    const prevented = onEnd.indexOf('if (e?.defaultPrevented) return');
    const snap = onEnd.indexOf('this.snap(');
    expect(prevented).toBeGreaterThanOrEqual(0);
    expect(snap).toBeGreaterThan(prevented);
  });

  it('still offers a cross-device jump dialog if sync lands after the veil', () => {
    const bootstrap = readPublic('inpx-reader/bootstrap.js');
    const seed = sliceFn(
      bootstrap,
      'if (merged.pendingCrossDevicePrompt) {',
      'const restoring = document.documentElement.classList.contains(\'is-restoring-position\');',
    );
    expect(seed).toContain('positionPromptResolved = false');
    expect(seed).toContain('maybeShowDeferredCrossDevicePrompt');
    expect(seed).not.toContain('if (restoring)');
  });

  it('accepted cross-device restore stamps a fresh positionChangedAt', () => {
    const bootstrap = readPublic('inpx-reader/bootstrap.js');
    const apply = sliceFn(
      bootstrap,
      'function applyPendingServerSnapshot(store)',
      'function dismissPendingServerSnapshot(store)',
    );
    expect(apply).toContain('store.positionChangedAt = new Date().toISOString()');
    expect(apply).toContain('window.__READER_GET_CURRENT_POSITION__');
    expect(apply).not.toContain('store.positionChangedAt = store.serverPositionUpdatedAt');
  });

  it('chrome toggle does not resize the reading box', () => {
    const css = readPublic('inpx-reader/reader.css');
    expect(css).toContain('#reader-body{\n  position:fixed;\n  top:var(--r-safe-top);\n  right:var(--r-safe-right);');
    expect(css).toContain('bottom:max(var(--r-safe-bottom), var(--r-status-h));');
    expect(css).not.toMatch(/#reader-body\{[^}]*bottom:var\(--r-bottom-reserve\)/);
    expect(css).toContain('transform:translateY(calc(100% + var(--r-status-h) + 8px))');
  });

  it('does not treat pinch as a safe-area / column resize', () => {
    const bootstrap = readPublic('inpx-reader/bootstrap.js');
    const apply = sliceFn(bootstrap, 'function applySafeArea(insets)', 'function readerDataKey');
    expect(apply).toContain('if (unchanged) return');
    expect(apply).toContain('Number(window.visualViewport.scale) > 1.01');

    const parent = readFileSync(
      fileURLToPath(new URL('../../../src/components/FoliateReader.tsx', import.meta.url)),
      'utf8',
    );
    expect(parent).not.toContain('visualViewport?.addEventListener(\'resize\'');
  });

  it('does not jump to a seed position after the book is shown', () => {
    const reader = readPublic('inpx-reader/reader.js');
    const restore = sliceFn(reader, 'window.__READER_RESTORE_SAVED__ = async (saved', '(async () => {');
    expect(restore).toContain('if (!opts?.force && !document.documentElement.classList.contains(\'is-restoring-position\')) return false');
    expect(restore).toContain('restoreReadingPosition(saved, null, { ignoreUrl: true })');
    expect(restore).not.toContain('if (!alreadyVeiled) setRestoreVeil(true)');
  });

  it('does not rewrite the column strip when expand size is unchanged', () => {
    const paginator = readPublic('foliate/paginator.js');
    expect(paginator).toContain('#lastExpandedSize = NaN');
    expect(paginator).toContain('if (this.#lastExpandedSize === expandedSize');
    expect(paginator).toContain('if (Number(globalThis.visualViewport?.scale) > 1.01) return');
  });

  it('does not re-paginate while dragging a color picker', () => {
    const reader = readPublic('inpx-reader/reader.js');
    const textIn = sliceFn(reader, 'textColorInput.addEventListener(\'input\'', 'textColorDefaultBtn');
    const bgIn = sliceFn(reader, 'bgColorInput.addEventListener(\'input\'', 'bgColorDefaultBtn');
    const linkIn = sliceFn(reader, 'linkColorInput.addEventListener(\'input\'', 'linkColorDefaultBtn');
    expect(textIn).toContain('applyBookStyles()');
    expect(textIn).not.toContain('applySettings()');
    expect(bgIn).toContain('applyBookStyles()');
    expect(bgIn).not.toContain('applySettings()');
    expect(linkIn).toContain('applyBookStyles()');
    expect(linkIn).not.toContain('applySettings()');
  });
});
