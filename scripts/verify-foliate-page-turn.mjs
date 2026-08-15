/**
 * Fail the APK build if sync-foliate-assets copied a paginator without
 * the chapter-turn fix (numeric 0/1 must beat #textOffset).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paginator = fs.readFileSync(path.join(root, 'public/foliate/paginator.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'public/foliate/view.js'), 'utf8');
const reader = fs.readFileSync(path.join(root, 'public/inpx-reader/reader.js'), 'utf8');

const missing = [];
if (!paginator.includes('if (numericDest)')) missing.push('paginator.js: numericDest');
if (!paginator.includes('clearTextAnchor()')) missing.push('paginator.js: clearTextAnchor');
if (!paginator.includes('#beginSectionTurn(prev)')) missing.push('paginator.js: beginSectionTurn');
if (!view.includes("paginator.js?v=page-turn-1")) missing.push('view.js: paginator.js?v=page-turn-1');
if (!reader.includes("view.js?v=page-turn-1")) missing.push('reader.js: view.js?v=page-turn-1');

if (missing.length) {
  console.error('Foliate page-turn fix missing after sync:');
  for (const item of missing) console.error(' -', item);
  console.error('Patch D:\\inpx-library-server\\public\\foliate, then rebuild.');
  process.exit(1);
}

console.log('Foliate page-turn fix present (numericDest, page-turn-1)');
