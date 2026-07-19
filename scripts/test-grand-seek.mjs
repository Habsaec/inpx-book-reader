/**
 * Playwright: FB2 seekbar below 62% for «Гранд» (450324.fb2).
 * Serves dist/ + injects FB2 bytes into iframe reader (no server auth).
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
const port = 4178;

if (!fs.existsSync(fb2Path)) {
  console.error('Missing', fb2Path);
  process.exit(1);
}

const fb2Bytes = fs.readFileSync(fb2Path);

const TEST_HTML = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>Grand seek test</title></head>
<body style="margin:0;height:100vh;display:flex;flex-direction:column">
<div id="log" style="font:13px monospace;padding:6px;background:#222;color:#eee;max-height:28vh;overflow:auto"></div>
<iframe id="r" style="flex:1;border:0"></iframe>
<script>
const bookId = '1:450324';
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
document.getElementById('r').src = './inpx-reader/index.html?bookId=' + encodeURIComponent(bookId) + '&ext=fb2';
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
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };
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
  await page.goto(`http://127.0.0.1:${port}/test.html`, { waitUntil: 'networkidle', timeout: 60000 });
  const frame = page.frameLocator('#r');
  await frame.locator('foliate-view').waitFor({ timeout: 120000 });
  await page.waitForTimeout(4000);

  const before = await frame.locator('#ft-seek').evaluate((seek) => ({
    seek: seek ? Number(seek.value) : null,
    label: document.getElementById('ft-pct')?.textContent || '',
  }));
  console.log('loaded:', before);

  await frame.locator('#ft-seek').evaluate((seek) => {
    seek.value = '0.15';
    seek.dispatchEvent(new Event('input', { bubbles: true }));
    seek.dispatchEvent(new Event('pointerup', { bubbles: true }));
  });
  await page.waitForTimeout(3500);

  const after = await frame.locator('#ft-seek').evaluate((seek) => ({
    seek: seek ? Number(seek.value) : null,
    label: document.getElementById('ft-pct')?.textContent || '',
    chapter: document.getElementById('ft-chapter')?.textContent || '',
  }));
  console.log('after seek 15%:', after);

  if (after.seek == null) throw new Error('seekbar missing after test');
  if (after.seek >= 0.55) {
    throw new Error(`seek still at ${(after.seek * 100).toFixed(0)}% (expected ~15%)`);
  }
  console.log('OK: seekbar below 62%');
} finally {
  if (browser) await browser.close();
  srv.close();
}
