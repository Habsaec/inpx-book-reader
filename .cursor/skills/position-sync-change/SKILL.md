---
name: position-sync-change
description: Safely changes reading position sync logic shared between server and Android reader. Use when editing position-sync.js, syncMerge, syncConflicts, positionRevision, or position API endpoints.
disable-model-invocation: true
---

# Position Sync Change Protocol

## Files (touch in order)

1. `D:\inpx-library-server\public\position-sync.js` — **edit here first**
2. `D:\inpx-library-server\src\routes\reader.js` — API if needed
3. `D:\inpx-book-reader\public\inpx-reader\position-sync.js` — **copy only**, via sync script
4. `D:\inpx-book-reader\src\lib\syncMerge.ts`, `syncConflicts.ts`, `positionRevision.ts`

## Steps

1. Read current contract in both `AGENTS.md` (position table)
2. Implement change on server JS
3. `cd D:\inpx-library-server && npm test`
4. `cd D:\inpx-book-reader && node scripts/sync-shared-reader.mjs`
5. `node scripts/verify-position-sync.mjs`
6. Update reader TS if merge/conflict logic changed
7. `npm test` in reader
8. Update position table in **both** AGENTS.md

## CAS Rules (do not break)

- `positionVersion: 4` required
- `baseRevision` on POST
- `409` on stale write, `428` on legacy client

## Verify Scripts

```bash
# reader
node scripts/verify-position-sync.mjs
node scripts/verify-reader-position-shadow.mjs
```
