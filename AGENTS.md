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
- `GET /api/favorites` — избранные авторы и серии (`authors`: `name`, `displayName`, `bookCount`, `coverBookId`; `series`: `name`, `displayName`, `bookCount`, `previewBookIds`). Since the favorites speed-up `coverBookId` is always null (an author = portrait or a placeholder with two letters in the written order («Головачев Василий» → ГВ), `authorInitials` in `AuthorPortrait.tsx`, no user icon any more; the app no longer passes it to `EntityPreviewRow`) and `previewBookIds` holds the first six volumes of the series (`ShelfCoverStack` draws up to six)
- `POST /api/favorites/authors` — добавить/удалить автора в избранное
- `POST /api/favorites/series` — добавить/удалить серию в избранное
- «Не рекомендовать» автора: `POST /api/recommendations/excluded-authors { name, on }` → `{ excluded }` (`setAuthorNotRecommendedApi`; 404 — неизвестный автор), список — additive `notRecommendedAuthors: [{ name, displayName }]` в `GET /api/favorites` (нет поля = старый сервер, кнопка скрыта; отдельно `GET /api/recommendations/excluded-authors` → `{ items }`). Книги, где среди авторов есть такой, не попадают в рекомендации (главная, «Рекомендации»). Кнопка 👎 (`ThumbsDown`) рядом с сердцем в шапке автора `CatalogDrilldownPanel`, только онлайн и при серверном каталоге; имя — `authorGrouped.authorName` (серверное написание), состояние — `inpxServer.notRecommendedAuthors`, обработчик `App.handleSetAuthorNotRecommended` (snackbar). Веб: кнопка «Не рекомендовать» на странице автора

#### Библиотека и каталог
- `GET /api/library/recent` — новинки по дате INPX (`date`, окно 30 дней от самой свежей даты в каталоге), не весь каталог и не штамп переиндексации; additive filters как у каталога: `genre` (CSV/repeated, OR), `lang`, `format`, `year`, `minRate`, `hasSeries` (1/0)
- `GET /api/library/continue` — продолжить чтение
- `GET /api/library/read` — прочитанные книги
- `GET /api/library/recommended` — рекомендации; те же additive filters (`genre`, `format`, `year`, `minRate`, `hasSeries`) поверх персонального пула
- `GET /api/library/want` — «Хочу прочитать» (как `read`; `sort=recent|title|author|rating`). Книга уходит из списка сама, когда её открыли (`POST /api/reading-history/:id`) или отметили прочитанной. В приложении: действие «Хочу прочитать / Отложено» в карточке книги (`BookDetailsSheet`, скрыто для прочитанной), сегмент «Хочу прочитать» в «Моих книгах», набор `wantIds` в `useInpxServer` (старый сервер без маршрута → набор пустой, синхронизация не падает)
- `GET /api/library/following` — «Новое у любимых»: непрочитанные книги избранных авторов и серий за 90 дней по дате INPX, новые сверху, без фильтров. В приложении: секция на Главной после «Рекомендаций» (только если есть книги; 404 старого сервера = скрыта), «Все» → `LibrarySectionPanel view="following"` без фильтров
- `GET /api/series-progress?name=` — `{ total, read, next: { id, title, seriesNo } | null }`: тома (издания одного тома считаются один раз), книги без номера в конце. В приложении: блок «Прочитано N из M» + «Начать читать / Читать следующую» на экране серии (`CatalogDrilldownPanel`), обновляется при изменении отметок «прочитано»; 404 → блок скрыт
- `GET /api/series-info?name=` → `{ name, displayName, bookCount, volumeCount, authorCount, authors: [{ name, displayName, bookCount }] (≤ 24), genres: [{ name, displayName, displayNameEn, bookCount }] (≤ 12), languages: [{ code, bookCount }], yearFrom, yearTo }` (`fetchSeriesInfo`, `SeriesInfo` в `inpxClient.ts`): сведения о серии с учётом языков профиля, тома считаются как в прогрессе, годы — диапазон дат INPX. В приложении: `SeriesInfoBlock` в шапке экрана серии (`CatalogDrilldownPanel`) — авторы кнопками (открывают страницу автора через `openAuthorPage`), жанры, языки (`Intl.DisplayNames`), годы, «Томов» (если отличается от числа книг); грузится один раз на серию (не по отметкам «прочитано»); 404 / пустая серия → блок скрыт. Аддитивный `firstBookId` (авторская серия: у автора первого тома больше всех книг и ≥ 20%; не для журналов, антологий и серий-сборников) → `CatalogTab` грузит `fetchBookDetails` и над `SeriesInfoBlock` показывается аннотация первого тома (как на веб-странице серии)
- `GET /api/browse/index?kind=authors|series&prefix=` → `{ kind, prefix, total, groups: [{ prefix, count }], items: [{ name, displayName, bookCount }] }` (`fetchAlphaIndex`, `AlphaIndexResult`; 404 на старом сервере → `null`): алфавитный указатель, как `/authors?idx=` на сайте. `AlphaIndexPanel` над серверными списками авторов / серий в `CatalogEntityLists` (не во время поиска): ряд русских и ряд латинских букв (язык интерфейса первым), путь «К › Ко › Кор», чипы следующей буквы с числами, при ≤ 60 именах — сами имена, а при больше 8 над ними остаются чипы следующей буквы, так что можно сузить до полной фамилии (до 40 букв; тап открывает автора / серию; имя, равное префиксу, — рядом с чипами). Открытая буква скрывает обычный список и сворачивает ряды букв в чип «Алфавит» (на телефоне они занимали полэкрана); префикс хранится до конца сессии (возврат со страницы автора)
- `GET /api/catalog` — поиск/просмотр каталога (без `q` тоже отдаёт книги); additive filters: `genre` (CSV/repeated, OR — хотя бы один), `lang`, `format`, `year`, `minRate`, `hasSeries` (1/0)
- `GET /api/search?q=` — totals разделов `{ books, authors, series, preferredField?, routeField: null }`; drilldown через `/api/catalog?field=`; веб Enter всегда открывает книги с чипами Авторы/Серии (без hub / smart redirect)
- `GET /api/search/genres?q=` — жанры среди книг текущей выдачи (фасет для фильтра; опционально format/year/minRate/hasSeries)
- `GET /api/search/suggest` — подсказки поиска (книги/авторы/серии); тап по автору/серии открывает страницу сущности (`name` из suggest), а не поиск книг
- `GET /api/catalog` — при пустой/слабой выдаче может быть additive `searchHints` (`tip`, `didYouMean`, `weak?`). Ноль книг — окончательный ответ: `searchCatalog` в `inpxClient.ts` **не** повторяет запрос как `*q` (сервер сам уходит в LIKE при грязном FTS; повтор превращал каждый промах в contains-скан — «*Tolkien» вешал сервер на 21 с). `*q` ищет подстроку с ограниченным по времени сканом; additive `partial: true` = скан не дошёл до конца (совпадения с начала слова всё равно найдены через FTS)
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
- KOReader (KOSync на сервере): книга, скачанная через сервер и читаемая в KOReader, сама попадает в «Читаю» с процентом KOReader (`readProgress` в `/api/library/continue` и `recentBooks` `/api/profile` = максимум из своего ридера и KOReader), на 99% — в «Прочитано»; приложение подхватывает это по `readingHistoryRev` без своего кода. Позиция тоже общая в обе стороны: сервер переводит xpointer KOReader в обычную серверную позицию v4 (FB2 — точный текстовый якорь `textOffset` / `textQuote` раздела 0, другие форматы — только `fraction`), а KOReader при синхронизации получает xpointer абзаца, где остановились в приложении или на сайте. Приложению своего кода не нужно: позиция приходит через `/api/books/:id/position` и `positionRevision` как с любого другого устройства (при открытой книге — обычный диалог «продолжить с другого устройства»). Локальный прогресс скачанной в приложение книги по-прежнему важнее серверного
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
- Подборки (сервер 2.13+): `GET /api/collections` → `{ items: [{ slug, title, description, source, sourceUrl, total, found, matching, previewBookIds }] }` (`fetchCollections`, старый сервер → `[]`), `GET /api/collections/:slug` → `{ …, read, items: [{ position, author, title, year, note, book: InpxBookItem|null, read }] }` (`fetchCollection`). Каталог → строка «Подборки» на стартовом экране (`CatalogBrowseLanding.onOpenCollections`, только если на сервере есть подборки) → `CollectionsPanel`, собранный из экранов полок (своей вёрстки нет): список — строки как «Мои книги → Полки» (название, `найдено/всего`); подборка — как `HomeShelfPanel`: `CatalogBookList` + `ViewModeToggle` с найденными книгами в порядке списка (тап — `BookDetailsSheet`, долгое нажатие — меню книги), ниже группа «Нет в библиотеке» обычными строками. На главную подборка закрепляется домиком `ShelfHomeToggle` в строке списка (как серверная полка в «Мои книги»): `setCollectionOnHomeApi` → `POST /api/collections/:slug/home { on }`, `App.handleSetCollectionOnHome` (оптимистично, потом `homeShelvesEpoch`). Главная берёт `GET /api/home/shelves?collections=1` (без флага сервер подборки не отдаёт — старые сборки приняли бы их за полку с тем же id): элементы `{ kind: 'collection', slug, … }` показываются своим блоком «Закреплённые подборки» (`collections` в «Блоках главной», можно скрыть и переставить), «Все» открывает `HomeShelfPanel` (книги из `fetchCollection(slug)`), «Убрать с главной» снимает закрепление. Порядок подборок — свой: `homeLayout.collectionOrder` (slug'и, общий с сайтом `/collections`): строки списка перетаскиваются за ⠿ (`DragRow` / `useDragOrder`, как `SortableShelfList`) → `App.handleReorderCollections` → `POST /api/preferences { homeLayout }`; по нему же идут закреплённые подборки на главной. В порядок полок (`homeLayout.shelfOrder`) подборки не входят. Домик есть и на открытой подборке (как на её веб-странице); у отсутствующей книги — «Искать» (поиск в каталоге по названию и автору); источник подборки — просто текст (внешние страницы приложение не открывает). Только онлайн, без кэша. Подборки и их сопоставление с каталогом ведёт сервер (Админка → Контент → Подборки)
- Год издания и ISBN: `GET /api/books/:id/publish-info` → `{ publishYear, isbn }` (`fetchBookPublishInfo`, только для FB2; старый сервер → пусто). В `BookDetailsSheet` «Год издания» заменяет строку «Год» (это год из даты INPX), плюс строка «ISBN»
- Аннотации с BB-кодами сервер отдаёт уже HTML (`[spoiler]` → `<details><summary>`, `[u]`, `[s]`); `src/lib/sanitizeHtml.ts` пропускает `u s details summary`
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

### Библиотеки Calibre на сервере

Сервер умеет источник «библиотека Calibre» (`sources.type = 'calibre'`, каталог из `metadata.db`). Для приложения это обычные книги каталога: `ext` = `epub` / `azw3` / `mobi` / `fb2` (основной формат книги Calibre), файл — `GET /api/books/:id/content`, обложка — `cover-thumb` (из `cover.jpg`), аннотация — HTML из Calibre через `/api/books/:id/details`, год / ISBN — `/api/books/:id/publish-info`, жанры — теги Calibre как есть (часто английские; `localizeGenreRows` оставляет хранимое имя), язык — ISO 639-1. id книги не зависит от пути (`sha256(source:calibre:uuid)`), поэтому переименование книги в Calibre не меняет id. Фаза 1 изменений в приложении не требует. Фаза 2 тоже: остальные форматы книги Calibre (AZW3, MOBI, FB2, PDF… рядом с основным) приходят дополнительными кодами в `downloadFormats` (`azw3`, `pdf`, …) и скачиваются как есть `/download/:id?format=<ext>`; приложение их не использует — его «Формат скачивания» касается только EPUB из FB2, а EPUB у книги Calibre всегда основной формат (лишнего EPUB не бывает), так что скачивается `/api/books/:id/content`, как раньше. Следующая фаза (PDF / DJVU / CBZ / CBR: скачать + «Открыть в другом приложении», без встроенной читалки) потребует работы в приложении — план в `docs/decisions/004-calibre-library-source.md` сервера.

### Форматы без встроенной читалки (DJVU, CBR, RTF, DOCX)

Сервер отдаёт книги в PDF, DJVU, CBZ, CBR, TXT, RTF, DOCX (библиотеки Calibre, отдельные файлы в папках): `ext` в каталоге — этот формат, файл — `/api/books/:id/content`. Встроенная читалка (Foliate) открывает EPUB, FB2/FBZ, MOBI/AZW3, CBZ, PDF и TXT (`isAppReaderFormat` в `src/lib/bookFormats.ts`). Остальные скачиваются как обычно, а любое «открыть» (лист книги, Главная, «Мои книги», виджеты — всё идёт через `tryResolveAndOpen` в `useBookActions.ts`) отдаёт файл другому приложению: `openBookFileInExternalApp` (`bookStorage.ts`) → нативный `BookStorage.openWithExternalApp` (копия в `files/book-cache/`, `FileProvider` `files-path book_cache` в `res/xml/file_paths.xml`, `ACTION_VIEW` с MIME из `bookMimeType`; нет приложения → код `NO_APP` → снекбар «Нет приложения, которое открывает DJVU…»). Основное действие такой скачанной книги — `open-external` («Открыть в другом приложении», `resolveBookPrimaryAction({ readable: false })`); в листе книги до скачивания подпись «DJVU открывается в другом приложении». Позиция чтения у таких книг не синхронизируется. Строки — `common.openInAnotherApp` / `noAppForFormat` / `couldNotOpenInAnotherApp` / `formatOpensInAnotherApp` (ru + en).

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
- Размер шрифта читалки 12–48 px (ползунок `rs-font-size` в `scripts/generate-reader-html.mjs`, A− / A+ `bumpFontSize`, щипок `applyPinchFontSize`, сообщение `inpx-set-font-size` в `public/inpx-reader/reader.js`); было 12–32 — мало для слабого зрения. Тот же предел в веб-читалке сервера
- `SecureCredentials` — активный аккаунт (`save`/`load`/`clear`) и сохранённые аккаунты для быстрого переключения (`saveAccount`/`loadAccount`/`deleteAccount`, свой ключ Keystore `inpx_reader_saved_accounts` — «Выйти» (`clear`) их не трогает)

### Несколько пользователей на одном устройстве
- Профиль → «Сменить» (`AccountSwitcherSheet`): список сохранённых аккаунтов, переключение в одно касание, «Добавить пользователя» (текущий аккаунт запоминается, токен не отзывается, открывается форма входа), «×» убирает аккаунт из списка. «Выйти» убирает текущий аккаунт из списка (токен отзывается)
- `src/lib/accounts.ts`: скачанные книги (таблица `books`, файлы, обложки) общие; личное — `progress`, `bookmarks`, `highlights`, `shelves`, `favorites_*`, `sync_queue`, `reader_data`, `sync_conflicts`, ключи `app_meta` `reader_activity_sync` / `search_history` / `home_recent` и localStorage `inpx-shelf-server-ids`, `inpx_recent_browse_v1`, `inpx_download_format`, `inpx_home_layout`. Живой набор — в обычных таблицах, наборы остальных — снимки в IndexedDB (`inpx_account_snapshot:<user>`). Смена: `freezeLocalWrites()` (старый React-стейт не допишет в БД) → снимок → очистка → восстановление → `activateAccountCredentials` (дальнейшие persist игнорируются) → localStorage синхронно → `location.reload()`
- Владелец живого набора — `inpx_personal_owner` (имя пользователя, не URL: адрес меняется при автопереключении LAN/внешний). `processSyncQueue` и фоновая синхронизация не отправляют его под другим аккаунтом; `useInpxServer.refresh` до любой синхронизации вызывает `ensurePersonalDataOwner` («Выйти» → вход другим → подмена и перезагрузка). Новый тип личных данных — добавить в `PERSONAL_TABLES` / `PERSONAL_APP_META_KEYS` (`localDb.ts`) или `PERSONAL_LS_KEYS` (`accounts.ts`)
- `location.reload()` не перезапускает нативный плагин SQLite: его соединение остаётся открытым, а новая страница о нём не знает. Поэтому `openSqlite` сначала вызывает `checkConnectionsConsistency()` (закрывает «чужие» соединения) — без этого `createConnection` падал с «already exists» и после смены аккаунта приложение до перезапуска работало на IndexedDB (чужие счётчики, сброшенный путь скачивания, повреждённые снимки). `swapPersonalData` отказывается работать на IndexedDB-запасе в нативном приложении
- Папка скачивания: выбор пользователя — папка по умолчанию в Настройки → «Папки» (`library_folders`); `storage_directory` — её рабочая копия. При старте `App` возвращает `storage_directory` к ней; если папка недоступна — запас только на этот запуск + snackbar. Проверка файлов (`useLocalBookFileVerification`) и открытие книги (`useBookActions`) принимают найденную папку только как другой URI той же папки (`sameLibraryFolder`), а не книгу из соседней папки

### Главная и формат скачивания (общие с сайтом настройки аккаунта)
- «Блоки главной» (Профиль → Внешний вид): порядок и скрытие блоков `continue` / `recent` / `novinki` / `recommended` / `following` / `shelves` / `collections` — `homeLayout` в `/api/preferences` (тот же список, что «Главная страница» в профиле сайта; `recent` есть только в приложении; `collections` = «Закреплённые подборки»: элементы `kind: 'collection'` из того же ответа `/api/home/shelves?collections=1`, отдельный блок, а не часть полок). `src/lib/homeLayout.ts` + `HomeLayoutSettings.tsx`; `HomeTab` рендерит блоки по `order` и не грузит скрытые. Режим «Новинки: Все / Мои авторы» остался локальным, старое «Скрыть» один раз переносится в `hidden`
- «Формат скачивания» (Профиль → Хранилище): `downloadFormat` аккаунта (как на сайте). Приложение берёт `epub2` / `epub3` / `kepub` → файл `.epub` с `/download/:id?format=` (`downloadFormatPreference.ts`, `resolveBookDownloadFormat` в `downloadQueue`), только если формат есть в `downloadFormats` книги (сервер иначе молча отдаёт исходник, и расширение на диске было бы неверным); остальное — исходный файл `/api/books/:id/content`. `fb2zip` (вариант «FB2.ZIP») → файл `.fb2.zip` с `/download/:id?format=fb2zip`: та же FB2, только сжатая (в 2–4 раза меньше на телефоне); `ext` записи книги = `fb2.zip`, читалка открывает её как FBZ (Foliate смотрит внутрь архива), позиция остаётся точной FB2-позицией — везде, где формат сравнивается с `fb2`, срезается `.zip` (`normalizeBookExt`, `migrateOfflineReaderPositionForFormat`, `ext` в `/api/books/resolve` из `serverBookAliases.ts`); подписи формата в сообщениях — `downloadFormatLabel` (`fb2zip` → `FB2.ZIP`). Открытие файла из других приложений (проводник, Telegram → «Открыть с помощью»): фильтр VIEW в `AndroidManifest.xml` кроме FB2 / EPUB принимает `application/zip`, `application/x-zip`, `application/x-zip-compressed`, `application/x-fictionbook+zip`, `application/x-fbz`; файл копируется в `Imports/` (`importContentUri` держит `.fb2.zip` целиком: копия — «Книга (2).fb2.zip»), `extFromFileName` в `importExternalBook.ts` даёт `.fb2.zip` и голому `.zip` формат `fb2.zip` (читалка сама определяет FB2 / EPUB внутри), а `x.djvu.zip` / `x.pdf.zip` … остаются своим форматом и уходят в «Открыть в другом приложении». Это касается и `azw3` (конвертация FB2 → AZW3, сервер с fbc ≥ 2.0): читалка приложения AZW3 открывает, но собранный из FB2 KF8 ничем не лучше самого FB2, поэтому выбранный на сайте AZW3 приложение не скачивает (как KFX / AZW8; в «Хранилище» подсказка общая «на сайте выбран формат …»), а в `downloadFormats` книги код `azw3` просто появляется — менять в приложении ничего не нужно. Позиция такой EPUB-копии с FB2 на сайте совпадает только по `fraction`: `positionForBookFormat` из `position-sync.js` (вызывается в `restoreReadingPosition`) отбрасывает координаты чужого формата. Если выбранный формат сервер сейчас не предлагает (администратор выключил его в «Конвертация → Скачивание» или нет конвертера), книга по-прежнему сохраняется исходным файлом, но об этом сообщается: аддитивное поле `availableDownloadFormats` (`/api/profile` `user`, `GET/POST /api/preferences`) — форматы, которые сервер отдаёт для FB2 сейчас; хранится в `downloadFormatPreference.ts` (`setServerDownloadFormats`, localStorage, `null` на старых серверах = ничего не показываем); в «Хранилище» у такого варианта пометка «(выключен)» и подсказка, куда идти (`isDownloadFormatOffOnServer`), а после скачивания снэкбар «Сохранено в исходном формате: EPUB3 выключен на сервере» (`downloadFormatFallback` в `downloadQueue` → `onSaved(book, { formatFallback })`)
- Полки на главной: иконка-домик `ShelfHomeToggle` у каждой серверной полки (строки коллекций `LibraryCollections` и карточки `ShelfCard`) и «Убрать с главной» (`PinOff`) в шапке закреплённой полки на главной → `setShelfOnHomeApi` (`POST /api/shelves|smart-shelves/:id/home { on }`), `useInpxServer.setShelfOnHome` (оптимистично, откат при ошибке), затем `homeShelvesEpoch` перезагружает полки главной. `onHome` входит в подпись списка полок, так что смена с сайта тоже подхватывается опросом раз в 8 с. Порядок полок — `homeLayout.shelfOrder` (общий с сайтом): обычные и умные полки — один список «Полки» в «Мои книги» (умная помечена значком поиска `Search` вместо `Library`), полки перетаскиваются за ⠿ в любом порядке (строки `LibraryCollections` и карточки `ShelfCard` через `SortableShelfList`; `src/ui/DragReorder.tsx` — `Reorder` из `motion/react`, `dragListener={false}` + `useDragControls` на ручке с `touch-none`, чтобы строка по-прежнему прокручивала страницу, нажималась и удалялась долгим нажатием; ↑↓ на ручке для клавиатуры и TalkBack; сохраняется один раз при отпускании). `App.handleReorderShelves` → `reorderShelfGroup` (полная перестановка всех полок сохраняется как есть) → `POST /api/preferences`. Списки в `App.libraryShelves` и закреплённые полки на главной (`HomeTab`) идут в этом порядке. «Блоки главной» тоже перетаскиваются. Любая запись `homeLayout` должна сохранять `shelfOrder` (`{ ...layout }`)
- Умная полка из каталога: внизу панели фильтров (`CatalogFilterSheet`, поиск книг) кнопка «Сохранить как умную полку» → поле названия (по умолчанию текст поиска) → `createSmartShelf` (`POST /api/smart-shelves { name, query }`: текст поиска, жанры / формат / год / рейтинг / серия из панели, текущая сортировка; как на сайте). Обработчик — `CatalogTab.handleSaveSmartShelf`, после сохранения `onShelvesChanged` обновляет список полок

### Чтение вслух (TTS)
- Плеер, подсветка и настройки — общий модуль сервера `reader-shared/reader-tts.js` (`npm run sync:shared`), тот же, что на сайте: `reader.js` только создаёт контроллер (`createReaderTts`) и держит wake lock, keep-alive, Media Session, уведомление (`syncNativeTtsMediaSession`) и `inpx-reader-tts-state` для родителя. Разметка: пустой `#reader-tts-dock` и `#rs-tts-mount` в разделе настроек «Озвучка» (`generate-reader-html.mjs`)

### Меню и настройки читалки (как на сайте)
- `public/inpx-reader/index.html` (русский) и `index.en.html` (английский) — это серверный `renderReader()` (`inpx-library-server/src/templates/library.js`): `scripts/generate-reader-html.mjs` **вычисляет** функцию с заглушками и словарём сервера нужного языка (`src/locale-bundles.js`, `ru` / `en`), хелперы — из `src/templates/reader-chrome.js` (без импортов, БД сервера не открывается). Затем подставляет свои разделы настроек и AlReader-обвязку (строка состояния, «Перейти к…», `#ft-goto`, `rsm-bookmark`). Ключа нет в словаре → генератор падает, а не оставляет `${…}`. Генерируется в `sync:shared` / `build:app`
- Тулбар: ←, название + глава, %, закладка. Тап в центр → меню-плитки над футером (`#reader-quick`): Оглавление, Закладки, Заметки, Поиск, Озвучка, День/ночь, Весь экран (immersive), Настройки (+ «PDF: Reflow/страница» для PDF, `#rq-pdf-mode`), ниже A− / размер / A+ и темы. Меню «⋯» больше нет
- Настройки — отдельный лист: список разделов с текущими значениями (`#rs-root`, `data-rs-open` / `data-rs-summary`) → страница раздела (`.rs-page[data-rs-page]`, стрелка `#panel-back`, своя запись в history: системный «Назад» и `__READER_HANDLE_BACK__` возвращают к списку). Разделы приложения: Текст, Цвета и тема (+ картинка фона, инверсия, яркость `#rs-brightness-slot`), Страница (+ PDF), Строка состояния, Управление (перерисовка E-Ink, громкость, автолист, вибрация, зоны), Озвучка, Прочее (сноски, свой CSS). Вне раздела сайт отличается только составом опций
- Каждый ползунок получает − / + (`enhanceRangeSteppers`); при `data-eink="1"` ползунки скрыты, остаются − / + по 44+ px. Режим E-Ink в приложении задаётся настройкой приложения (`useEinkMode`, авто по устройству), не в читалке; на сайте — «Настройки → Экран E-Ink»
- Стили меню и листа — общий блок в конце `reader.css` (копия блока серверного `public/reader.css` «TOOLBAR (slim)» … «E-Ink»; в приложении футер стоит над строкой состояния, поэтому меню и док озвучки добавляют `--r-status-h`)
- `reader-native-bridge.js` подменяет `speechSynthesis` нативным `TtsPlaybackManager`: `speak({ text, utteranceId, rate, pitch, lang, voice })`; без выбранного голоса («Авто») движок берёт `setLanguage(lang)` книги. `onRangeStart` (Android 8+) → iframe-событие `ttsRange` `{ utteranceId, start, end }` → `boundary` для подсветки слова
- Таймер сна «продлевать, пока телефон в руках»: `host.watchMotion` в `reader.js` → `ReaderNative.setMotionWatch({ enabled, threshold, spanMs })` (`TtsMotionWatcher`: акселерометр; движение = отклонение от медленного среднего больше `threshold` м/с² в течение `spanMs`, уровни `TTS_MOTION_LEVELS` из настройки «Чувствительность к движению»; событие не чаще раза в 1,5 с) → iframe-событие `ttsMotion` → отсчёт заново. Датчик включён, только пока идёт озвучка с таймером в минутах; `FoliateReader` выключает его при закрытии. Затухание в последнюю минуту — `speak({ volume })` → `KEY_PARAM_VOLUME`. При нативном TTS WebView keep-alive звук не играет (foreground-сервис держит речь сам)
- Очередь фраз: модуль держит в движке текущую фразу и следующую. Мост (`reader-native-bridge.js`) хранит отданные фразы по `utteranceId` (`speaking` = очередь не пуста) и шлёт `speak({ queue: true })` → `TextToSpeech.QUEUE_ADD`; `TtsPlaybackManager` помнит их в `pending`: пауза делает `tts.stop()` и игнорирует события остановки, `resume()` проигрывает `pending` заново с прерванной фразы. Голос и язык выставляются движку только при изменении (`appliedVoiceKey`) — `setLanguage` перед каждой фразой добавлял паузу
- Пауза — нативная (`host.nativePause`): уведомление и foreground-сервис остаются; кнопки уведомления приходят как `ttsMediaAction` и вызывают `pause/resume({ external: true })`. Каждое нажатие приходит в iframe дважды (слушатель плагина → `FoliateReader` и внедрённый скрипт `emitTtsMediaAction`), поэтому у события есть `seq`, и `reader.js` выполняет каждый `seq` один раз (иначе «Дальше» перескакивало на две фразы)

### Языки интерфейса (русский и английский)
- Язык выбирается при старте: Профиль → Внешний вид → «Язык: Авто / Русский / English» (localStorage `inpx-ui-language`, нет ключа = «Авто»); «Авто» = язык телефона: русский для `ru` / `uk` / `be` / `kk`, иначе английский (`detectDeviceLocale`). Смена языка перезагружает WebView — модульные константы с `t()` всегда на активном языке
- Строки приложения — `src/i18n/ru.ts` (исходный язык, задаёт ключи) и `src/i18n/en.ts` (тип требует все ключи). Ключ `<область>.<имя>`: `common.*` — общие («Отмена», «Каталог»…), иначе по файлу (`catalogTab.*`, `bookDetailsSheet.*`). `t('key', { name })` подставляет `{{name}}`; множественное число — `tn('common.booksCount', n)` с ключами `.one|few|many` (ru) и `.one|other` (en). Числа — `formatNumber(n)`, даты — `Intl.*(intlLocale())`. Формулировки — как в серверных `src/locales/*.json` / `locale-bundles.js` (Reading, Want to read, Collections, Shelves, New from favorites…)
- **Новая строка:** добавить ключ в `ru.ts` и `en.ts` (иначе `npm run lint` упадёт), в коде — `t('…')`; русский текст в `.tsx` / `.ts` не писать. Тесты (`src/i18n/testSetup.ts`) идут на русском
- Сравнения с данными (метка закладки по умолчанию, «Другое», «Неизвестный автор») проверяют и русское, и переведённое значение: книги и закладки, сохранённые на другом языке, остаются распознанными
- Запросы к серверу шлют `Accept-Language` = язык приложения (`apiFetch`, pairing): сообщения об ошибках, жанры и т. п. сервер отдаёт на нём, а не на языке телефона
- Читалка (WebView): генератор пишет `index.html` и `index.en.html`, `FoliateReader` открывает страницу активного языка. Строки читалки — `public/inpx-reader/reader-i18n-ru.json` / `reader-i18n-en.json` (встраиваются в страницу как `#ui-i18n-json`): ключи сервера `reader.*` / `readerJs.*` / `plural.*` и свои `app.*` (разделы настроек, «Перейти к…», тосты). В `reader.js` — `rt('key')` / `rtp('key', { n })`; в `bootstrap.js`, `reader-native-bridge.js`, `tap-zones.js` — `rtx('key')` (`window.__rt` из страницы); в шаблоне генератора — `${A('key')}`. Ключа нет в JSON → генератор падает. Озвучка получает язык через `host.locale` (`rLocale`)
- Нативная часть: `res/values/strings.xml` — английский (по умолчанию), `res/values-ru/strings.xml` — русский. Уведомления (загрузки, озвучка), тексты виджетов, ошибки плагинов берут язык приложения через `UiLocale.str(context, R.string.…)`: при старте `syncNativeUiLocale(getLocale())` → `ReaderNative.setUiLocale` (SharedPreferences `inpx_ui`; смена перерисовывает виджеты). Подписи виджетов в списке виджетов лончера и ярлык «Продолжить» следуют языку телефона — Android берёт их из ресурсов сам
- Названия жанров: индекс хранит русские, сервер добавляет английские аддитивными полями (`displayNameEn` у жанров в `/api/browse/genres`, `/api/search/genres`, `groupNameEn` у групп, `genresDisplayListEn` у книг). В `inpxClient.ts` их подставляют `localizeGenreRows` / `bookGenreLabels` (только при английском интерфейсе; старый сервер без полей → русские названия), `fetchGenres` при `sort=name` пересортировывает группы и жанры по английским названиям; списки жанров в фильтрах сортируются по `intlLocale()`. Жанры скачанной книги сохраняются на языке момента загрузки, карточка книги берёт свежие с сервера
- Не переводятся: демо-экраны `src/shots/*` (скриншоты README), данные сервера (названия книг, авторов, серий, аннотации)

### Виджеты (рабочий стол и экран блокировки)
Только Android, без серверного API (данные — из того, что приложение уже знает). Все три — `widgetCategory="home_screen|keyguard"`: на экране блокировки появляются только там, где Android это поддерживает (хаб планшетов, Android 15–16); на телефонах экран блокировки = уведомление плеера озвучки. Обложка — главный элемент; квадратный/высокий размер (`isWide` = ширина ≥ 1,3 × высоты не выполняется) — обложка на весь виджет (`coverFill`: обрезка под размер, RGB_565, ≤ 420 px) с текстом на градиенте; широкий — обложка во всю высоту слева на размытой копии (`widgetBackdrop`, рисуется в ¼ размера). Размер — `portraitSizePx` (ширина = `MIN_WIDTH`, высота = `MAX_HEIGHT`).
- Вверху каждого виджета — логотип и название библиотеки (`bindLibrary`, строка `widget_lib_row`; на обложке во весь виджет — поверх верхнего градиента `widget_lib_scrim`). `useServerBranding` после загрузки `/api/settings/ui` вызывает `syncLibraryWidget(siteName, logoBlob)`: логотип пишется в кэш приложения (`branding/widget-logo`) и путь уходит в `ContinueWidget.updateLibrary({ name, logoPath })` (prefs `inpx_library_widget`). `showLogo: false` (Admin → Внешний вид) и SVG-логотип (не декодируется в виджете) → только название; пока название не пришло, строка скрыта
- «Продолжить чтение» (`ContinueReadingWidgetProvider`, prefs `inpx_continue_widget`): `ContinueWidget.updateContinueBook` из `App.tsx` (первая книга «Читаю» с файлом на устройстве), тап → `LaunchIntent` `{ action: 'continue', bookId }`
- «Озвучка» (`TtsRemoteWidgetProvider`): состояние — `TtsMediaState` (любое изменение перерисовывает виджет с задержкой 250 мс; `attach(context)` из `TtsPlaybackManager`). Кнопки — `PendingIntent.getService(TtsForegroundService, ACTION_PLAY|PAUSE|PREV|NEXT|STOP|SLEEP)`, те же, что у уведомления. `ACTION_SLEEP` → `ttsMediaAction` `sleep` → `readerTts.cycleSleep()` (15 → 30 → 60 мин → выкл.); конец таймера читалка отдаёт в `updateTtsMediaSession({ sleepEndsAt })` (epoch ms; нативно читать `getData().optLong`, `getDouble` для long отдаёт 0), виджет считает обратный отсчёт `Chronometer` (API 24+) без обновлений. Пока озвучка выключена — книга из prefs «Продолжить», «▶» = `continue` + `startTts: true`: `App` ставит `ttsAutostart`, `FoliateReader` шлёт в iframe `inpx-reader-autostart-tts { token }`, `reader.js` запускает озвучку, когда книга показана и позиция улеглась (1,2 с без `relocate`, ждёт до 30 с)
- «Новое у любимых» (`FollowingWidgetProvider`, prefs `inpx_following_widget`): `App.tsx` при старте, возврате в приложение и смене отметок «Прочитано» — только если виджет стоит (`ContinueWidget.placedWidgets`) — берёт `GET /api/library/following` (8 книг), греет кэш обложек (`warmCoverCache`) и вызывает `updateFollowing`. Каждая обложка обрезается под одну рамку 2:3 (`coverFill`), под ней название (всегда 2 строки, чтобы ряд не «прыгал») и автор. Сетка — `chooseGrid`: 1 ряд из ≤ 4 колонок по числу книг на всю ширину или 2 ряда, если виджет достаточно высокий; выбирается вариант с наибольшей площадью обложек (константы отступов там же должны совпадать с `widget_following.xml`); тап → `{ action: 'book', bookId, title, author, ext }` → карточка книги (`openBookDetailsExclusive`, открытая читалка закрывается)

### Скачанные книги после переустановки
Переустановка (а не обновление — например, APK с другой подписью) стирает список скачанных, а файлы в папке остаются. На Android 11+ новая установка не видит в «Загрузках» файлов прежней (MediaStore отдаёт только свои, прямой доступ запрещён), поэтому `findDownloadsUri` их «не находил», и каждая запись создавала копию «имя (N)» (на Go 7 нашлось 1488 таких копий, в основном обложек `.inpx-reader/covers`, и дубли книг). Решение (`src/lib/storedBooks.ts`, `StoredBooksSettings.tsx`, `App.tsx`): разрешение «Доступ ко всем файлам» (`MANAGE_EXTERNAL_STORAGE`, уже было в манифесте; `requestAllFilesAccess` открывает системный экран) — с ним MediaStore и диск видят старые файлы, запись идёт поверх, а `listBookFiles` их перечисляет. При запуске на свежей установке (список пуст, папка в Download/, доступа нет) один раз спрашиваем (`app_meta` `stored_books_asked`, не в резервной копии настроек); на каждом запуске с доступом — тихий подхват. Подхват: `pickStoredBooks` / `parseStoredBookPath` берут id из имени файла (`<Автор>/<Серия>/<N>-<Название>.<idKey>.<ext>`, `bookIdFromFileKey`: `8_701371` → `8:701371`, `b64_…` → `decodeBookRef`, 32-hex как есть), автора / серию / номер — из пути («Без серии», «Неизвестный автор» и их транслит отбрасываются), оригинал важнее копий «(N)», известные книги (id или файл) пропускаются; `reattachStoredBooks` регистрирует их через `registerDownloadedBook` (с `chaptersPath`, если `.inpx-reader/<key>.json` есть); серверный id старого источника (`9:` вместо `8:`) сводится обычным `/api/books/resolve`. Профиль → Хранилище, под папками: «Доступ к файлам» (когда нужен), «Скачанные книги в папке → Найти» (событие `STORED_BOOKS_RESCAN_EVENT`, App сканирует), «Копии файлов → Удалить» (`cleanupDuplicateFiles` в `BookStorageAccess`: файлы «имя (N).ext» / «имя.ext (N)» внутри папки читалки, включая `.inpx-reader`, удаляются только когда рядом есть оригинал — имя очищается от всех суффиксов до настоящего оригинала (`originalNameOf`: бывают копии копий «x_thumb (1).jpg (1)», а их ближайший «оригинал» сам копия и удаляется в том же проходе; на Go 7 после первой версии оставалось 17 таких); только по кнопке и после подтверждения; SAF-деревья не трогает — там дублей не бывает). Сервер не участвует

### «Скачанные» как папки на диске
Вкладка «Скачанные» (`DeviceLibraryTab.tsx`) показывает книги так, как они лежат в папке библиотеки: уровни пути `localFileName` («Автор/Серия/N-Название.<id>.ext») — папки (`FolderCells` из `LocalFolderBrowser`, плитки или строки по общему виду `useCatalogViewMode('books')`, под именем — число книг во всей папке), под ними книги этого уровня. Строится из списка скачанных (`downloadedFolderView` / `existingDownloadedPath` в `src/lib/downloadedFolders.ts`, тест `downloadedFolders.test.ts`), диск не читается. Порядок — естественный по именам (`Intl.Collator` numeric: «2-…» раньше «10-…», то есть по номеру тома); книга без пути — на верхнем уровне. Выбора сортировки нет. «Назад» / Back поднимаются на уровень и возвращают прокрутку родителя; опустевшая после удаления папка закрывается до ближайшей с книгами; повторное нажатие на вкладку — к корню. Поиск — подходящие книги плоским списком по названию. «Выбрать» — для книг на экране, смена папки сбрасывает выбор. Сервер не участвует

### Блоки главной с устройства («Скачанные», «Папки»)
Только приложение и только это устройство (`src/lib/homeDeviceBlocks.ts`, `app_meta` `home_device_blocks`, по умолчанию выключены): в `homeLayout` аккаунта их нет и на сервер они не уходят — содержимое устройства, работает и актуально без сети. Профиль → Внешний вид, под «Блоки главной» — «С этого устройства» (`HomeDeviceBlocksSettings`). На главной (`HomeTab` prop `device`) идут сразу после «Продолжить чтение» (если он скрыт — первыми), в обычном режиме и в режиме лаунчера. «Скачанные» — `homeDownloadedBooks`: скачанные книги с файлом без книг из папок, сначала по последнему открытию, ≤ 12; «Все» → «Мои книги → Скачанные». «Папки» — папки библиотеки (`readLibraryFolders`, скрытая папка по умолчанию не показывается) плитками `FolderCells`; тап → «Мои книги → Папки» с этой папкой (`openRequest.folderId` → `LocalFolderBrowser` `openFolderRequest`). Раздел «Мои книги» «На устройстве» переименован в «Скачанные» (`common.onTheDevice`); значок одной книги — «Скачана» (`common.bookDownloaded`)

### Обложка на экране сна (BOOX)
Только приложение, только Onyx с Android 10+ (`SleepScreenPlugin.java`, `src/lib/sleepScreen.ts`, настройка `SleepScreenSettings` в Профиль → Внешний вид после «Домашний экран»; одна на устройство: `app_meta` `sleep_screen`, не в снимке аккаунта; по умолчанию выключено). Механизм BOOX (проверен на Go 7, прошивка 4.2, и в открытых проектах BooxUltimatum / Babel): экран сна — dream `com.onyx`; рассылка `onyx.action.SCREENSAVER` с `type` 16, `file` (абсолютный путь), `show_result_hint` false переключает его на картинку (журнал `DreamUtils: setDreamType: IMAGE`), разрешений не нужно. Файл прямо в `/sdcard/Pictures/` используется на месте и декодируется заново при каждом засыпании; файл из другой папки BOOX копирует один раз и потом не видит. Поэтому плагин рисует картинку ровно в размер экрана (портрет, Canvas: обложка из кэша `covers/<key>_full|thumb.jpg`, название, автор, серия, полоса прогресса; или обложка на весь экран с обрезкой по центру; светлый / тёмный фон; полоса 28 % сверху под часы BOOX (его цифровые часы с датой заканчиваются около 24 %; при 22 % дата налезала на обложку), 8 % снизу под его строку состояния) и перезаписывает свою строку MediaStore `Pictures/inpx-reader-sleep.png` (без прав на хранилище); рассылку шлёт только при смене пути (`SharedPreferences` `inpx_sleep_screen`). Выключение = рассылка с `/system/media/standby-1.png` и удаление файла. `App.tsx` берёт ту же текущую книгу, что виджет «Продолжить чтение» (первая из «Читаю» с файлом на устройстве), перед публикацией подкачивает полную обложку (`resolveCoverUrl variant: full`), путь — `resolveCoverPath(id, 'full')` из `continueWidget.ts`. Синхронизация — «последний запрос побеждает» (`pending` + `drain`, настройки читаются в момент запуска), у подкачки обложки предел 8 с, у вызова плагина 20 с: раньше строгая цепочка обещаний вставала навсегда, если один шаг не отвечал, и файл больше не перерисовывался. Плагин отвечает всегда (`finally`) и пишет в logcat под тегом `InpxSleep` («published … layout=… rotation=…» или причину отказа). Под переключателем — состояние (`setSleepScreenStatus` / `useSleepScreenStatus`): «Сейчас на экране сна: «…»», «Нет книги, прочитанной на этом устройстве» (текущей книги с файлом нет — например, сразу после переустановки: данные приложения стёрты, а старая картинка в `Pictures/` осталась, и казалось, что «ничего не меняется»), «Не удалось обновить». Переустановка (а не обновление) случается, когда APK подписаны разными ключами — debug из `build-android.cmd` и release из Android Studio: Android не обновляет приложение с другой подписью, и все локальные данные (настройки устройства, список скачанных) пропадают. Перерисовка только при смене `sleepScreenKey` (книга, целый процент, обложка, настройки) — перелистывание внутри процента ничего не стоит. Часы (обновляются во сне раз в 5 минут), дату и нижнюю строку рисует сам BOOX поверх картинки — настраиваются в BOOX «Рабочий стол и заставка» → «Заставка». Картинка во сне статична, поэтому своих часов и уведомлений на ней нет. Рисунок всегда портретный, как устройство держат обычно: BOOX показывает файл в координатах ориентации сна и обрезает по центру, поэтому в альбомной файл имеет логический размер, а портретный рисунок в нём повёрнут на −R° (`renderForRotation`; R — `Display.getRotation()`, система рисует на R° по часовой) — на панели он стоит ровно и целиком. Перевёрнутое на 180° устройство — тоже портрет: BOOX переворачивает часы, дату и строку состояния вместе с экраном, поэтому рисунок идёт как есть и переворачивается с ними (раньше его разворачивали обратно — обложка стояла вверх ногами, а часы BOOX ложились на её низ вместо оставленной под них полосы). Плагин помнит последнюю картинку и перерисовывает файл при повороте (`DisplayListener`, пауза 1,5 с) и, если поворот не совпал, по рассылке BOOX `com.onyx.action.ONYX_SYSTEM_GOING_TO_SLEEP` (за десятки мс до чтения файла, `goAsync`), пока жив процесс. Часы BOOX в альбомной рисуются по альбомному верху, то есть сбоку от портретного рисунка — полоса «место под часы» их там не прикрывает

### Домашний экран (режим лаунчера для читалок)
Только приложение, без серверного API (на сайте аналога нет и не нужно). `LauncherHomeActivity` (фильтр `MAIN` + `HOME`) в манифесте **всегда включён**, как у любого лаунчера: включённый только программно компонент BOOX Go 7 не оставлял главным экраном после перезагрузки (Lawnchair оставался). `LauncherHomePlugin.load()` возвращает к манифесту только сохранённое «выключено» от старых сборок (сохранённое «включено» не трогает: смена состояния компонента главного экрана может заставить систему выбрать лаунчер заново). Профиль → Внешний вид → «Домашний экран» (`LauncherSettings.tsx`) работает через системные окна, без похода в настройки: «Сделать главным экраном» = `requestHomeRole` (Android 10+: `RoleManager.createRequestRoleIntent(ROLE_HOME)`, системный вопрос «сделать … главным экраном?»; иначе экран `ACTION_HOME_SETTINGS`); когда читалка уже главный экран — «Выбрать другой» (`forgetLauncherHome` + системный выбор) и «Другой главный экран» (явный запуск лаунчера BOOX как аварийный выход). Строка «что держит главный экран» (`LauncherKeepAliveRow`): на Onyx — «Автозаморозка BOOX» с кнопкой «Открыть» (`openFreezeSettings`, экран заморозки BOOX из списка `FREEZE_SCREENS` в `LauncherHomePlugin`, кнопка видна только когда такой экран есть в прошивке, иначе текстовая подсказка про снежинку), на других прошивках — «Работа в фоне» с системным запросом `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (разрешение `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; строка скрыта, когда уже без ограничений). **Потеря роли**: `app_meta` `launcher_wanted` = '1', как только читалка стала главным экраном, '0' после «Выбрать другой» или «Не надо»; `lost` в состоянии = хочет, но не главный экран. `App.tsx` один раз за запуск показывает диалог «Читалка больше не главный экран» (на BOOX с объяснением про автозаморозку) → «Вернуть» = системный запрос роли и подсказка с кнопкой открыть заморозку / разрешить фон, «Не надо» = больше не спрашивать. `LauncherHomeActivity` — невидимый трамплин (`Theme.NoDisplay`, `noHistory`, своя `taskAffinity`): «Домой» → `ACTION_OPEN target=home` в `MainActivity` и `finish()`. HOME нельзя вешать на саму `MainActivity` (`singleTask`): система могла бы создать второй экземпляр WebView в домашнем таске. Нажатие «Домой» с открытой книгой идёт обычным путём виджетов (`useAndroidLaunch` → `handleCloseReader`: досинхронизация позиции и `/position/release`). Режим активен, когда читалка — главный экран по умолчанию (`useLauncherState().isDefault`, перечитывается при возврате в приложение). Тогда `HomeTab` получает `launcher`: главная та же, что в приложении (блоки и порядок — `homeLayout` аккаунта, «Блоки главной»); закреплённых приложений на главной нет (ряд `LauncherAppsRow` и настройки `launcher_blocks` / `launcher_apps` убраны — старые значения в `app_meta` просто не читаются); без сети сетевые блоки не показываются, как в приложении. Нижняя панель в этом режиме: «Профиль» заменён вкладкой «Приложения» (`AppShell` `launcherTabs`) → `LauncherAppsPanel` внутри вкладки «Главная» (состояние `launcherAppsOpen` в `App`): все приложения значками, как в обычном лаунчере (4 / 5 / 6 в ряд по ширине, значок 56 dp с подписью в две строки, `listApps({ iconSize: 144 })` для чёткости на 300 ppi; нажатие — запуск), или списком — переключатель вида (`ViewModeToggle`) вверху, выбор хранится на устройстве (`app_meta` `launcher_apps_view`, по умолчанию значки). В конце, после приложений, — «Профиль и настройки» (открывает вкладку профиля, вкладка «Приложения» при этом подсвечена) и «Другой главный экран»: в сетке такими же значками, в списке строками с подсказкой; видны и пока список грузится или пуст. **Как у обычного лаунчера** (`LauncherApps.tsx`, чистая логика — `arrangeLauncherApps` / `filterLauncherApps` / `pushRecentApp` в `launcherHome.ts`, тест `launcherApps.test.ts`): поле «Найти приложение» в закреплённой панели рядом с переключателем вида (все слова запроса в названии; лупа каталога в шапке на этом экране скрыта — `AppShell` `showSearch`); ряд «Недавние» — последние 5 запущенных отсюда (`app_meta` `launcher_recent_apps`, в сетке из 4 колонок пятое скрыто); долгое нажатие (`useLongPress`) — меню `AppMenuSheet`: ярлыки приложения (`getShortcuts` / `startShortcut` через `LauncherApps`, Android 7.1+, только пока читалка — главный экран: `hasShortcutHostPermission`; до 6, без значков), «О приложении» (`openAppInfo`), «Скрыть из списка / Вернуть в список», «Настройки приостановки» у приостановленного BOOX, «Удалить» (`uninstallApp` = системный диалог `ACTION_DELETE`, разрешение `REQUEST_DELETE_PACKAGES`; нет у предустановленных — `system` из `FLAG_SYSTEM` — и у приложений другого профиля); скрытые приложения — `app_meta` `launcher_hidden_apps`: пропадают из списка, «Недавних» и поиска и лежат только в папке «Скрытые» (последний служебный значок / строка, есть только когда они есть): папка — ещё один уровень того же экрана (свой заголовок, «Назад» выходит из неё, поиск внутри ищет по скрытым), приложение оттуда запускается как обычно и возвращается в список через меню «Вернуть в список»; когда папка опустела, экран сам возвращается к списку. Отдельного режима «показать скрытые» нет; приложения рабочего профиля добавляются из `LauncherApps.getProfiles()` / `getActivityList` (`user` = серийный номер профиля, ключ `package/activity#user`, запуск `startMainActivity`); список перечитывается по событию плагина `appsChanged` (`PACKAGE_ADDED` / `REMOVED` / `CHANGED`, пауза 400 мс) и при возврате в приложение; сортировка без учёта регистра. **Устойчивость** (лаунчер не должен оставлять устройство без главного экрана): `MainActivity.installRenderProcessRecovery` — `WebViewListener.onRenderProcessGone` пересоздаёт activity со свежим WebView (иначе убитый системой рендерер = падение или белый экран); `LauncherBootGuard` считает запуски `MainActivity`, не дошедшие до `__INPX_APP_READY__` (счётчик в `SharedPreferences` `inpx_launcher_boot`, окно 5 минут), и после трёх подряд трамплин `LauncherHomeActivity` открывает другой лаунчер (`LauncherHomePlugin.startOtherLauncher`) вместо читалки, счётчик при этом обнуляется. Пока читалка — главный экран, мастер первого запуска (`OnboardingFlow`) не показывается вместо оболочки (`showOnboarding && !launcherActive`): без вкладки «Приложения» нельзя было бы дойти до настроек устройства и включить Wi-Fi. Нативная заставка с логотипом (`MainActivity.showNativeSplashOverlay`) и возврат «Домой» к началу главной (`onOpenScreen` → `handleTabChange('home')` → `homeRootEpoch`) уже были. Нативная часть этих правок собрана только проверкой `javac` против `android.jar` (без gradle) и на устройстве не проверялась. Хуки настроек устройства (`useSleepScreenSettings`, `useHomeDeviceBlocks`) перечитывают значения по `APP_SETTINGS_HYDRATED_EVENT` (`appSettings.ts`): интерфейс рисуется до загрузки `app_meta`, и список, прочитанный пустым и потом сохранённый, стирал сохранённое (так пропадали закреплённые приложения, пока они были). Список приложений — `listApps` (MAIN/LAUNCHER из `<queries>`, без `QUERY_ALL_PACKAGES`; иконки PNG base64; кэш перечитывается при каждом возврате в приложение). Приостановленные BOOX приложения — это выключенный пакет (`enabled=3`), Android их по умолчанию не отдаёт, и они пропадали из списка (например «Файловый менеджер +»): запрос идёт с `MATCH_DISABLED_COMPONENTS`, такие приложения приходят с `frozen: true` и рисуются со снежинкой. Запуск (`launchApp`) на Onyx проверяет живое состояние пакета и для выключенного шлёт `onyx.action.open_frozen_app` в `com.onyx` (`args_pkg`, `args_class`, `args_user_id`) — тот же путь, что нажатие на значок со снежинкой в лаунчере BOOX: `EACStatusChangedReceiver.A` → `UnFreezeApplicationAction` → запуск (прочитано dexdump’ом, проверено на Go 7). «Назад» на корне не выходит из приложения: на другой вкладке → «Главная», на «Главной» ничего (`useAppBackButton(…, onRootBack)`). Аварийный выход — `openOtherLauncher` (явный запуск другого HOME, Onyx предпочитается); выключение режима, пока читалка была главным экраном, сразу открывает другой лаунчер. **BOOX: автозаморозка.** Лаунчер BOOX хранит для каждого приложения флаг автозаморозки (`isAutoFreeze` в журнале `RxEACUtils`; у сторонних приложений по умолчанию включён, у Google Play / Chrome — нет). Через несколько минут в фоне его `ApplicationFreezeHelper` force-stop + `setApplicationEnabledSetting(false)` для всего пакета, после чего `RoleControllerServiceImpl` снимает с читалки роль `HOME` («Removing package that no longer qualifies for the role») — выглядело как «сбрасывается после перезагрузки». Наш трамплин сразу закрывается, поэтому для BOOX читалка — обычное фоновое приложение (Lawnchair держит живую домашнюю activity). Лечится только в интерфейсе BOOX — в русском интерфейсе это «Приостановка приложений» (экран «Настройки приостановки»: переключатель у каждого приложения, OFF = не приостанавливать; туда же ведёт снежинка на экране «Приложения»). Кнопка «Открыть» в настройке «Домашний экран» открывает сам экран «Настройки приостановки» — тем же путём, что и BOOX (`com.onyx` `EACStatusChangedReceiver.y`, прочитано dexdump’ом из прошивки 4.2): на телефонах / планшетах неявный `onyx.settings.action.APP_FREEZE_MANAGEMENT`, на читалках (Go 7: его никто не принимает) `com.onyx/.common.setting.ui.SettingContainerActivity` (экспортирован, команду в страницу превращает в коде — компонент указывается явно) с `com.onyx.app.freeze.page`; запасной вариант — тот же контейнер с `onyx.settings.action.application` («Управление приложениями», откуда до приостановки одно касание). `FREEZE_SCREENS` в `LauncherHomePlugin`, проверено на Go 7 с холодного лаунчера. Контейнер отклоняет `APP_FREEZE_MANAGEMENT` («Illegal intent action … forgot to config fragment»). На том же экране BOOX есть «Автоматически приостанавливать приложение после установки» (по умолчанию ON) — новое приложение сразу попадает в приостановленные; «Без ограничений» в расходе батареи и «Приостановить работу в неактивный период» на это не влияют. Состояние плагина отдаёт `onyx` (`OnyxFrontLight.isLikelyOnyxDevice()`), и «Домашний экран» на Onyx всегда показывает предупреждение `launcherSettings.onyxFreezeHint`. Проверено на Go 7 (прошивка 4.2): с выключенной заморозкой роль держится после 10 минут простоя и перезагрузки. Стандартный лаунчер BOOX виджетов не поддерживает

### Производительность (правила после аудита 2026-11)
- **Все четыре вкладки смонтированы всегда** (`TabScreenPanel` прячет неактивные), поэтому любое изменение состояния в `App.tsx` перерисовывает все экраны. Не добавлять в `App` состояние, которое меняется часто (таймеры, прогресс, позиция чтения).
- Открытая читалка сообщает позицию после каждой страницы (`inpx-reader-sync-store`): `App` только помечает «есть изменения» (`handleReaderStoreSynced`) и обновляет списки / виджет при закрытии книги (`closeReader`) или уходе приложения в фон. Не вызывать `bumpReaderLocal` на каждое сообщение.
- Пропсы-функции для вкладок, от которых зависят эффекты с запросами, должны быть стабильными (`useCallback` + ref): `loadShelfBooks` был инлайновым и перезагружал открытую полку при каждом рендере `App`.
- Плитка `BookCoverTile` и строка `FlibustaBookRow` обёрнуты в `React.memo`; списки (`BookCoverGrid`, `CatalogBookList`) передают им одну стабильную функцию `onBookClick(book)` / `onBookLongPress(book)` — не возвращать инлайновые `onClick={() => …}` в этих списках. Длинные списки монтируются порциями по 60 (`useIncrementalRender`, внутренняя прокрутка `VirtualList` больше не используется).
- Очередь скачивания: `downloadQueue.subscribe` — только смена статусов; байтовый прогресс идёт через `subscribeProgress` (`useBookDownloadProgress(id, active)` в плитке, `useDownloadQueue(true)` в листе очереди и виджете).
- Опрос полок — раз в 30 с (`SHELVES_POLL_MS`) плюс вход на вкладку / возврат в приложение; `refreshShelves` не трогает состояние, если ответ не изменился (`shelfDataRef`).
- Полные списки id («Прочитано», «Избранное», «Хочу прочитать», прогресс) и разделы «Моих книг» запрашиваются страницами по 500; сервер до 2.14 отвечает по 24, поэтому циклы считают реально пришедшие строки (`loadAllPages` в `useInpxServer.ts`).
- `persistLibrarySnapshot` пишет в SQLite только изменившиеся строки (`persistedLibrary` в `localDb.ts`); кто пишет в таблицу `books` напрямую — только через `upsertBook` / `deleteBook`.
- Проверка файлов скачанных книг (`useLocalBookFileVerification`) при входе на вкладку / возврате в приложение — не чаще раза в 5 минут; старт и смена папки проверяют всегда.
- Обложки: не больше 6 загрузок одновременно, «у книги нет обложки» (404) помнится 10 минут (`coverCache.ts`).
- Каталог: пауза (`pauseListFetch`) не входит в зависимости эффектов `useCatalogData` — возврат на вкладку и закрытие книги не перезагружают список; догружается только запрос, пропущенный во время паузы. «Потянуть для обновления» перезагружает и открытую страницу автора / серии / жанра.
- Отметка «Прочитано» онлайн задаёт желаемое состояние (`inpxServer.setRead` → `ensureBookReadState`), а не переключает: `readIds` сразу после запуска ещё пусты.
- Таймаут одного запроса не переводит приложение в офлайн: `reportConnectionLost` (`useServerConnection.ts`) сначала спрашивает `/health` и отключает только молчащий сервер.

### Безопасность
- Пароли хранятся в localStorage (для локального приложения приемлемо)
- Нет необходимости в HTTPS для локальной разработки
- HTTPS с домашним CA (mkcert): `network_security_config.xml` доверяет хранилищам `system` + `user` — CA, установленный пользователем в настройках Android, принимается нативными запросами и WebView. Проверку цепочки / имени сервера не ослаблять (никаких своих TrustManager, `onReceivedSslError`). Импорта CA для отдельного сервера нет. Серверного API нет
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
2. **Обновить `src/i18n/ru.ts` и `src/i18n/en.ts`** (и `public/inpx-reader/reader-i18n-*.json` для читалки)
   - Использовать те же формулировки на обоих языках
   - Сохранять единый стиль сообщений об ошибках

### Проверка перед релизом

- [ ] API и sync работают с сервером
- [ ] Все API endpoint'ы работают корректно
- [ ] Терминология единообразна; новые строки есть в `ru.ts` и `en.ts`, английский интерфейс без русского текста
- [ ] Сообщения об ошибках совпадают
- [ ] Прогресс чтения синхронизируется
- [ ] Закладки и заметки синхронизируются
