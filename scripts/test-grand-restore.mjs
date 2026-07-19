/**
 * Playwright: «Гранд» opens at saved ~94%, not from start.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const fb2Path = process.env.GRAND_FB2_PATH
  ? path.resolve(process.env.GRAND_FB2_PATH)
  : path.join(root, '.tmp-grand/450324.fb2');
const port = 4179;
const bookId = '1:450324';
const storeKey = `inpx_offline_reader_${bookId}`;

const fb2Bytes = fs.readFileSync(fb2Path);
const savedStore = {
  positionVersion: 4,
  baseRevision: 0,
  serverRevision: 0,
  positionDirty: false,
  position: null,
  progress: 94,
  fraction: 0.94,
  fb2Href: null,
  bookmarks: [],
  annotations: [],
  positionChangedAt: '2026-07-12T10:00:00.000Z',
  updatedAt: '2026-07-12T10:00:00.000Z',
};

const TEST_HTML = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>Grand restore test</title></head>
<body style="margin:0;height:100vh">
<iframe id="r" style="width:100%;height:100%;border:0"></iframe>
<script>
const bookId = ${JSON.stringify(bookId)};
const storeKey = ${JSON.stringify(storeKey)};
const savedStore = ${JSON.stringify(savedStore)};
localStorage.setItem(storeKey, JSON.stringify(savedStore));
localStorage.setItem('INPX_READER_CONFIG', JSON.stringify({
  bookId, bookExt: 'fb2', bookTitle: 'Гранд', initialPosition: null,
  storageUri: 'file://test', localFileName: 'grand.fb2',
}));
let fb2Buf = null;
fetch('/grand.fb2').then(r => r.arrayBuffer()).then(b => { fb2Buf = b; });
window.addEventListener('message', async (e) => {
  if (e.data?.type !== 'inpx-reader-request-book-file') return;
  while (!fb2Buf) await new Promise(r => setTimeout(r, 50));
  const buf = fb2Buf.slice(0);
  e.source.postMessage({ type: 'inpx-reader-book-file', requestId: e.data.requestId, buffer: buf }, '*', [buf]);
});
document.getElementById('r').src = './inpx-reader/index.html?bookId=' + encodeURIComponent(bookId)
  + '&ext=fb2&frac=0.94&fb2=' + encodeURIComponent('11#2');
</script></body></html>`;

function server() {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/grand.fb2') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(fb2Bytes);
      return;
    }
    const file = urlPath === '/' || urlPath === '/test.html'
      ? null
      : path.join(distDir, urlPath.replace(/^\//, ''));
    if (!file) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(TEST_HTML);
      return;
    }
    if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('404'); return;
    }
    const ext = path.extname(file).toLowerCase();
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
}

const srv = server();
await new Promise((r) => srv.listen(port, r));

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()));
  page.on('pageerror', (error) => console.error('[browser-error]', error.message));
  await page.goto(`http://127.0.0.1:${port}/test.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const frame = page.frameLocator('#r');
  await frame.locator('foliate-view').waitFor({ state: 'attached', timeout: 120000 });
  await page.waitForTimeout(8000);

  const state = await frame.locator('#ft-seek').evaluate(async (seek) => {
    const location = document.querySelector('foliate-view')?.lastLocation;
    const { formatPositionProgressLabel, resolvePositionDisplayMeta } =
      await import('/inpx-reader/position-sync.js');
    const displayMeta = resolvePositionDisplayMeta({
      fraction: location?.fraction,
      sectionIndex: location?.section?.current,
      textOffset: location?.textOffset,
      textSectionLength: location?.textSectionLength,
    }, window.__READER_FB2_FLAT_TOC__);
    return {
      seek: seek ? Number(seek.value) : null,
      pct: document.getElementById('ft-pct')?.textContent || '',
      chapter: document.getElementById('ft-chapter')?.textContent || '',
      dialogChapter: displayMeta.chapterLabel || '',
      canonicalFraction: displayMeta.canonicalFraction ?? null,
      tocSection: window.__READER_FB2_FLAT_TOC__?.find(
        (entry) => entry.sectionIndex === location?.section?.current,
      ) || null,
      staleDialogLine: formatPositionProgressLabel(0.87, 87, displayMeta),
      cfi: location?.cfi || '',
      sectionIndex: location?.section?.current,
      textOffset: location?.textOffset,
      textQuote: location?.textQuote || '',
    };
  });
  console.log('after open:', state);

  if (state.seek == null) throw new Error('no seekbar');
  if (Math.abs(state.seek - 0.94) > 0.02) {
    throw new Error(`book-wide progress is ${state.seek}, expected ~0.94`);
  }
  if (!state.dialogChapter || state.dialogChapter !== state.chapter) {
    throw new Error(`dialog chapter "${state.dialogChapter}" differs from actual "${state.chapter}"`);
  }
  if (!state.staleDialogLine.startsWith(`${Math.round(state.seek * 100)}%`)) {
    throw new Error(`stale dialog fraction was not canonicalized: ${state.staleDialogLine}`);
  }
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(1200);
  const phoneState = await frame.locator('foliate-view').evaluate(async (view, anchor) => {
    await view.goToTextAnchor(anchor.sectionIndex, anchor.textOffset, anchor.textQuote);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return {
      fraction: Number(view.lastLocation?.fraction),
      text: String(view.lastLocation?.range?.toString?.() || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      visibleText: String(view.lastLocation?.range?.toString?.() || '').replace(/\s+/g, ' ').trim(),
    };
  }, state);
  console.log('same text anchor at phone viewport:', phoneState);
  const quoteProbe = String(state.textQuote).replace(/\s+/g, ' ').trim().slice(0, 32);
  if (!quoteProbe || !phoneState.visibleText.includes(quoteProbe)) {
    throw new Error(`exact text anchor is not visible at phone viewport: ${quoteProbe}`);
  }
  if (Math.abs(phoneState.fraction - 0.94) > 0.02) {
    throw new Error(`phone book-wide progress is ${phoneState.fraction}, expected ~0.94`);
  }
  const chapterChecks = await frame.locator('foliate-view').evaluate(async (view) => {
    const { resolvePositionDisplayMeta } = await import('/inpx-reader/position-sync.js');
    const toc = window.__READER_FB2_FLAT_TOC__ || [];
    const results = [];
    for (const chapterNumber of [3, 5, 9]) {
      const expected = toc.find((item) => String(item.label || '').startsWith(`Глава ${chapterNumber}.`));
      if (!expected) continue;
      await view.goTo(expected.href);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const location = view.lastLocation;
      const current = window.__READER_GET_CURRENT_POSITION__?.() || {};
      const meta = resolvePositionDisplayMeta({
        fraction: location?.fraction,
        sectionIndex: location?.section?.current,
        textOffset: location?.textOffset,
        textQuote: location?.textQuote,
        fb2Href: current.fb2Href,
      }, toc);
      results.push({ expected: expected.label, actual: meta.chapterLabel || '' });
    }
    return results;
  });
  for (const check of chapterChecks) {
    if (check.actual !== check.expected) {
      throw new Error(`exact anchor chapter "${check.actual}" differs from "${check.expected}"`);
    }
  }
  console.log('OK: restored above 50%');
} finally {
  if (browser) await browser.close();
  srv.close();
}
