/**
 * Guard against positionFromLocation import shadowing (Maximum call stack size exceeded).
 * Safe: import { positionFromLocation as sharedPositionFromLocation } + local wrapper.
 * Unsafe: import { positionFromLocation } + local function positionFromLocation calling fb2PositionFromLocation.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const files = [
  path.join(root, 'public/inpx-reader/reader.js'),
  path.resolve(root, '../inpx-library-server/public/reader.js'),
].filter((f) => fs.existsSync(f));

let failed = false;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const hasAlias = /positionFromLocation\s+as\s+sharedPositionFromLocation/.test(src);
  const hasLocalWrapper = /function\s+positionFromLocation\s*\(/.test(src);
  const fb2CallsBareImport = /function\s+fb2PositionFromLocation[\s\S]{0,120}return\s+positionFromLocation\s*\(/.test(src);
  const selfRecurses = /function\s+positionFromLocation\s*\([^)]*\)\s*\{[\s\S]{0,80}return\s+positionFromLocation\s*\(/.test(src);

  if (selfRecurses) {
    console.error(`FAIL ${path.relative(root, file)}: positionFromLocation calls itself — infinite recursion`);
    failed = true;
  } else if (hasLocalWrapper && fb2CallsBareImport && !hasAlias) {
    console.error(`FAIL ${path.relative(root, file)}: positionFromLocation import is shadowed — use sharedPositionFromLocation alias`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('reader positionFromLocation shadow check OK');
