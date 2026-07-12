/**
 * E2E smoke: offline sync flow outline (run against dev server manually).
 * npm run test:e2e
 */
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const title = await page.title();
  if (!title) throw new Error('App did not load');
  console.log('E2E smoke OK:', title);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
