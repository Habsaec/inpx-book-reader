/**
 * Проверка цепочки «скачали → открыли»: parent WebView + iframe ридера.
 * Запуск: node scripts/verify-local-reader.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const port = 4177;

const MINI_FB2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info><book-title>Test Book</book-title><author><first-name>Test</first-name></author></title-info>
  </description>
  <body><section><title><p>Глава 1</p></title><p>Тестовый абзац для проверки читалки.</p></section></body>
</FictionBook>`;

const TEST_HTML = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>Local reader test</title></head>
<body style="margin:0;display:flex;flex-direction:column;height:100vh;">
<div id="status" style="padding:8px;font:14px sans-serif;background:#eef">Загрузка…</div>
<iframe id="reader" style="flex:1;border:0"></iframe>
<script>
const bookId = 'test-book-1';
const fb2Text = ${JSON.stringify(MINI_FB2)};
const fb2Bytes = new TextEncoder().encode(fb2Text);

localStorage.setItem('INPX_READER_CONFIG', JSON.stringify({
  bookId,
  bookExt: 'fb2',
  bookTitle: 'Test Book',
  initialPosition: null,
  storageUri: 'file://test-storage',
  localFileName: 'Author/Series/Test.fb2',
}));

window.addEventListener('message', (event) => {
  if (event.data?.type !== 'inpx-reader-request-book-file') return;
  const target = event.source;
  const buffer = fb2Bytes.buffer.slice(fb2Bytes.byteOffset, fb2Bytes.byteOffset + fb2Bytes.byteLength);
  target.postMessage({
    type: 'inpx-reader-book-file',
    requestId: event.data.requestId,
    buffer,
  }, '*', [buffer]);
});

const iframe = document.getElementById('reader');
iframe.src = './inpx-reader/index.html?bookId=' + encodeURIComponent(bookId) + '&ext=fb2';
iframe.addEventListener('load', () => {
  document.getElementById('status').textContent = 'iframe загружен, ждём книгу…';
});
</script>
</body>
</html>`;

function createServer() {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = urlPath === '/' || urlPath === '/test-local-reader.html'
      ? path.join(distDir, 'test-local-reader.html')
      : path.join(distDir, urlPath.replace(/^\//, ''));

    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found: ' + urlPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function main() {
  if (!fs.existsSync(distDir)) {
    console.error('dist/ не найден — сначала npm run build:app');
    process.exit(1);
  }

  fs.writeFileSync(path.join(distDir, 'test-local-reader.html'), TEST_HTML, 'utf8');

  const server = createServer();
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${port}/test-local-reader.html`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[page]', msg.text());
    });
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));

    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });

    const iframe = page.frameLocator('#reader');

    await iframe.locator('foliate-view, .reader-error, #reader-loading').first().waitFor({
      state: 'attached',
      timeout: 20000,
    });

    const errorVisible = await iframe.locator('.reader-error').isVisible().catch(() => false);
    if (errorVisible) {
      const errText = await iframe.locator('.reader-error-text').innerText();
      throw new Error('Ридер показал ошибку: ' + errText);
    }

    const loadingVisible = await iframe.locator('#reader-loading').isVisible().catch(() => false);
    if (loadingVisible) {
      throw new Error('Ридер завис на #reader-loading — файл не загрузился');
    }

    const hasView = await iframe.locator('foliate-view').count();
    if (!hasView) {
      throw new Error('foliate-view не появился');
    }

    const initOk = await page.evaluate(async () => {
      const frame = document.getElementById('reader');
      const win = frame?.contentWindow;
      if (!win?.__READER_LOCAL_INIT__) return { ok: false, reason: 'no __READER_LOCAL_INIT__' };
      try {
        const url = await win.__READER_LOCAL_INIT__;
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        return { ok: res.ok && buf.byteLength > 100, bytes: buf.byteLength, url: String(url).slice(0, 30) };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    });

    if (!initOk.ok) {
      throw new Error('__READER_LOCAL_INIT__ failed: ' + JSON.stringify(initOk));
    }

    console.log('OK: книга открылась локально');
    console.log('  - foliate-view отрендерен');
    console.log('  - blob файл:', initOk.bytes, 'байт');
    process.exitCode = 0;
  } catch (err) {
    console.error('FAIL:', err.message || err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main();
