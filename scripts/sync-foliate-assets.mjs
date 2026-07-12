/**
 * Copy foliate engine from INPX Library Server into public/foliate (APK + dev).
 * Does NOT overwrite public/inpx-reader/reader.js — app reader has Android-specific code.
 */
import fs from 'fs';
import path from 'path';
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

copyDir(src, dest);
console.log('Synced foliate assets from inpx-library-server → public/foliate');
