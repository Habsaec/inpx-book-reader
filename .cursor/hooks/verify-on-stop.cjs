#!/usr/bin/env node
/** stop — remind verification for reader project */
const fs = require('fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const edited = input.edited_files || input.editedFiles || [];
const loop = input.loop_count || input.loopCount || 0;

if (edited.length === 0 || loop >= 1) {
  process.stdout.write('{}');
  process.exit(0);
}

const hasSync = edited.some((f) => /position-sync|syncMerge|syncConflicts/i.test(f));
const hasClient = edited.some((f) => /inpxClient/i.test(f));

const lines = ['Перед завершением (inpx-book-reader):'];
lines.push('- npm run lint && npm test');

if (hasSync) {
  lines.push('- node scripts/sync-shared-reader.mjs && node scripts/verify-position-sync.mjs');
}
if (hasClient || hasSync) {
  lines.push('- AGENTS.md обновлён в обоих репо');
  lines.push('- Сервер перезапущен если менялись routes');
}

lines.push('- Кратко: что изменилось и как проверить на Android');

process.stdout.write(JSON.stringify({ followup_message: lines.join('\n') }));
