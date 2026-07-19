#!/usr/bin/env node
/** afterFileEdit — position-sync or sync-related files edited */
const fs = require('fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const file = (input.file_path || input.filePath || '').replace(/\\/g, '/');

const SYNC_FILES = /position-sync|syncMerge|syncConflicts|positionRevision/i;

if (SYNC_FILES.test(file)) {
  process.stdout.write(JSON.stringify({
    additional_context: [
      '⚠️ Position-sync файл изменён.',
      '1. Если меняли server position-sync.js — запусти: node scripts/sync-shared-reader.mjs',
      '2. Проверь: node scripts/verify-position-sync.mjs',
      '3. npm test в обоих репо',
      '4. Обнови AGENTS.md в обоих репо',
    ].join('\n'),
  }));
} else {
  process.stdout.write('{}');
}
