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
const fb2Path = path.join(root, '.tmp-grand/450324.fb2');
const port = 4179;
const bookId = '1:450324';
const storeKey = `inpx_offline_reader_${bookId}`;

const fb2Bytes = fs.readFileSync(fb2Path);
const savedStore = {
  position: 'epubcfi(/6/42!/4/2/1:0)',
  progress: 94,
  fraction: 0.94,
  fb2Href: '11#2',
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
    res.writeHead(200);
    res.end(fs.readFileSync(file));
  });
}

const srv = server();
await new Promise((r) => srv.listen(port, r));

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/test.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const frame = page.frameLocator('#r');
  await frame.locator('foliate-view').waitFor({ timeout: 120000 });
  await page.waitForTimeout(8000);

  const state = await frame.locator('#ft-seek').evaluate((seek) => ({
    seek: seek ? Number(seek.value) : null,
    pct: document.getElementById('ft-pct')?.textContent || '',
    chapter: document.getElementById('ft-chapter')?.textContent || '',
  }));
  console.log('after open:', state);

  if (state.seek == null) throw new Error('no seekbar');
  if (state.seek < 0.5) {
    throw new Error(`opened at ${(state.seek * 100).toFixed(0)}%, expected ~94%`);
  }
  console.log('OK: restored above 50%');
} finally {
  if (browser) await browser.close();
  srv.close();
}
