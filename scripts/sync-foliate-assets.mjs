/**
 * Copy foliate engine from INPX Library Server into public/foliate (APK + dev).
 * Does NOT overwrite public/inpx-reader/reader.js — app reader has Android-specific code.
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.resolve(root, '../inpx-library-server');
const src = path.join(serverRoot, 'public/foliate');
const dest = path.join(root, 'public/foliate');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

if (!fs.existsSync(src)) {
  console.error('Missing server foliate:', src);
  process.exit(1);
}

// Destination is generated output. Prune it first so removed/renamed upstream
// modules cannot survive in the APK (previously public/foliate/foliate did).
fs.rmSync(dest, { recursive: true, force: true });
copyDir(src, dest);

function filesUnder(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(absolute, base));
    else out.push(path.relative(base, absolute).replaceAll('\\', '/'));
  }
  return out.sort();
}

const sourceFiles = filesUnder(src);
const destinationFiles = filesUnder(dest);
if (JSON.stringify(sourceFiles) !== JSON.stringify(destinationFiles)) {
  throw new Error('Foliate asset file list differs after sync');
}
for (const relative of sourceFiles) {
  const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (hash(path.join(src, relative)) !== hash(path.join(dest, relative))) {
    throw new Error(`Foliate asset checksum mismatch: ${relative}`);
  }
}

console.log('Synced foliate assets from inpx-library-server → public/foliate');
console.log(`Verified ${sourceFiles.length} Foliate assets; destination contains no orphans`);
