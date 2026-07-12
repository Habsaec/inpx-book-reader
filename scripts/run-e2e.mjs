/**
 * Cross-platform E2E runner (Windows-friendly).
 *
 * Starts a Vite dev server, waits until the port responds, runs e2e/offline-sync.mjs,
 * then stops the server. The smoke test only needs the SPA shell (no INPX server).
 *
 * Env:
 *   E2E_PORT — dev server port (default 5173)
 *   E2E_BASE_URL — override base URL passed to the test
 *
 * Requires: npm install (playwright-core is a devDependency; Chromium must be available
 * to playwright-core — install via `npx playwright install chromium` if launch fails).
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.E2E_PORT) || 5173;
const baseUrl = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;

function waitForPort(targetPort, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(`http://127.0.0.1:${targetPort}/`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for http://127.0.0.1:${targetPort}/`));
          return;
        }
        setTimeout(probe, 400);
      });
      req.setTimeout(2_000, () => {
        req.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for http://127.0.0.1:${targetPort}/`));
          return;
        }
        setTimeout(probe, 400);
      });
    };
    probe();
  });
}

function runNode(script, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

const isWin = process.platform === 'win32';
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(
  process.execPath,
  [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, BROWSER: 'none' },
  },
);

let stopping = false;
const stopServer = () => {
  if (stopping) return;
  stopping = true;
  if (!server.killed) {
    if (isWin) {
      spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      server.kill('SIGTERM');
    }
  }
};

process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopServer();
  process.exit(143);
});

try {
  await waitForPort(port);
  await runNode(path.join(root, 'e2e', 'offline-sync.mjs'), { E2E_BASE_URL: baseUrl });
  console.log('E2E runner finished OK');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  stopServer();
}
