#!/usr/bin/env node
/** afterFileEdit — inpxClient.ts edited */
const fs = require('fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const file = (input.file_path || input.filePath || '').replace(/\\/g, '/');

if (file.includes('inpxClient.ts')) {
  process.stdout.write(JSON.stringify({
    additional_context: [
      'inpxClient.ts изменён.',
      'Проверь: endpoint существует на сервере (D:\\inpx-library-server\\src\\routes\\).',
      'Обнови AGENTS.md в обоих репо. npm test && npm run lint.',
    ].join('\n'),
  }));
} else {
  process.stdout.write('{}');
}
