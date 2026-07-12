/**
 * ⚠️ ВНИМАНИЕ: Этот файл — ТОЛЬКО для локальной разработки в браузере.
 * 
 * В production (Android APK) приложение работает НАПРЯМУЮ с INPX Library Server
 * через CapacitorHttp. Этот прокси НЕ используется в мобильном приложении.
 * 
 * ❌ НЕ НУЖНО:
 * - Улучшать этот файл
 * - Добавлять новые endpoint'ы
 * - Исправлять SSRF-уязвимости (для localhost-разработки не критично)
 * - Оптимизировать прокси
 * - Добавлять CORS-заголовки
 * 
 * 📱 Приложение разрабатывается ТОЛЬКО для Android.
 * 
 * @see docs/ANDROID.md
 * @see AGENTS.md
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = Number(process.env.PORT) || 3100;

const DATA_DIR = path.join(process.cwd(), 'data', 'sync');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

app.get('/api/sync/:key', (req, res) => {
  const cleanKey = req.params.key.replace(/[^a-zA-Z0-9_-]/g, '').trim().toLowerCase();
  if (!cleanKey) return res.status(400).json({ error: 'Неверный ключ синхронизации' });

  const filePath = path.join(DATA_DIR, `${cleanKey}.json`);
  if (!fs.existsSync(filePath)) {
    return res.json({ progressList: [], bookmarks: [], highlights: [], updatedAt: 0 });
  }
  try {
    res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  } catch {
    res.status(500).json({ error: 'Ошибка чтения данных синхронизации' });
  }
});

app.post('/api/sync/:key', (req, res) => {
  const cleanKey = req.params.key.replace(/[^a-zA-Z0-9_-]/g, '').trim().toLowerCase();
  if (!cleanKey) return res.status(400).json({ error: 'Неверный ключ синхронизации' });

  const syncData = req.body;
  if (!syncData || typeof syncData !== 'object') {
    return res.status(400).json({ error: 'Неверный формат данных' });
  }
  const filePath = path.join(DATA_DIR, `${cleanKey}.json`);
  try {
    syncData.updatedAt = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(syncData, null, 2), 'utf-8');
    res.json({ success: true, updatedAt: syncData.updatedAt });
  } catch {
    res.status(500).json({ error: 'Ошибка сохранения данных синхронизации' });
  }
});

async function forwardProxy(req: express.Request, res: express.Response) {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Параметр url обязателен' });
  }

  try {
    const parsedUrl = new URL(targetUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Разрешены только http и https протоколы' });
    }

    const headers: Record<string, string> = {
      Accept: req.headers.accept || '*/*',
      'User-Agent': 'INPX-Book-Reader/1.0',
    };

    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization as string;
    } else if (req.headers['x-proxy-authorization']) {
      headers.Authorization = req.headers['x-proxy-authorization'] as string;
    }

    const method = req.method.toUpperCase();
    const init: RequestInit = { method, headers };

    if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined) {
      headers['Content-Type'] = req.headers['content-type'] || 'application/json';
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const fetchResponse = await fetch(targetUrl, init);

    if (!fetchResponse.ok && fetchResponse.status !== 401) {
      const errText = await fetchResponse.text().catch(() => '');
      return res.status(fetchResponse.status).json({
        error: `Сервер INPX вернул ${fetchResponse.status}`,
        details: errText.slice(0, 200),
      });
    }

    const contentType = fetchResponse.headers.get('content-type') || '';
    if (contentType) res.setHeader('Content-Type', contentType);

    const isBinary =
      contentType.startsWith('image/') ||
      contentType.includes('application/octet-stream') ||
      contentType.includes('application/zip') ||
      contentType.includes('application/epub') ||
      contentType.includes('fb2') ||
      targetUrl.includes('/content') ||
      targetUrl.includes('/cover');

    if (isBinary) {
      const buffer = Buffer.from(await fetchResponse.arrayBuffer());
      return res.status(fetchResponse.status).send(buffer);
    }

    const text = await fetchResponse.text();
    res.status(fetchResponse.status).send(text);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Proxy error:', targetUrl, message);
    res.status(500).json({ error: `Ошибка соединения с INPX: ${message}` });
  }
}

app.get('/api/proxy', forwardProxy);
app.post('/api/proxy', forwardProxy);
app.put('/api/proxy', forwardProxy);
app.patch('/api/proxy', forwardProxy);
app.delete('/api/proxy', forwardProxy);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`INPX Reader: http://localhost:${PORT}`);
    console.log(`Для Android в той же Wi‑Fi сети: http://<IP-этого-ПК>:${PORT}`);
  });
}

startServer();
