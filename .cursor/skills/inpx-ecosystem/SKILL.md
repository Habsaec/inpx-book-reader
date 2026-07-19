---
name: inpx-ecosystem
description: Paired development workflow for INPX Book Reader and INPX Library Server — API-first, server-then-client, sync by bookId. Use for any feature, bug fix, or API change touching reader (D:\inpx-book-reader) or server (D:\inpx-library-server).
---

# INPX Ecosystem Workflow

## Projects

| Repo | Path | Stack |
|------|------|-------|
| Server | `D:\inpx-library-server` | Node ESM, Express, SQLite, vanilla JS |
| Reader | `D:\inpx-book-reader` | Capacitor 7, React 19, TypeScript, Android only |

## Golden Rules

1. **Server first** — find or add API before client work
2. **Paired changes** — API change = server route + `inpxClient.ts` + both AGENTS.md
3. **Sync by bookId** — position, bookmarks, annotations; not file path
4. **Metadata from index** — `GET /api/books/:id/meta`, not FB2 parsing
5. **Restart server** after new/changed routes
6. **Android only** — reader targets APK, browser is dev-only
7. **Independent Android UI** — mobile UX is NOT tied to server `/lite/` or web layout

## Task Checklist

```
- [ ] Server implementation found/added (src/routes/)
- [ ] API response format matches reader needs
- [ ] inpxClient.ts updated (if client-facing)
- [ ] position-sync.js synced if reader logic changed
- [ ] Tests pass (npm test in both repos)
- [ ] AGENTS.md updated in both repos
- [ ] Server restarted
```

## Key Entry Points

| Area | Server | Reader |
|------|--------|--------|
| REST API | `src/routes/browse-api.js`, `reader.js`, `user-api.js` | `src/lib/inpxClient.ts` |
| Position sync | `public/position-sync.js` | `public/inpx-reader/position-sync.js` |
| Android UI | — | `src/components/`, `src/ui/` (own mobile UX) |
| Local storage | — | `src/lib/bookStorage.ts`, `localDb.ts` |

## position-sync Change Flow

1. Edit `D:\inpx-library-server\public\position-sync.js`
2. Run tests on server: `npm test`
3. From reader: `node scripts/sync-shared-reader.mjs`
4. Verify: `node scripts/verify-position-sync.mjs`
5. Update tests in both repos
