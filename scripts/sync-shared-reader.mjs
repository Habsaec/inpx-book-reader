/**
 * Copy shared reader sync helpers from INPX Library Server into public/inpx-reader.
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.resolve(root, '../inpx-library-server');
const copies = [
  {
    src: path.join(serverRoot, 'public/position-sync.js'),
    dest: path.join(root, 'public/inpx-reader/position-sync.js'),
  },
];

const sharedSrcDir = path.join(serverRoot, 'public/reader-shared');
const sharedDestDir = path.join(root, 'public/inpx-reader/reader-shared');

if (!fs.existsSync(serverRoot)) {
  console.error('Missing INPX Library Server repo:', serverRoot);
  process.exit(1);
}

for (const { src, dest } of copies) {
  if (!fs.existsSync(src)) {
    console.error('Missing server file:', src);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Synced ${path.basename(src)} → ${path.relative(root, dest)}`);
}

if (!fs.existsSync(sharedSrcDir)) {
  console.error('Missing server reader-shared dir:', sharedSrcDir);
  process.exit(1);
}

fs.mkdirSync(sharedDestDir, { recursive: true });
for (const name of fs.readdirSync(sharedSrcDir)) {
  if (!name.endsWith('.js')) continue;
  const src = path.join(sharedSrcDir, name);
  const dest = path.join(sharedDestDir, name);
  fs.copyFileSync(src, dest);
  console.log(`Synced reader-shared/${name} → public/inpx-reader/reader-shared/${name}`);
}

const checksumPath = path.join(root, 'public/inpx-reader/.position-sync.sha256');
const hash = createHash('sha256').update(fs.readFileSync(copies[0].dest)).digest('hex');
fs.writeFileSync(checksumPath, `${hash}  position-sync.js\n`);
console.log('Wrote position-sync checksum:', hash.slice(0, 12) + '…');
