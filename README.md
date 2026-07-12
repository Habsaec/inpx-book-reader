# INPX Book Reader

> 📱 **Только Android.** Приложение разрабатывается исключительно для платформы Android (Capacitor APK). iOS и десктоп не поддерживаются и не планируются.
>
> ⚠️ `server.ts` — это прокси **только для локальной разработки** в браузере. В production (APK) не используется. Не улучшать, не оптимизировать.

Мобильная читалка для [INPX Library Server](../inpx-library-server) — каталог, офлайн-полка, профиль как на сервере.

## Быстрый старт

1. Запустите **INPX Library Server** (порт по умолчанию `3000`):

   ```bash
   cd D:\inpx-library-server
   npm start
   ```

2. Запустите **INPX Book Reader** (порт `3100`):

   ```bash
   cd D:\inpx-book-reader
   npm install
   npm run dev
   ```

3. Откройте в браузере: `http://localhost:3100`

4. В **Настройки → Сервер INPX** укажите:
   - Адрес: `http://127.0.0.1:3000` (или IP вашего ПК в локальной сети)
   - Логин и пароль пользователя библиотеки
   - Снимите галочку «Демонстрационный каталог»
   - Нажмите **Проверить подключение**

## Android (телефон / планшет)

### Вариант A — через Wi‑Fi (рекомендуется для этого приложения)

1. На ПК запустите оба сервера (`inpx-library-server` и `inpx-book-reader`).
2. Узнайте IP ПК в локальной сети (например `192.168.1.42`).
3. На телефоне откройте Chrome: `http://192.168.1.42:3100`
4. В настройках приложения укажите адрес INPX: `http://192.168.1.42:3000` (IP ПК, порт сервера библиотеки).

> Прокси встроен в `server.ts` — телефон обращается к reader на `:3100`, а тот пересылает запросы к INPX на `:3000`.

### Вариант B — встроенный lite-интерфейс сервера

На сервере уже есть мобильный UI без установки:

`http://<IP-сервера>:3000/lite/`

Подходит для чтения и профиля прямо в браузере Android.

### Добавить на главный экран (PWA)

В Chrome на Android: меню → «Установить приложение» / «Добавить на главный экран».

## Android (Android Studio / APK)

Проект настроен через **Capacitor**. Подробная инструкция: [docs/ANDROID.md](docs/ANDROID.md)

```powershell
cd D:\inpx-book-reader
npm install
npm run build:android    # собрать веб и синхронизировать с android/
npm run android:open     # открыть в Android Studio
```

В Android Studio: **Build → Build APK(s)**.  
Debug-APK: `android/app/build/outputs/apk/debug/app-debug.apk`

На телефоне в настройках приложения укажите `http://<IP-ПК>:3000` (не `localhost`).

## Демо-режим

Если сервер недоступен, включите «Демонстрационный каталог» — откроется профиль и 4 классические книги для офлайн-чтения.

## Архитектура

| Компонент | Назначение |
|-----------|------------|
| `src/lib/inpxClient.ts` | REST API клиент (`/api/catalog`, `/api/profile`, …) |
| `server.ts` | Прокси к INPX (обходит CORS), локальный sync |
| `ProfileTab` | Профиль как на сервере: чтение, закладки, заметки |
| `CatalogTab` | Каталог через REST API, не OPDS |

## API сервера (новые endpoint'ы)

Добавлены в `inpx-library-server`:

- `GET /api/profile` — данные профиля (JSON)
- `GET /api/browse/authors|series|genres` — списки для каталога
- Basic Auth для REST API (логин/пароль в заголовке Authorization)

Перезапустите INPX Library Server после обновления.
