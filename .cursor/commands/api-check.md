# /api-check — Проверка паритета API server ↔ reader

Проверь, что Android-клиент и сервер согласованы по API.

## Шаги

1. Запусти скрипт из корня reader:

```bash
node scripts/verify-api-parity.mjs
```

2. Если exit code ≠ 0 — разбери каждый пункт:
   - **client-only** — endpoint в `inpxClient.ts`, но нет route на сервере → баг клиента или устаревший код
   - **undocumented** — route есть, но не в AGENTS.md reader → обнови документацию

3. Вручную сверь недавние изменения:
   - Server routes: `D:\inpx-library-server\src\routes/`
   - Client: `src/lib/inpxClient.ts`
   - Docs: `AGENTS.md` в обоих репо

4. Для каждого расхождения укажи: файл, endpoint, рекомендуемое действие

## Критичные client endpoints (должны существовать на сервере)

- `/api/profile`, `/api/catalog`, `/api/search/suggest`
- `/api/books/:id/meta`, `/content`, `/cover`, `/cover-thumb`, `/details`
- `/api/books/:id/position` (GET/POST, CAS v4)
- `/api/books/:id/bookmarks`, `/annotations`
- `/api/reader-activity-sync-meta`, `/api/reading-history/:id`
- `/api/shelves`, `/api/favorites`, `/api/bookmarks`
- `/api/settings/ui`, `/health`

## После исправлений

- Server: `npm test`, restart
- Reader: `npm test`, `npm run lint`
