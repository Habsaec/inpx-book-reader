# /sync — Синхронизация shared assets с сервером

Выполни полный sync workflow для inpx-book-reader ↔ inpx-library-server.

## Шаги (выполни по порядку)

1. Убедись, что `D:\inpx-library-server` существует и актуален
2. Запусти из корня reader:

```bash
npm run sync:shared
```

Это выполнит: foliate sync → shared reader → verify checksum → reader position shadow → generate HTML.

Или по шагам:

3. Если менялся `position-sync.js` на сервере — прогони `npm test` в **обоих** репо
4. Сообщи результат: какие файлы синхронизированы, checksum OK или ошибка

## Если sync упал

- `Missing INPX Library Server repo` — проверь путь `../inpx-library-server`
- `checksum mismatch` — перезапусти `sync-shared-reader.mjs`, не правь `position-sync.js` в reader вручную

## Не делать

- Не редактировать `public/inpx-reader/position-sync.js` напрямую — только через sync с сервера
