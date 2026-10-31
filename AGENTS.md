# INPX Book Reader — Контекст проекта

## 🎯 Назначение

**Мобильная читалка для Android** — клиентская часть экосистемы INPX Library Server.

## ⚡ Контракт разработки (не забывать)

> **Приложение разрабатывается исключительно для Android.** iOS, десктоп и веб как продукт не учитываем.
> **Приложение и сервер — единая экосистема.** Любая задача выполняется с учётом обоих репозиториев.

| Принцип | Суть |
|---------|------|
| **Только Android** | APK + Capacitor + нативные плагины; браузер — только dev-отладка, не целевая платформа |
| **Чтение** | Только локальный файл после скачивания; сервер — каталог, метаданные, sync, не стриминг контента |
| API-first | Метаданные и sync — только через `/api/*` сервера, не из FB2/локальных эвристик |
| Парность изменений | Новый endpoint на сервере → `inpxClient.ts` + UI; новая фича в reader → endpoint на сервере |
| **Паритет функций — всегда** | Любая новая пользовательская функция делается **в одной задаче** на сайте **и** в приложении (API + `inpxClient.ts` + экран + оба `AGENTS.md`). «Потом в приложение» не бывает; только админка и серверная внутрянка — веб-только, и это говорится явно |
| Sync по `bookId` | Позиция, закладки, заметки синхронизируются; путь файла на диске — snapshot при скачивании |
| Серия и путь | `GET /api/books/:id/meta` → `seriesList` из INPX-индекса → `bookStorage.ts`. `Book.series` — lookup-ключ (lowercase, для навигации/фасетов), `Book.seriesDisplay` — человекочитаемое имя из `seriesList[].displayName`; в UI выводить через `seriesLabel(book)` (`src/lib/seriesLabel.ts`) |
| Перезапуск сервера | После новых routes в `inpx-library-server` |

Cursor rules: `.cursor/rules/android-only.mdc`, `.cursor/rules/unified-ecosystem.mdc` (always apply).

### Единая экосистема с сервером

Проект разрабатывается в тесной интеграции с **[INPX Library Server](D:\inpx-library-server)**:

```
┌─────────────────────────────────────────────────────────────┐
│                  INPX ECOSYSTEM                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Book Reader     │◄───────►│  Library Server  │         │
│  │  (Android APK)   │  REST   │  (Node.js)       │         │
│  │                  │  API    │                  │         │
│  └──────────────────┘         └──────────────────┘         │
│         ▲                              ▲                     │
│         │                              │                     │
│         │    ┌──────────────────┐     │                     │
│         └────│  Web Interface   │─────┘                     │
│              │  (Browser UI)    │                           │
│              └──────────────────┘                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Ключевые принципы:**

1. **Единый API и данные** — те же endpoint'ы, sync, метаданные через `/api/*`
2. **Полная совместимость API** — использование endpoint'ов сервера (`/api/profile`, `/api/library/*`, `/api/catalog`, и т.д.)
3. **Синхронизация данных** — прогресс чтения, закладки, заметки, избранное синхронизируются с сервером
4. **Самостоятельный Android UI** — мобильный интерфейс проектируется под Android; **не привязан** к `/lite/` или веб-вёрстке сервера

---

## 📦 Связанные проекты

| Проект | Репозиторий | Назначение |
|--------|-------------|------------|
| **INPX Library Server** | `D:\inpx-library-server` | Серверная часть, API, веб-интерфейс |
| **INPX Book Reader** | `D:\inpx-book-reader` | Мобильная читалка (Android) |

При разработке всегда учитывать изменения в серверной части и поддерживать обратную совместимость.

---

## 🔗 Интеграция с INPX Library Server

### API Endpoint'ы сервера

Приложение использует следующие endpoint'ы INPX Library Server:

#### Аутентификация и профиль
- `GET /api/profile` — данные профиля пользователя (`user.email` — email аккаунта, additive; `userStats.wantCount` — «Хочу прочитать», additive; `userStats.smartShelvesCount` — умные полки, additive: «Полки» в профиле = `shelvesCount + smartShelvesCount`)
- `GET /api/account-email` / `POST /api/account-email` (`{ email }`, пусто = очистить) — email аккаунта `users.email`; 400 `PROFILE_INVALID_EMAIL`, 409 `PROFILE_EMAIL_TAKEN`. Отдельно от `GET/POST /api/ereader-email`
- `POST /api/auth/device` — выдать device token (Android, после Basic Auth)
- `DELETE /api/auth/device/:tokenId` — отозвать device token
- `POST /api/auth/pairing` — создать одноразовый QR pairing-код (на сайте; пароль не включается)
- `POST /api/auth/pairing/redeem` — обменять pairing `code` на device Bearer (`deviceToken`, `username`, `serverUrl`); вход через «Сканировать QR» в онбординге и настройках
- `GET /api/favorites` — избранные авторы и серии (`authors`: `name`, `displayName`, `bookCount`, `coverBookId`; `series`: `name`, `displayName`, `bookCount`, `previewBookIds`)
- `POST /api/favorites/authors` — добавить/удалить автора в избранное
- `POST /api/favorites/series` — добавить/удалить серию в избранное

#### Библиотека и каталог
- `GET /api/library/recent` — новинки по дате INPX (`date`, окно 30 дней от самой свежей даты в каталоге), не весь каталог и не штамп переиндексации; additive filters как у каталога: `genre` (CSV/repeated, OR), `lang`, `format`, `year`, `minRate`, `hasSeries` (1/0)
- `GET /api/library/continue` — продолжить чтение
- `GET /api/library/read` — прочитанные книги
- `GET /api/library/recommended` — рекомендации; те же additive filters (`genre`, `format`, `year`, `minRate`, `hasSeries`) поверх персонального пула
- `GET /api/library/want` — «Хочу прочитать» (как `read`; `sort=recent|title|author|rating`). Книга уходит из списка сама, когда её открыли (`POST /api/reading-history/:id`) или отметили прочитанной. В приложении: действие «Хочу прочитать / Отложено» в карточке книги (`BookDetailsSheet`, скрыто для прочитанной), сегмент «Хочу прочитать» в «Моих книгах», набор `wantIds` в `useInpxServer` (старый сервер без маршрута → набор пустой, синхронизация не падает)
- `GET /api/library/following` — «Новое у любимых»: непрочитанные книги избранных авторов и серий за 90 дней по дате INPX, новые сверху, без фильтров. В приложении: секция на Главной после «Рекомендаций» (только если есть книги; 404 старого сервера = скрыта), «Все» → `LibrarySectionPanel view="following"` без фильтров
- `GET /api/series-progress?name=` — `{ total, read, next: { id, title, seriesNo } | null }`: тома (издания одного тома считаются один раз), книги без номера в конце. В приложении: блок «Прочитано N из M» + «Начать читать / Читать следующую» на экране серии (`CatalogDrilldownPanel`), обновляется при изменении отметок «прочитано»; 404 → блок скрыт
- `GET /api/catalog` — поиск/просмотр каталога (без `q` тоже отдаёт книги); additive filters: `genre` (CSV/repeated, OR — хотя бы один), `lang`, `format`, `year`, `minRate`, `hasSeries` (1/0)
- `GET /api/search?q=` — totals разделов `{ books, authors, series, preferredField?, routeField: null }`; drilldown через `/api/catalog?field=`; веб Enter всегда открывает книги с чипами Авторы/Серии (без hub / smart redirect)
- `GET /api/search/genres?q=` — жанры среди книг текущей выдачи (фасет для фильтра; опционально format/year/minRate/hasSeries)
- `GET /api/search/suggest` — подсказки поиска (книги/авторы/серии); тап по автору/серии открывает страницу сущности (`name` из suggest), а не поиск книг
- `GET /api/catalog` — при пустой/слабой выдаче может быть additive `searchHints` (`tip`, `didYouMean`, `weak?`)
- `GET /api/browse/authors` — список авторов
- `GET /api/browse/authors/:value/grouped` — серии автора + `standaloneBooks` + `books[]` в каждой серии (режим списка как на веб); `lean=1` — только сводки серий без книг
- `GET /api/browse/series` — список серий
- `GET /api/browse/genres` — список жанров
- `GET /api/facet-books` — книги по фасету (автор/серия/жанр); additive filters: `genre` (CSV/repeated, OR), `format`, `year`, `minRate`, `hasSeries` (1/0), `lang`; страница серии — «Скачать серию» ставит в очередь все недостающие книги (не ZIP), потолок ~500

#### Книги и контент
- `GET /api/books/:id/meta` — метаданные из INPX-индекса (`seriesList`, автор, жанры) — **источник правды для скачивания и путей на диске**
- `GET /api/books/:id/content` — скачать книгу
  - ID с NUL/control-символами (Flibusta): путь `/api/books/b64/<base64url>/content` (см. `bookRef.ts` / серверный `book-ref.js`), иначе HTTP 400
- `GET /api/books/:id/cover` — обложка (full)
- KOReader (KOSync на сервере): книга, скачанная через сервер и читаемая в KOReader, сама попадает в «Читаю» с процентом KOReader (`readProgress` в `/api/library/continue` и `recentBooks` `/api/profile` = максимум из своего ридера и KOReader), на 99% — в «Прочитано»; приложение подхватывает это по `readingHistoryRev` без своего кода. Локальный прогресс скачанной в приложение книги по-прежнему важнее серверного
- `GET /api/books/:id/cover-thumb` — обложка (миниатюра). Для книг в `.7z` сервер не распаковывает FB2 ради миниатюры (solid 7z иначе подвешивает HTTP). Таймаут портрета/обложки не считается потерей связи с сервером. В режиме E-Ink (`html[data-eink="1"]`, `isEinkDatasetActive()`) `coverUrl` / `fetchCoverBlob` просят `?hd=1` — миниатюру вдвое крупнее (на ~300 ppi обычная 220×320 растягивается и выглядит мутной); кэш `coverCache` для неё отдельный (тег `thumbhd`: память, IDB, `covers/<id>_thumbhd.jpg`), переключение режима просто перезагружает обложки
- `GET /api/books/:id/details` — детали книги
- `GET /api/books/:id/review` — рецензия на книгу
- `GET /api/authors/portrait` — портрет автора

#### Закладки и прогресс
- `GET /api/bookmarks` — список закладок
- `POST /api/bookmarks/:id` — добавить/удалить закладку
- `POST /api/want/:id` — переключить «Хочу прочитать» → `{ want }`; `DELETE /api/want/:id` — убрать (идемпотентно); id с NUL/control-символами — `/api/want/b64/<ref>` (`apiWantPath`)
- `POST /api/read/:id` — переключить отметку «прочитано»
- `POST /api/read/batch` — идемпотентно поставить «прочитано» (`ids`)
- `DELETE /api/read/:id` — идемпотентно снять «прочитано» (нет отметки — тоже `{ read: false }`)
- `GET /api/books/:id/position` — позиция чтения (`position`, `progress`, `fraction`, `fb2Href`, `sectionIndex`, `textOffset`, `textQuote`, `textSectionLength`, `sectionPageFraction`, `paginatorPage`, `paginatorPages`, `layoutMode`, `updatedAt`, `positionVersion`, `revision`, `sessionId`, `lastUserActivityAt`, `sessionStatus`)
- `GET /api/books/:id/reader-sync-meta` — ревизии закладок/заметок и метка позиции для sync (`positionRevision`, `positionUpdatedAt`, counts)
- `GET /api/reader-sync-index?ids=` — bulk dirty-check для тихой фоновой синхронизации: `{ activity, books[], unknownIds[] }` (до ~200 id); `unknownIds` — id, которых нет в каталоге этого сервера
- `POST /api/books/resolve` (`resolveServerBookIds`) — сопоставляет такие id с книгами сервера (тот же `lib_id` + название, или название + авторы; только однозначно). Книга, скачанная с другого сервера или до повторного добавления источника, хранится на устройстве под старым id (`9:857614`), а сервер знает её как `6:857614`: без сопоставления позиция и история получали 404 и молча терялись. `src/lib/serverBookAliases.ts` хранит соответствия по URL сервера (localStorage `inpx_server_book_aliases_v1`, промах переспрашивается через 12 ч), фоновая синхронизация вызывает его по `unknownIds`, сбрасывает CAS-ревизии книги (`baseRevision` 0) и отправляет историю чтения; `bookRef.ts` (`toServerBookId` / `toLocalBookId`) подставляет серверный id во все пути книги, `mapServerBook`, `fetchProfile` (`recentBooks`, `readerBookmarks`, `readerAnnotations`), `fetchLibraryView`, `fetchBookmarkedBooks` и списки закладок/заметок возвращают локальный (`localizeBookIds`; иначе герой «Продолжить чтение» видел серверный id без файла и предлагал «Скачать», а «Недавно читали» двоил книгу)
- `GET /api/reader-bookmarks` — все закладки читалки пользователя (`items`, `total`, `page`, `pageSize`)
- `GET /api/reader-annotations` — все заметки читалки пользователя (`items`, `total`, `page`, `pageSize`)
- `POST /api/books/:id/position` — CAS-сохранение позиции: обязательны `positionVersion: 4` и `baseRevision`; опциональный `sessionId` (UUID открытия книги); ответ включает новую `revision`, конфликт — `409 { current }`, устаревший клиент получает `428`; другая *активная* сессия не перезаписывает даже с совпавшим revision; idle-steal: устаревшая ревизия другой сессии принимается, если держатель без листания > 4 мин; «остаться здесь» привязано к `sessionId` держателя; чужое устройство → диалог, не молчаливый jump; ставит «прочитано» при 99% и снимает отметку при повторном чтении ниже 95%
- `POST /api/books/:id/position/release` `{ sessionId }` (`releaseReadingPositionSession`) — при закрытии читалки, после `finalizeReadingPositionSync` (`useBookActions`): снимает удержание этой сессии. Без него закрытое открытие 4 мин оставалось «активным» держателем, новое открытие (новый `sessionId`) получало 409, позиция после выхода оставалась старой, а в вебе — прежний %. Локальная строка `progress` с `lastRead` в будущем (часы устройства ушли назад) больше не держит старый процент (`upsertProgressFromLocalReader`)
- `GET /api/books/:id/bookmarks` — закладки книги
- `POST /api/books/:id/bookmarks` — добавить закладку
- `DELETE /api/books/:id/bookmarks/:bmId` — удалить закладку
- `PATCH /api/books/:id/bookmarks/:bmId` — переименовать закладку (`title`, до 500 символов)
- `GET /api/books/:id/annotations` — заметки книги
- `POST /api/books/:id/annotations` — добавить заметку
- `PATCH /api/books/:id/annotations/:aid` — изменить текст заметки и/или цвет выделения (`note`, `color`)
- `DELETE /api/books/:id/annotations/:aid` — удалить заметку

#### История и activity sync
- `GET /api/reader-activity-sync-meta` — ревизии «прочитано» и истории чтения
- `POST /api/reading-history/:id` — отметить открытие книги (`lastOpenedAt`)
- `DELETE /api/reading-history/:id` — удалить запись из истории чтения
- «Читаю» в приложении (главная: герой, «Также читаете», «Недавно читали»; «Мои книги → Читаю»; виджет «Продолжить чтение») = серверная история (`/api/profile` `recentBooks`, в «Моих книгах» — все страницы `GET /api/library/continue`) + книги на устройстве с локальным прогрессом (`buildLocalRecentReading`), склейка `mergeRecentReadingLists`, строки — `src/lib/recentReadingBooks.ts`. Как на сайте, прочитанные выпадают: `withoutFinishedReading` (есть в `readIds` или прогресс ≥ 99%). Удаление на сайте («Убрать») раньше не доходило: книга с локальным прогрессом возвращалась. Теперь при каждой перезагрузке профиля `App.tsx` сравнивает `readingHistoryRev` (`/api/reader-activity-sync-meta`) с последним сверенным и, если у локальных книг, открытых раньше этой ревизии, нет записи в `/api/library/continue`, ставит им `recentHiddenAt` (`recentRemovedOnServer` → `clearOfflineReadingHistory`; книга, открытая позже, остаётся — её история могла ещё не дойти). Повторное открытие снимает скрытие. Серверная строка скрывается, если `recentHiddenAt` ≥ её `lastOpenedAt` (`isRecentHiddenLocally`). Убрать из приложения: долгое нажатие на книгу из «Читаю» → «Убрать из «Читаю»» (`BookActionsTarget.fromReading` → `handleRemoveReadingHistory`: `DELETE /api/reading-history/:id`, офлайн — очередь `remove_history`, позиция и файл не трогаются)

#### Контракт позиции чтения (Foliate glue)

Общая логика: `public/inpx-reader/position-sync.js` (копия серверного `public/position-sync.js` через `scripts/sync-shared-reader.mjs`).

| Поле | Правило |
|------|---------|
| `fraction` | Основной якорь — из Foliate `loc.fraction`, **не** % по оглавлению |
| `progress` | Процент для UI, вычисляется из `fraction` |
| `fb2Href` | Грубый fallback FB2 (`раздел` или `раздел#блок`); не отменяет различие точных `fraction` |
| `textOffset` / `textQuote` / `textSectionLength` | Точный, независимый от вёрстки FB2-якорь внутри `sectionIndex`; имеет приоритет над `fraction` и `fb2Href` |
| `position` | CFI / paginator для EPUB; для FB2 пустой при наличии `fb2Href` |
| `positionVersion` | Версия координат; при миграции `< 4` FB2/FBZ сбрасывают все координаты, EPUB сохраняет только CFI |
| `revision` / `baseRevision` | Серверный CAS: запись принимается только от известной текущей ревизии; конфликт `409` уходит в диалог |
| `sessionId` | UUID текущей открытой читалки; другое устройство с отличающейся позицией → диалог (в том числе если у держателя нет sessionId) |
| `lastUserActivityAt` / idle 4 мин | Без листания POST не идёт; idle-держателя может перехватить другая сессия (в т.ч. matching-revision CAS); активную сессию чужой sessionId не перезаписывает; закрытая читалка освобождает удержание (`/position/release`) |

#### Полки (Shelves)
- `GET /api/shelves` — список полок
- `POST /api/shelves` — создать полку
- `DELETE /api/shelves/:id` — удалить полку
- Умные полки (сохранённый фильтр каталога): `GET/POST /api/smart-shelves`, `PUT/DELETE /api/smart-shelves/:id`, `GET /api/smart-shelves/:id/books?page=&pageSize=` (необязательный `pageSize` ≤ 24: приложение просит целые ряды обложек, например 20 при 5 колонках; старый сервер отвечает 24) → `{items,total,page,pageSize}`; полка `{id,name,query,catalogUrl,createdAt}`. `GET /api/smart-shelves?preview=1` добавляет `bookCount` и `previewBookIds`. В «Моих книгах» они идут отдельным списком «Умные полки» (`fetchSmartShelves`); открытие листает `fetchSmartShelfBooks`, удаление — `deleteSmartShelf`. Закрепление на главной — только на сайте
- `GET /api/home/shelves` — полки (обычные и умные), закреплённые на главной сайта: `{ items: [{ id, kind: 'shelf'|'smart', title, href, items }] }`, пустые не приходят, до 8. Главная приложения показывает их после «Рекомендаций» в том же порядке (`fetchHomeShelves`); «Все» открывает `HomeShelfPanel`: обычная полка — `GET /api/shelves/:id/books`, умная — `GET /api/smart-shelves/:id/books?page=&pageSize=` (целые ряды обложек, до 24); закрепление — только на сайте
- `GET /api/shelves/:id/books` — книги на полке
- `POST /api/shelves/:id/books` — добавить книгу на полку
- `DELETE /api/shelves/:id/books/:bookId` — удалить книгу с полки; id с NUL/control-символами — `DELETE /api/shelves/:id/books/b64/:ref`

#### Настройки сервера
- `GET /api/settings/ui` — UI настройки библиотеки: название, логотип, палитра, **скругление** (`radius` / `radiusPreset`), **тени** (`shadows` / `shadowPreset`), **фон** (`backgroundUrl`, `bgBlur`, `bgOverlayStrength`, `bgSize`, `bgPosition`), **шапка** (`headerUrl`, `hasHeader`, `headerHeight`, `headerPosition`, `headerSize`), **панели** (`surfaceOpacity` 0–100, `surfaceBlur` 0–24px)
- Палитра «Цвета библиотеки» по умолчанию совпадает со встроенной веб-темой (сервер отдаёт её токены в `appPaletteDark/Light`); `themeVersion` — непрозрачный хэш всего ответа. Настройка «Цвет»: «Приложение» — палитра `index.css`; «Сервер» — вся палитра сайта (`applyServerPaletteVars`: фон, поверхности, текст, второстепенный текст, рамки, поля, карточки, верхняя панель, ссылки и акцент в тёмной и светлой теме; полупрозрачные веб-токены стеклянного режима пересчитываются в сплошные цвета поверх фона (`solidColorOver`), статусные цвета, радиусы и тени остаются от приложения, статус-бар берёт фон сервера); «Система» — только акцент Material You (`applyAccentVars`). Акцент/ссылка всегда доводятся до 4.5:1 к поверхности, на которой лежат (`ensureReadableOn`). `clearAccentVars` снимает все эти переменные (e-ink, смена режима)
- Настройки аккаунта `GET/POST /api/preferences` (`hideRead`, `downloadFormat`, `telegramDigest`; `user.hideRead` в `/api/profile`). «Скрыть прочитанное»: `src/lib/hideReadPreference.ts` (значение из профиля, `null` на старых серверах — тогда параметр не шлётся); каталог / новинки / фасеты / автор передают `hideRead` явно, экраны перезагружаются по `useHideReadEpoch`; переключатель в `CatalogFilterSheet` (если передан `serverConfig`), скачивание всей серии всегда `hideRead=0`
- Оценки: `/api/rating/:id` (`fetchBookRating`, `setBookRatingApi`), строка «Ваша оценка» в `BookDetailsSheet`, сегмент «Мои оценки» (`/api/library/rated`, звёзды = своя оценка)
- Цель на год: `/api/reading-stats`, `/api/reading-goal` → `ReadingGoalCard` в профиле
- «Прочитаны тома до N» убрано из приложения и веба (отметку нельзя было уменьшить); серверный `/api/series-read-up-to` остаётся только для старых сборок. Серию целиком отмечают кнопкой «Прочитано» в ряду действий
- Действия серии (`CatalogDrilldownPanel`, общий `catalog/QuickAction.tsx`) в порядке карточки книги «Хочу прочитать → Прочитано → Избранное → На полку» (тот же порядок в `BookDetailsSheet` и на веб-странице книги/серии): `toggleSeriesWantApi` → `POST /api/want/series { name }` (`{ want, added, removed }`, кнопка скрыта у прочитанной серии, состояние = `SeriesReadingProgress.want`), `toggleSeriesReadApi` → `POST /api/read/batch { facet:'series', value }`, `toggleFavoriteSeries`, `addSeriesToShelfApi` → `POST /api/shelves/batch-add-books { shelfIds, series }` (сервер сам подбирает книги серии; полки — `inpxServer.shelves`, после добавления `refreshShelves`). Только онлайн
- `SeriesReadingProgress.current` (аддитивно, `null` на старых серверах): начатый непрочитанный том → в блоке серии одна кнопка: «Продолжить · N. Название · X%», иначе «Читать следующую» только при `next.prevRead` (предыдущий том прочитан), иначе ничего («Начать читать» убрано)
- Имя серии: у книг `series` = написание из INPX («Адвокат империи»), в избранном и ключах каталога — `series_catalog.name` в нижнем регистре. Сравнивать только через `sameSeriesName` (`src/lib/seriesLabel.ts`: регистр, пробелы, ё/е) — иначе серия, открытая со страницы книги, не видна как избранная
- Pull-to-refresh (`usePullToRefresh`): индикатор стоит ниже всего закреплённого над списком — `calc(--app-header-offset + --inpx-under + --inpx-tool)`, как отступ `.inpx-page-scroll`
- Только на сайте: формат скачивания по умолчанию, сводка в Telegram, импорт CSV из Goodreads / LiveLib, горячие клавиши
- Фоновую картинку сервера (`backgroundUrl`, `bgBlur`, `bgOverlay*`) приложение не рисует: `#app-server-bg` в `MobileFrame` / `index.css` остался с 1.4.0, но его никто не включает (`data-ui-bg`). Поля читаются в `parseServerUiTheme` только для кэша
- `GET /health` — проверка доступности сервера (Настройки → Сеть: домашняя Wi‑Fi + LAN, запасные адреса сверху вниз; смена URL не сбрасывает device token)

### Android UI (независимый от сервера)

Android-приложение имеет **собственный мобильный UX** — не копирует `/lite/` и не повторяет веб-layout сервера.

**Общее с сервером (данные, не экраны):**
- Те же API и sync по `bookId`
- Доменная терминология в текстах ошибок и подписях к данным («Полки», «Закладки», …)
- Брендинг библиотеки через `GET /api/settings/ui` (название, логотип) — опционально

**Своё в приложении:**
- Навигация: нижние табы **Главная → Каталог → Мои книги → Профиль**; настройки — внутри Профиля, не отдельный таб
- Layout списков и карточек — под Android WebView
- Анимации с учётом WebView: `MotionConfig reducedMotion="user"`, только transform/scale (без enter через `opacity: 0`)

**Функциональность:** доступ к тем же возможностям через API (каталог, чтение, sync, полки, …), но реализация UI — мобильная.

### Синхронизация данных

Приложение синхронизирует с сервером:
- ✅ Прогресс чтения (позиция, процент) — **LWW по `updatedAt`**; при открытии книги диалог, если на другом устройстве сохранена более новая другая позиция
- ✅ Закладки (bookmarks)
- ✅ Заметки (annotations)
- ✅ Избранные авторы и серии
- ✅ Пользовательские полки
- ✅ Отметки «прочитано»

---

## ⚠️ Ключевые ограничения

### 1. Только Android — без исключений

- Приложение разрабатывается **исключительно для Android (APK)**
- **Другие системы не учитываем:** iOS, Windows, macOS, PWA, браузер как продукт
- Capacitor + Android native API (SAF, плагины, MainActivity)
- Браузер (`npm run dev`) — только временная отладка через `server.ts`, не целевая платформа

### 2. Серверная часть — минимальная
- `server.ts` — это **только прокси для разработки** в браузере
- В production (APK) приложение работает **напрямую** с INPX Library Server через CapacitorHttp
- **Не нужно:**
  - Улучшать server.ts
  - Добавлять новые endpoint'ы
  - Исправлять SSRF-уязвимости (для локальной разработки не критично)
  - Оптимизировать прокси

### 3. Архитектурное решение
```
┌─────────────────┐         ┌─────────────────┐
│   Android APK   │         │  Браузер (dev)  │
│   (production)  │         │   (разработка)  │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │ CapacitorHttp           │ /api/proxy
         │ (напрямую)              │ (через server.ts)
         │                           │
         └──────────┬────────────────┘
                    │
           ┌────────▼────────┐
           │ INPX Library    │
           │ Server (отдельно)│
           └─────────────────┘
```

## 📁 Структура проекта

```
inpx-book-reader/
├── src/                      # Основной код приложения
│   ├── components/           # React-компоненты
│   │   ├── FoliateReader.tsx # Читалка (iframe с Foliate)
│   │   ├── CatalogTab.tsx    # Вкладка каталога
│   │   ├── ProfileTab.tsx    # Вкладка профиля
│   │   ├── SyncSettingsTab.tsx # Настройки
│   │   └── ...
│   ├── hooks/                # Custom React hooks
│   │   ├── useInpxServer.ts  # Хук для работы с сервером
│   │   ├── useAppBackButton.ts # Android кнопка "Назад"
│   │   ├── useBackHandler.ts # Обработчик навигации
│   │   └── ...
│   ├── lib/                  # Утилиты и API клиенты
│   │   ├── inpxClient.ts     # REST API клиент
│   │   ├── bookStorage.ts    # Работа с файловой системой Android
│   │   ├── platform.ts       # Определение платформы
│   │   ├── androidChrome.ts  # Android-specific (статус бар)
│   │   └── ...
│   ├── types.ts              # TypeScript типы
│   ├── App.tsx               # Главный компонент
│   └── main.tsx              # Точка входа
├── android/                  # Capacitor Android проект
├── server.ts                 # Прокси для dev (НЕ production!)
├── package.json
├── vite.config.ts
└── docs/                     # Документация
```

## 🛠️ Технологический стек

| Компонент | Технология |
|-----------|------------|
| Платформа | **Android только** |
| Фреймворк | React 19 + TypeScript |
| Сборка | Vite 6 + esbuild |
| Мобильная обёртка | Capacitor 7 (Android) |
| Стили | Tailwind CSS 4 |
| UI-иконки | Lucide React |
| Анимации | Motion (Framer Motion fork) |
| Читалка | Foliate (в iframe) |

## 🔧 Ключевые команды

```bash
# Разработка в браузере (с прокси)
npm run dev

# Сборка для Android
npm run build:android

# Открыть в Android Studio
npm run android:open

# Линтинг типов
npm run lint
```

## 📱 Android-specific особенности

### Разрешения
- Доступ к файловой системе через Storage Access Framework
- Управление статус-баром через `@capacitor/status-bar`
- Обработка кнопки "Назад" через `@capacitor/app`

### Нативные плагины
- `BookStorage` — кастомный плагин для записи/чтения файлов
- `FolderPicker` — выбор папки для хранения книг
- `ReaderNative` — вызовы из Foliate в нативный код
- Системный «Размер шрифта»: `ReaderNativePlugin.load()` ставит WebView `textZoom = 100` (Chromium раздувал только шрифт — фиксированные `leading-*` и ширины не росли, названия в плитках/строках наезжали друг на друга, подписи таб-бара обрезались; жалоба с Bigme 6). Масштаб отдаёт `ReaderNative.getFontScale()`, `src/lib/uiFontScale.ts` до первого рендера ставит корневой `font-size` (0.85–1.35), так что весь интерфейс в rem растёт целиком; `coverGridColumnsForWidth` и `bookGridColumnsForViewport` делят ширину на масштаб (меньше колонок; px-медиазапросы масштаба не видят, поэтому `BookCoverGrid` задаёт колонки inline через `useBookGridColumns`), строка списка каталога `FlibustaBookRow` — `min-h-[7.5rem]` (была `h-[120px]`: при крупном шрифте строки наезжали), высота строки виртуального списка тоже умножается. Размеры интерфейса задавать в rem, не в px; книжный текст системный масштаб больше не увеличивает — только размер шрифта в настройках читалки
- `SecureCredentials` — активный аккаунт (`save`/`load`/`clear`) и сохранённые аккаунты для быстрого переключения (`saveAccount`/`loadAccount`/`deleteAccount`, свой ключ Keystore `inpx_reader_saved_accounts` — «Выйти» (`clear`) их не трогает)

### Несколько пользователей на одном устройстве
- Профиль → «Сменить» (`AccountSwitcherSheet`): список сохранённых аккаунтов, переключение в одно касание, «Добавить пользователя» (текущий аккаунт запоминается, токен не отзывается, открывается форма входа), «×» убирает аккаунт из списка. «Выйти» убирает текущий аккаунт из списка (токен отзывается)
- `src/lib/accounts.ts`: скачанные книги (таблица `books`, файлы, обложки) общие; личное — `progress`, `bookmarks`, `highlights`, `shelves`, `favorites_*`, `sync_queue`, `reader_data`, `sync_conflicts`, ключи `app_meta` `reader_activity_sync` / `search_history` / `home_recent` и localStorage `inpx-shelf-server-ids`, `inpx_recent_browse_v1`, `inpx_download_format`, `inpx_home_layout`. Живой набор — в обычных таблицах, наборы остальных — снимки в IndexedDB (`inpx_account_snapshot:<user>`). Смена: `freezeLocalWrites()` (старый React-стейт не допишет в БД) → снимок → очистка → восстановление → `activateAccountCredentials` (дальнейшие persist игнорируются) → localStorage синхронно → `location.reload()`
- Владелец живого набора — `inpx_personal_owner` (имя пользователя, не URL: адрес меняется при автопереключении LAN/внешний). `processSyncQueue` и фоновая синхронизация не отправляют его под другим аккаунтом; `useInpxServer.refresh` до любой синхронизации вызывает `ensurePersonalDataOwner` («Выйти» → вход другим → подмена и перезагрузка). Новый тип личных данных — добавить в `PERSONAL_TABLES` / `PERSONAL_APP_META_KEYS` (`localDb.ts`) или `PERSONAL_LS_KEYS` (`accounts.ts`)

### Главная и формат скачивания (общие с сайтом настройки аккаунта)
- «Блоки главной» (Профиль → Внешний вид): порядок и скрытие блоков `continue` / `recent` / `novinki` / `recommended` / `following` / `shelves` — `homeLayout` в `/api/preferences` (тот же список, что «Главная страница» в профиле сайта; `recent` есть только в приложении). `src/lib/homeLayout.ts` + `HomeLayoutSettings.tsx`; `HomeTab` рендерит блоки по `order` и не грузит скрытые. Режим «Новинки: Все / Мои авторы» остался локальным, старое «Скрыть» один раз переносится в `hidden`
- «Формат скачивания» (Профиль → Хранилище): `downloadFormat` аккаунта (как на сайте). Приложение берёт `epub2` / `epub3` / `kepub` → файл `.epub` с `/download/:id?format=` (`downloadFormatPreference.ts`, `resolveBookDownloadFormat` в `downloadQueue`), только если формат есть в `downloadFormats` книги (сервер иначе молча отдаёт исходник, и расширение на диске было бы неверным); остальное — исходный файл `/api/books/:id/content`. Позиция такой EPUB-копии с FB2 на сайте совпадает только по `fraction`: `positionForBookFormat` из `position-sync.js` (вызывается в `restoreReadingPosition`) отбрасывает координаты чужого формата
- Полки на главной: иконка-домик `ShelfHomeToggle` у каждой серверной полки (строки коллекций `LibraryCollections` и карточки `ShelfCard`) и «Убрать с главной» (`PinOff`) в шапке закреплённой полки на главной → `setShelfOnHomeApi` (`POST /api/shelves|smart-shelves/:id/home { on }`), `useInpxServer.setShelfOnHome` (оптимистично, откат при ошибке), затем `homeShelvesEpoch` перезагружает полки главной. `onHome` входит в подпись списка полок, так что смена с сайта тоже подхватывается опросом раз в 8 с. Порядок полок — `homeLayout.shelfOrder` (общий с сайтом): обычные и умные полки — один список «Полки» в «Мои книги» (умная помечена значком поиска `Search` вместо `Library`), полки перетаскиваются за ⠿ в любом порядке (строки `LibraryCollections` и карточки `ShelfCard` через `SortableShelfList`; `src/ui/DragReorder.tsx` — `Reorder` из `motion/react`, `dragListener={false}` + `useDragControls` на ручке с `touch-none`, чтобы строка по-прежнему прокручивала страницу, нажималась и удалялась долгим нажатием; ↑↓ на ручке для клавиатуры и TalkBack; сохраняется один раз при отпускании). `App.handleReorderShelves` → `reorderShelfGroup` (полная перестановка всех полок сохраняется как есть) → `POST /api/preferences`. Списки в `App.libraryShelves` и закреплённые полки на главной (`HomeTab`) идут в этом порядке. «Блоки главной» тоже перетаскиваются. Любая запись `homeLayout` должна сохранять `shelfOrder` (`{ ...layout }`)
- Умная полка из каталога: внизу панели фильтров (`CatalogFilterSheet`, поиск книг) кнопка «Сохранить как умную полку» → поле названия (по умолчанию текст поиска) → `createSmartShelf` (`POST /api/smart-shelves { name, query }`: текст поиска, жанры / формат / год / рейтинг / серия из панели, текущая сортировка; как на сайте). Обработчик — `CatalogTab.handleSaveSmartShelf`, после сохранения `onShelvesChanged` обновляет список полок

### Чтение вслух (TTS)
- Плеер, подсветка и настройки — общий модуль сервера `reader-shared/reader-tts.js` (`npm run sync:shared`), тот же, что на сайте: `reader.js` только создаёт контроллер (`createReaderTts`) и держит wake lock, keep-alive, Media Session, уведомление (`syncNativeTtsMediaSession`) и `inpx-reader-tts-state` для родителя. Разметка: пустой `#reader-tts-dock` и `#rs-tts-mount` в разделе настроек «Озвучка» (`generate-reader-html.mjs`)

### Меню и настройки читалки (как на сайте)
- `public/inpx-reader/index.html` — это серверный `renderReader()` (`inpx-library-server/src/templates/library.js`): `scripts/generate-reader-html.mjs` **вычисляет** функцию с заглушками и русским словарём сервера (`src/locale-bundles.js`), хелперы — из `src/templates/reader-chrome.js` (без импортов, БД сервера не открывается). Затем подставляет свои разделы настроек и AlReader-обвязку (строка состояния, «Перейти к…», `#ft-goto`, `rsm-bookmark`). Ключа нет в словаре → генератор падает, а не оставляет `${…}`. Генерируется в `sync:shared` / `build:app`
- Тулбар: ←, название + глава, %, закладка. Тап в центр → меню-плитки над футером (`#reader-quick`): Оглавление, Закладки, Заметки, Поиск, Озвучка, День/ночь, Весь экран (immersive), Настройки (+ «PDF: Reflow/страница» для PDF, `#rq-pdf-mode`), ниже A− / размер / A+ и темы. Меню «⋯» больше нет
- Настройки — отдельный лист: список разделов с текущими значениями (`#rs-root`, `data-rs-open` / `data-rs-summary`) → страница раздела (`.rs-page[data-rs-page]`, стрелка `#panel-back`, своя запись в history: системный «Назад» и `__READER_HANDLE_BACK__` возвращают к списку). Разделы приложения: Текст, Цвета и тема (+ картинка фона, инверсия, яркость `#rs-brightness-slot`), Страница (+ PDF), Строка состояния, Управление (перерисовка E-Ink, громкость, автолист, вибрация, зоны), Озвучка, Прочее (сноски, свой CSS). Вне раздела сайт отличается только составом опций
- Каждый ползунок получает − / + (`enhanceRangeSteppers`); при `data-eink="1"` ползунки скрыты, остаются − / + по 44+ px. Режим E-Ink в приложении задаётся настройкой приложения (`useEinkMode`, авто по устройству), не в читалке; на сайте — «Настройки → Экран E-Ink»
- Стили меню и листа — общий блок в конце `reader.css` (копия блока серверного `public/reader.css` «TOOLBAR (slim)» … «E-Ink»; в приложении футер стоит над строкой состояния, поэтому меню и док озвучки добавляют `--r-status-h`)
- `reader-native-bridge.js` подменяет `speechSynthesis` нативным `TtsPlaybackManager`: `speak({ text, utteranceId, rate, pitch, lang, voice })`; без выбранного голоса («Авто») движок берёт `setLanguage(lang)` книги. `onRangeStart` (Android 8+) → iframe-событие `ttsRange` `{ utteranceId, start, end }` → `boundary` для подсветки слова
- Таймер сна «продлевать, пока телефон в руках»: `host.watchMotion` в `reader.js` → `ReaderNative.setMotionWatch({ enabled, threshold, spanMs })` (`TtsMotionWatcher`: акселерометр; движение = отклонение от медленного среднего больше `threshold` м/с² в течение `spanMs`, уровни `TTS_MOTION_LEVELS` из настройки «Чувствительность к движению»; событие не чаще раза в 1,5 с) → iframe-событие `ttsMotion` → отсчёт заново. Датчик включён, только пока идёт озвучка с таймером в минутах; `FoliateReader` выключает его при закрытии. Затухание в последнюю минуту — `speak({ volume })` → `KEY_PARAM_VOLUME`. При нативном TTS WebView keep-alive звук не играет (foreground-сервис держит речь сам)
- Очередь фраз: модуль держит в движке текущую фразу и следующую. Мост (`reader-native-bridge.js`) хранит отданные фразы по `utteranceId` (`speaking` = очередь не пуста) и шлёт `speak({ queue: true })` → `TextToSpeech.QUEUE_ADD`; `TtsPlaybackManager` помнит их в `pending`: пауза делает `tts.stop()` и игнорирует события остановки, `resume()` проигрывает `pending` заново с прерванной фразы. Голос и язык выставляются движку только при изменении (`appliedVoiceKey`) — `setLanguage` перед каждой фразой добавлял паузу
- Пауза — нативная (`host.nativePause`): уведомление и foreground-сервис остаются; кнопки уведомления приходят как `ttsMediaAction` и вызывают `pause/resume({ external: true })`. Каждое нажатие приходит в iframe дважды (слушатель плагина → `FoliateReader` и внедрённый скрипт `emitTtsMediaAction`), поэтому у события есть `seq`, и `reader.js` выполняет каждый `seq` один раз (иначе «Дальше» перескакивало на две фразы)

### Виджеты (рабочий стол и экран блокировки)
Только Android, без серверного API (данные — из того, что приложение уже знает). Все три — `widgetCategory="home_screen|keyguard"`: на экране блокировки появляются только там, где Android это поддерживает (хаб планшетов, Android 15–16); на телефонах экран блокировки = уведомление плеера озвучки. Обложка — главный элемент; квадратный/высокий размер (`isWide` = ширина ≥ 1,3 × высоты не выполняется) — обложка на весь виджет (`coverFill`: обрезка под размер, RGB_565, ≤ 420 px) с текстом на градиенте; широкий — обложка во всю высоту слева на размытой копии (`widgetBackdrop`, рисуется в ¼ размера). Размер — `portraitSizePx` (ширина = `MIN_WIDTH`, высота = `MAX_HEIGHT`).
- Вверху каждого виджета — логотип и название библиотеки (`bindLibrary`, строка `widget_lib_row`; на обложке во весь виджет — поверх верхнего градиента `widget_lib_scrim`). `useServerBranding` после загрузки `/api/settings/ui` вызывает `syncLibraryWidget(siteName, logoBlob)`: логотип пишется в кэш приложения (`branding/widget-logo`) и путь уходит в `ContinueWidget.updateLibrary({ name, logoPath })` (prefs `inpx_library_widget`). `showLogo: false` (Admin → Внешний вид) и SVG-логотип (не декодируется в виджете) → только название; пока название не пришло, строка скрыта
- «Продолжить чтение» (`ContinueReadingWidgetProvider`, prefs `inpx_continue_widget`): `ContinueWidget.updateContinueBook` из `App.tsx` (первая книга «Читаю» с файлом на устройстве), тап → `LaunchIntent` `{ action: 'continue', bookId }`
- «Озвучка» (`TtsRemoteWidgetProvider`): состояние — `TtsMediaState` (любое изменение перерисовывает виджет с задержкой 250 мс; `attach(context)` из `TtsPlaybackManager`). Кнопки — `PendingIntent.getService(TtsForegroundService, ACTION_PLAY|PAUSE|PREV|NEXT|STOP|SLEEP)`, те же, что у уведомления. `ACTION_SLEEP` → `ttsMediaAction` `sleep` → `readerTts.cycleSleep()` (15 → 30 → 60 мин → выкл.); конец таймера читалка отдаёт в `updateTtsMediaSession({ sleepEndsAt })` (epoch ms; нативно читать `getData().optLong`, `getDouble` для long отдаёт 0), виджет считает обратный отсчёт `Chronometer` (API 24+) без обновлений. Пока озвучка выключена — книга из prefs «Продолжить», «▶» = `continue` + `startTts: true`: `App` ставит `ttsAutostart`, `FoliateReader` шлёт в iframe `inpx-reader-autostart-tts { token }`, `reader.js` запускает озвучку, когда книга показана и позиция улеглась (1,2 с без `relocate`, ждёт до 30 с)
- «Новое у любимых» (`FollowingWidgetProvider`, prefs `inpx_following_widget`): `App.tsx` при старте, возврате в приложение и смене отметок «Прочитано» — только если виджет стоит (`ContinueWidget.placedWidgets`) — берёт `GET /api/library/following` (8 книг), греет кэш обложек (`warmCoverCache`) и вызывает `updateFollowing`. Каждая обложка обрезается под одну рамку 2:3 (`coverFill`), под ней название (всегда 2 строки, чтобы ряд не «прыгал») и автор. Сетка — `chooseGrid`: 1 ряд из ≤ 4 колонок по числу книг на всю ширину или 2 ряда, если виджет достаточно высокий; выбирается вариант с наибольшей площадью обложек (константы отступов там же должны совпадать с `widget_following.xml`); тап → `{ action: 'book', bookId, title, author, ext }` → карточка книги (`openBookDetailsExclusive`, открытая читалка закрывается)

### Безопасность
- Пароли хранятся в localStorage (для локального приложения приемлемо)
- Нет необходимости в HTTPS для локальной разработки
- Все API вызовы к доверенному INPX серверу

## 🚫 Что НЕ нужно делать

1. **Не улучшать server.ts** — это временный dev-инструмент
2. **Не добавлять поддержку iOS/Desktop** — только Android
3. **Не оптимизировать прокси** — в APK он не используется
4. **Не добавлять CORS заголовки** — в APK CORS не применим
5. **Не беспокоиться о SSRF** — прокси только для localhost разработки

## ✅ Приоритеты разработки

### 1. Интеграция с INPX Library Server
- **Полная совместимость API** — все endpoint'ы сервера должны работать в читалке
- **Синхронизация данных** — прогресс, закладки, заметки, избранное
- **UI/UX** — самостоятельный мобильный интерфейс; API и sync — как на сервере
- **Обработка ошибок** — те же сообщения об ошибках, что и на сервере

### 2. Стабильность чтения книг
- Чтение **только** из скачанного файла на устройстве (не стриминг с сервера)
- Корректное отображение FB2/EPUB через Foliate
- Позиция, закладки и заметки — локально; синхронизация с сервером при подключении

### 3. Работа с файловой системой Android
- Скачивание книг в выбранную папку (по умолчанию `Download/INPXLibraryReader`)
- Выбор папки хранения через Storage Access Framework
- Очистка файлов при удалении из библиотеки

### 4. Сервер и «офлайн»
- **Сервер нужен для:** каталог, поиск, скачивание, синхронизация прогресса/закладок/заметок
- **Сервер не нужен для:** чтения текста книги (файл уже на диске)
- Офлайн: спокойный баннер, когда каталог или скачивание недоступны (не постоянный LAN/внешняя в шапке)

### 5. Мобильный UI/UX
- Адаптация под маленькие экраны
- Поддержка тёмной/светлой темы
- Жесты и навигация для Android
- Обработка кнопки "Назад"

## 📞 Контакты

- Документация: `docs/`
- Android-инструкция: `docs/ANDROID.md`
- Сервер: `D:\inpx-library-server`

## 🔗 Полезные ссылки

- [INPX Library Server на GitHub](https://github.com/nicklvsa/inpx-library-server)
- [Сообщество Telegram](https://t.me/kodacommunity)
- [Документация Koda](https://docs.kodacode.ru)

---

## 🔄 Поддержание единой экосистемы с сервером

### Брендинг библиотеки (опционально)

Если нужно подтянуть оформление с сервера — `GET /api/settings/ui` (название, логотип, палитра, скругление, тени, фон).
Синхронизация палитры с `styles.css` сервера **не обязательна**; Android-тема живёт в `src/index.css` и `src/lib/appTheme.ts` независимо от `/lite/`.

### При добавлении нового API endpoint на сервере

1. **Изучить реализацию на сервере** (`D:\inpx-library-server\src\routes\*.js`)
   - Метод (GET/POST/PUT/DELETE)
   - Параметры запроса
   - Формат ответа
2. **Добавить метод в `src/lib/inpxClient.ts`**
   - Использовать `apiFetch()` для вызова
   - Добавить типизацию ответа
3. **Обновить `AGENTS.md`** (секция "API Endpoint'ы сервера")
   - Добавить новый endpoint в список

### При изменении терминологии на сервере

1. **Проверить `D:\inpx-library-server\src\i18n.js` и `src\locales\*.json`**
   - Найти новые/изменённые строки
2. **Обновить тексты в компонентах читалки**
   - Использовать те же формулировки
   - Сохранять единый стиль сообщений об ошибках

### Проверка перед релизом

- [ ] API и sync работают с сервером
- [ ] Все API endpoint'ы работают корректно
- [ ] Терминология единообразна
- [ ] Сообщения об ошибках совпадают
- [ ] Прогресс чтения синхронизируется
- [ ] Закладки и заметки синхронизируются
