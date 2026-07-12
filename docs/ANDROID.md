# Сборка APK через Android Studio

Приложение упаковывается через **Capacitor 7**: React-сборка внутри нативного WebView. Node-прокси (`server.ts`) в APK **не нужен** — запросы идут напрямую на INPX Library Server (Basic Auth + CapacitorHttp).

## Что нужно установить

1. **Node.js** 20+
2. **Android Studio** (Ladybug или новее) с:
   - Android SDK (API 34+)
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
3. **JDK 17** (обычно идёт с Android Studio)

Переменные окружения (Windows):

```powershell
# Пример — путь к SDK уточните в Android Studio → Settings → Android SDK
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH += ";$env:ANDROID_HOME\platform-tools"
```

## Первоначальная настройка (один раз)

```powershell
cd D:\inpx-book-reader
npm install
npm run build:app
npx cap add android
npm run build:android
```

Команда `build:android` собирает веб-часть и копирует её в `android/app/src/main/assets/`.

## Открыть в Android Studio

```powershell
npm run android:open
```

Или: **File → Open** → папка `D:\inpx-book-reader\android`.

## Собрать APK

1. Дождитесь окончания **Gradle Sync** (нижняя строка Android Studio).
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. Готовый файл:  
   `android/app/build/outputs/apk/debug/app-debug.apk`

Установка на телефон:

```powershell
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

Или скопируйте APK на телефон и откройте вручную (нужно разрешить установку из неизвестных источников).

## Release-сборка (подписанный APK)

1. **Build → Generate Signed Bundle / APK**
2. Выберите **APK**, создайте keystore (запомните пароли).
3. Build variant: **release**

## После изменений в коде React

```powershell
npm run build:android
```

Затем в Android Studio: **Run ▶** или пересоберите APK.

Быстрая синхронизация без полной пересборки веба (если `dist/` уже актуален):

```powershell
npm run android:sync
```

## Настройка приложения на телефоне

1. Запустите **INPX Library Server** на ПК или NAS в локальной сети.
2. В приложении: **Ещё → Сервер INPX**
3. Адрес: `http://192.168.x.x:3000` (IP машины с библиотекой, **не** `localhost`)
4. Логин и пароль пользователя INPX
5. Снимите «Демонстрационный каталог» → **Проверить подключение**

> Телефон и сервер должны быть в одной Wi‑Fi сети.  
> HTTP (без HTTPS) разрешён в приложении для домашних серверов.

## INPX Library Server

Убедитесь, что на сервере включены обновления с Basic Auth и `/api/profile` (из предыдущего шага). Перезапустите сервер:

```powershell
cd D:\inpx-library-server
npm start
```

## Устранение проблем

| Проблема | Решение |
|----------|---------|
| Gradle sync failed | File → Invalidate Caches; проверьте JDK 17 в Settings → Build Tools |
| `SDK location not found` | Создайте `android/local.properties`: `sdk.dir=C\:\\Users\\YOU\\AppData\\Local\\Android\\Sdk` |
| Нет связи с сервером | Используйте IP ПК, не `127.0.0.1`; проверьте файрвол Windows для порта 3000 |
| Cleartext HTTP blocked | В `capacitor.config.ts` уже `cleartext: true`; пересоберите `npm run build:android` |
| Белый экран | Chrome DevTools: `chrome://inspect` → WebView; проверьте Logcat |

## Структура

```
inpx-book-reader/
├── capacitor.config.ts   # id приложения, CapacitorHttp
├── dist/                 # сборка Vite (webDir)
├── android/              # проект Android Studio (Gradle)
└── src/lib/platform.ts   # isNativeApp() — прямой API без прокси
```
