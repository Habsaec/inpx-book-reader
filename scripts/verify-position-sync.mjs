/**
 * Fail build if public/inpx-reader/position-sync.js drifted from server without re-sync.
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appFile = path.join(root, 'public/inpx-reader/position-sync.js');
const checksumPath = path.join(root, 'public/inpx-reader/.position-sync.sha256');
const serverFile = path.resolve(root, '../inpx-library-server/public/position-sync.js');
const serverSharedDir = path.resolve(root, '../inpx-library-server/public/reader-shared');
const appSharedDir = path.join(root, 'public/inpx-reader/reader-shared');
const readerOnlyShared = new Set([
  'pending-position-revision.js',
  'android-position.js',
  'text-anchor.js',
]);

if (!fs.existsSync(appFile)) {
  console.error('Missing', appFile, '— run: node scripts/sync-shared-reader.mjs');
  process.exit(1);
}

const actual = createHash('sha256').update(fs.readFileSync(appFile)).digest('hex');

if (fs.existsSync(checksumPath)) {
  const expected = fs.readFileSync(checksumPath, 'utf8').trim().split(/\s+/)[0];
  if (expected !== actual) {
    console.error('position-sync.js checksum mismatch — run: node scripts/sync-shared-reader.mjs');
    process.exit(1);
  }
} else if (fs.existsSync(serverFile)) {
  const serverHash = createHash('sha256').update(fs.readFileSync(serverFile)).digest('hex');
  if (serverHash !== actual) {
    console.error('position-sync.js differs from server — run: node scripts/sync-shared-reader.mjs');
    process.exit(1);
  }
}

if (fs.existsSync(serverSharedDir) && fs.existsSync(appSharedDir)) {
  for (const name of fs.readdirSync(serverSharedDir)) {
    if (!name.endsWith('.js')) continue;
    const serverPath = path.join(serverSharedDir, name);
    const appPath = path.join(appSharedDir, name);
    if (!fs.existsSync(appPath)) {
      console.error(`Missing reader-shared/${name} — run: node scripts/sync-shared-reader.mjs`);
      process.exit(1);
    }
    const serverHash = createHash('sha256').update(fs.readFileSync(serverPath)).digest('hex');
    const appHash = createHash('sha256').update(fs.readFileSync(appPath)).digest('hex');
    if (serverHash !== appHash) {
      console.error(`reader-shared/${name} checksum mismatch — run: node scripts/sync-shared-reader.mjs`);
      process.exit(1);
    }
  }
  const syncedCount = fs.readdirSync(serverSharedDir).filter((name) => name.endsWith('.js')).length;
  console.log(`reader-shared checksum OK (${syncedCount} server modules)`);
  const readerOnly = fs.readdirSync(appSharedDir).filter((name) => name.endsWith('.js') && readerOnlyShared.has(name));
  if (readerOnly.length) {
    console.log(`reader-only shared modules: ${readerOnly.join(', ')}`);
  }
}

console.log('position-sync.js checksum OK');
