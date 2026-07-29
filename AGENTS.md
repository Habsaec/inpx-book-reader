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
| Sync по `bookId` | Позиция, закладки, заметки синхронизируются; путь файла на диске — snapshot при скачивании |
| Серия и путь | `GET /api/books/:id/meta` → `seriesList` из INPX-индекса → `bookStorage.ts` |
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
- `GET /api/profile` — данные профиля пользователя
- `POST /api/auth/device` — выдать device token (Android, после Basic Auth)
- `DELETE /api/auth/device/:tokenId` — отозвать device token
- `GET /api/favorites` — избранные авторы и серии (`authors`: `name`, `displayName`, `bookCount`, `coverBookId`; `series`: `name`, `displayName`, `bookCount`, `previewBookIds`)
- `POST /api/favorites/authors` — добавить/удалить автора в избранное
- `POST /api/favorites/series` — добавить/удалить серию в избранное

#### Библиотека и каталог
- `GET /api/library/recent` — недавние книги
- `GET /api/library/continue` — продолжить чтение
- `GET /api/library/read` — прочитанные книги
- `GET /api/library/recommended` — рекомендации
- `GET /api/catalog` — поиск по каталогу; additive filters: `genre` (CSV/repeated, OR — хотя бы один), `lang`, `format`, `year`, `minRate`, `hasSeries` (1/0)
- `GET /api/search?q=` — единый поиск: totals `{ books, authors, series }`; затем drilldown через `/api/catalog?field=`
- `GET /api/search/genres?q=` — жанры среди книг текущей выдачи (фасет для фильтра; опционально format/year/minRate/hasSeries)
- `GET /api/search/suggest` — подсказки поиска
- `GET /api/browse/authors` — список авторов
- `GET /api/browse/series` — список серий
- `GET /api/browse/genres` — список жанров
- `GET /api/facet-books` — книги по фильтру (автор/серия/жанр)

#### Книги и контент
- `GET /api/books/:id/meta` — метаданные из INPX-индекса (`seriesList`, автор, жанры) — **источник правды для скачивания и путей на диске**
- `GET /api/books/:id/content` — скачать книгу
  - ID с NUL/control-символами (Flibusta): путь `/api/books/b64/<base64url>/content` (см. `bookRef.ts` / серверный `book-ref.js`), иначе HTTP 400
- `GET /api/books/:id/cover` — обложка (full)
- `GET /api/books/:id/cover-thumb` — обложка (миниатюра)
- `GET /api/books/:id/details` — детали книги
- `GET /api/books/:id/review` — рецензия на книгу
- `GET /api/authors/portrait` — портрет автора

#### Закладки и прогресс
- `GET /api/bookmarks` — список закладок
- `POST /api/bookmarks/:id` — добавить/удалить закладку
- `POST /api/read/:id` — отметить книгу как прочитанную
- `GET /api/books/:id/position` — позиция чтения (`position`, `progress`, `fraction`, `fb2Href`, `sectionIndex`, `textOffset`, `textQuote`, `textSectionLength`, `sectionPageFraction`, `paginatorPage`, `paginatorPages`, `layoutMode`, `updatedAt`, `positionVersion`, `revision`)
- `GET /api/books/:id/reader-sync-meta` — ревизии закладок/заметок и метка позиции для sync
- `POST /api/books/:id/position` — CAS-сохранение позиции: обязательны `positionVersion: 4` и `baseRevision`; ответ включает новую `revision`, конфликт — `409 { current }`, устаревший клиент получает `428`; ставит «прочитано» при 99% и снимает отметку при повторном чтении ниже 95%
- `GET /api/books/:id/bookmarks` — закладки книги
- `POST /api/books/:id/bookmarks` — добавить закладку
- `DELETE /api/books/:id/bookmarks/:bmId` — удалить закладку
- `GET /api/books/:id/annotations` — заметки книги
- `POST /api/books/:id/annotations` — добавить заметку
- `DELETE /api/books/:id/annotations/:aid` — удалить заметку

#### История и activity sync
- `GET /api/reader-activity-sync-meta` — ревизии «прочитано» и истории чтения
- `POST /api/reading-history/:id` — отметить открытие книги (`lastOpenedAt`)
- `DELETE /api/reading-history/:id` — удалить запись из истории чтения

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

#### Полки (Shelves)
- `GET /api/shelves` — список полок
- `POST /api/shelves` — создать полку
- `DELETE /api/shelves/:id` — удалить полку
- `GET /api/shelves/:id/books` — книги на полке
- `POST /api/shelves/:id/books` — добавить книгу на полку
- `DELETE /api/shelves/:id/books/:bookId` — удалить книгу с полки

#### Настройки сервера
- `GET /api/settings/ui` — UI настройки (название, логотип)
- `GET /health` — проверка доступности сервера

### Android UI (независимый от сервера)

Android-приложение имеет **собственный мобильный UX** — не копирует `/lite/` и не повторяет веб-layout сервера.

**Общее с сервером (данные, не экраны):**
- Те же API и sync по `bookId`
- Доменная терминология в текстах ошибок и подписях к данным («Полки», «Закладки», …)
- Брендинг библиотеки через `GET /api/settings/ui` (название, логотип) — опционально

**Своё в приложении:**
- Навигация, табы, жесты, safe-area, кнопка «Назад»
- Layout списков и карточек — под Android WebView
- Анимации с учётом WebView (`reducedMotion="always"`)

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
- Индикация статуса подключения в шапке приложения

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

Если нужно подтянуть название/логотип с сервера — `GET /api/settings/ui`.
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
