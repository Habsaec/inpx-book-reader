import React from 'react';
import { theme } from '../lib/appTheme';
import {
  Sun,
  Moon,
  Tv,
  ShieldCheck,
  LogOut,
  QrCode,
} from 'lucide-react';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import ViewModeToggle from '../ui/ViewModeToggle';
import { ServerConfig } from '../types';
import {
  StorageDirectory,
  pickStorageDirectory,
  ensureStorageDirectory,
  isValidStorageDirectory,
} from '../lib/storageDirectory';
import { isAndroid } from '../lib/platform';
import { BookStorage } from '../lib/bookStoragePlugin';
import {
  addLibraryFolder,
  defaultLibraryFolder,
  readLibraryFolders,
  removeLibraryFolder,
  setDefaultLibraryFolder,
  setHideDefaultInLocal,
} from '../lib/libraryFolders';
import { insecureHttpWarning } from '../lib/serverUrl';
import { clearServerCredentials } from '../lib/secureServerConfig';
import { parsePairingQrPayload, redeemPairingCode } from '../lib/inpxClient';
import { scanAppPairingQr, isQrScanCanceled } from '../lib/scanAppPairingQr';
import type { AppAppearance, AppColorSource } from '../lib/serverTheme';
import type { EinkModePref } from '../lib/einkMode';
import AppUpdateSection from './AppUpdateSection';
import ServerNetworkSettings, { canTestServerConnection } from './ServerNetworkSettings';
import { textStyles, semantic, radii, motion } from '../ui/tokens';
import { usePageTitle } from '../ui/pageTitle';
import Button from '../ui/Button';
import { useDialog } from '../ui/Dialog';
import { useSnackbar } from '../ui/Snackbar';
import { useCalmMotion } from '../hooks/useCalmMotion';
import {
  exportAppSettingsJson,
  getHomeRecentMode,
  getStorageNameStyle,
  importAppSettingsJson,
  setAppSettingRaw,
  APP_SETTING_KEYS,
  type HomeRecentMode,
  type StorageNameStyle,
} from '../lib/appSettings';
import { motion as Motion } from 'motion/react';

interface SyncSettingsTabProps {
  storageDirectory: StorageDirectory | null;
  onChangeStorageDirectory: (dir: StorageDirectory | null) => void;
  appearance: AppAppearance;
  onChangeAppearance: (mode: AppAppearance) => void;
  colorSource: AppColorSource;
  onChangeColorSource: (source: AppColorSource) => void;
  useServerBackground: boolean;
  onChangeUseServerBackground: (on: boolean) => void;
  hasServerBackground: boolean;
  isAppDark: boolean;
  einkMode: EinkModePref;
  onChangeEinkMode: (mode: EinkModePref) => void;
  einkDetected: boolean;
  serverConfig: ServerConfig;
  onChangeServerConfig: (config: Partial<ServerConfig>) => void;
  onTestConnection: () => void;
  onPairingLogin: (result: {
    url: string;
    username: string;
    deviceToken: string;
    deviceTokenId: string;
  }) => void;
  onForgetServer?: () => void;
  connectionError?: string | null;
  embedded?: boolean;
  /** Profile summary rendered at the top of the settings scroll. */
  scrollHeader?: React.ReactNode;
  /** Bumped to scroll the connection block into view (header status icon). */
  connectionFocusEpoch?: number;
}

export default function SyncSettingsTab({
  storageDirectory,
  onChangeStorageDirectory,
  appearance,
  onChangeAppearance,
  colorSource,
  onChangeColorSource,
  useServerBackground,
  onChangeUseServerBackground,
  hasServerBackground,
  isAppDark,
  einkMode,
  onChangeEinkMode,
  einkDetected,
  serverConfig,
  onChangeServerConfig,
  onTestConnection,
  onPairingLogin,
  onForgetServer,
  connectionError,
  embedded = false,
  scrollHeader,
  connectionFocusEpoch = 0,
}: SyncSettingsTabProps) {
  usePageTitle('Настройки', undefined, !embedded);
  const [pickingFolder, setPickingFolder] = React.useState(false);
  const [forgetting, setForgetting] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const authActionGen = React.useRef(0);
  const { viewMode: homeViewMode, setViewMode: setHomeViewMode } = useCatalogViewMode('home');
  const { viewMode: booksViewMode, setViewMode: setBooksViewMode } = useCatalogViewMode('books');
  const snackbar = useSnackbar();
  const [homeRecent, setHomeRecent] = React.useState(getHomeRecentMode);
  const [libraryFolders, setLibraryFolders] = React.useState(() => readLibraryFolders(storageDirectory));
  React.useEffect(() => {
    const refresh = () => setLibraryFolders(readLibraryFolders(storageDirectory));
    window.addEventListener('inpx-settings', refresh);
    return () => window.removeEventListener('inpx-settings', refresh);
  }, [storageDirectory]);
  const [nameStyle, setNameStyle] = React.useState(getStorageNameStyle);
  const dialog = useDialog();
  const settingsScrollRef = React.useRef<HTMLDivElement>(null);
  const connectionFocusSeen = React.useRef(connectionFocusEpoch);
  const themeInput = theme.input;
  const themeAccentText = theme.accentText;
  const themeTextMuted = theme.textMuted;

  const httpWarning = insecureHttpWarning(serverConfig.url);

  const handlePickFolder = async () => {
    setPickingFolder(true);
    try {
      const picked = await pickStorageDirectory();
      if (isValidStorageDirectory(picked)) {
        const next = addLibraryFolder(libraryFolders, picked);
        setLibraryFolders(next);
        const def = defaultLibraryFolder(next);
        onChangeStorageDirectory({ label: def.label, uri: def.uri });
        snackbar.show(next.folders.length === libraryFolders.folders.length ? 'Эта папка уже в списке' : 'Папка добавлена');
      }
    } catch (error) {
      snackbar.show(error instanceof Error ? error.message : 'Не удалось выбрать папку', undefined, 'error');
    } finally {
      setPickingFolder(false);
    }
  };

  const handleForgetServer = async () => {
    if (scanning) return;
    const accepted = await dialog.confirm({
      title: 'Забыть сервер?',
      message: 'Адрес и данные входа будут удалены с этого устройства.',
      confirmLabel: 'Забыть',
      cancelLabel: 'Отмена',
      destructive: true,
    });
    if (!accepted) return;
    setForgetting(true);
    const gen = ++authActionGen.current;
    const snapshot = serverConfig;
    // Wipe React state first so the 250ms persist effect cannot re-save credentials
    // after clearServerCredentials finishes.
    onChangeServerConfig({
      url: 'http://127.0.0.1:3000',
      username: '',
      password: '',
      deviceToken: '',
      deviceTokenId: '',
      connectionStatus: 'disconnected',
    });
    try {
      await clearServerCredentials(snapshot);
      if (gen !== authActionGen.current) return;
      onForgetServer?.();
    } finally {
      if (gen === authActionGen.current) setForgetting(false);
    }
  };

  const handleScanQr = async () => {
    if (forgetting) return;
    setScanning(true);
    const gen = ++authActionGen.current;
    try {
      const raw = await scanAppPairingQr();
      if (gen !== authActionGen.current) return;
      const payload = parsePairingQrPayload(raw);
      const redeemed = await redeemPairingCode(payload.url, payload.code);
      if (gen !== authActionGen.current) return;
      onPairingLogin({
        url: redeemed.serverUrl || payload.url,
        username: redeemed.username,
        deviceToken: redeemed.deviceToken,
        deviceTokenId: redeemed.deviceTokenId,
      });
    } catch (error) {
      if (gen !== authActionGen.current) return;
      if (isQrScanCanceled(error)) return;
      snackbar.show(error instanceof Error ? error.message : 'Не удалось войти по QR', undefined, 'error');
    } finally {
      if (gen === authActionGen.current) setScanning(false);
    }
  };

  React.useEffect(() => {
    if (!isAndroid() || isValidStorageDirectory(storageDirectory)) return;
    let cancelled = false;
    void ensureStorageDirectory(storageDirectory)
      .then((resolved) => {
        if (!cancelled && resolved) onChangeStorageDirectory(resolved);
      })
      .catch((err) => console.warn('[SyncSettingsTab] ensureStorageDirectory failed:', err));
    return () => {
      cancelled = true;
    };
  }, [storageDirectory, onChangeStorageDirectory]);

  const scrollServerIntoView = React.useCallback(() => {
    const root = settingsScrollRef.current;
    const server = root?.querySelector('#settings-server');
    if (!root || !(server instanceof HTMLElement)) {
      root?.scrollTo({ top: 0 });
      return;
    }
    const top = server.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    root.scrollTo({ top: Math.max(0, top) });
  }, []);

  React.useLayoutEffect(() => {
    if (connectionFocusEpoch === connectionFocusSeen.current) return;
    connectionFocusSeen.current = connectionFocusEpoch;
    scrollServerIntoView();
  }, [connectionFocusEpoch, scrollServerIntoView]);

  const connecting = serverConfig.connectionStatus === 'testing';
  React.useLayoutEffect(() => {
    if (!connecting) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    scrollServerIntoView();
  }, [connecting, scrollServerIntoView]);

  const appearanceOptions: Array<{ id: AppAppearance; label: string; icon: typeof Sun }> = [
    { id: 'light', label: 'День', icon: Sun },
    { id: 'dark', label: 'Ночь', icon: Moon },
    { id: 'auto', label: 'Авто', icon: Tv },
  ];
  const colorOptions: Array<{ id: AppColorSource; label: string }> = [
    { id: 'server', label: 'Сервер' },
    { id: 'system', label: 'Система' },
  ];

  const sectionClass = `space-y-3`;
  const sectionTitle = `${textStyles.labelBold} tracking-wide ${theme.textMuted}`;
  const inputClass = `w-full px-4 py-3.5 ${textStyles.body} ${radii.md} ${theme.inputFocus} ${themeInput}`;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div
        ref={settingsScrollRef}
        data-large-title={embedded ? '' : undefined}
        className="flex-1 overflow-y-auto inpx-page-scroll px-5 py-4 space-y-8"
      >
        {scrollHeader}
        <section id="settings-server" className={sectionClass}>
          <div className="flex justify-between items-baseline gap-3 select-none">
            <h3 className={sectionTitle}>Сервер</h3>
            <span className={`${textStyles.caption} ${
              connecting ? semantic.warning :
              serverConfig.connectionStatus === 'connected' ? semantic.success :
              theme.textMuted
            }`}>
              {connecting
                ? 'Проверка…'
                : serverConfig.connectionStatus === 'connected'
                  ? 'Подключён'
                  : 'Отключён'}
            </span>
          </div>

          {httpWarning && (
            <p className={`${textStyles.caption} ${semantic.warning} leading-relaxed`} role="alert">
              {httpWarning}
            </p>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="server-url" className={`${textStyles.caption} ${theme.textMuted}`}>Адрес сервера</label>
              <input
                id="server-url"
                type="url"
                inputMode="url"
                value={serverConfig.url}
                onChange={(e) => onChangeServerConfig({ url: e.target.value })}
                placeholder="https://library.example.com"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="url"
                disabled={connecting}
                className={inputClass}
              />
            </div>

            {connectionError && (
              <p role="alert" className={`${textStyles.caption} ${semantic.error}`}>{connectionError}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="server-username" className={`${textStyles.caption} ${theme.textMuted}`}>Логин</label>
                <input
                  id="server-username"
                  type="text"
                  value={serverConfig.username || ''}
                  onChange={(e) => onChangeServerConfig({ username: e.target.value })}
                  autoComplete="username"
                  disabled={connecting}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="server-password" className={`${textStyles.caption} ${theme.textMuted}`}>Пароль</label>
                <input
                  id="server-password"
                  type="password"
                  value={serverConfig.password || ''}
                  onChange={(e) => onChangeServerConfig({ password: e.target.value })}
                  autoComplete="current-password"
                  disabled={connecting}
                  className={inputClass}
                />
              </div>
            </div>

            {isAndroid() && (
              <p className={`${textStyles.caption} ${themeTextMuted} inline-flex items-center gap-2`}>
                <ShieldCheck className={`w-4 h-4 shrink-0 ${themeAccentText}`} aria-hidden />
                Пароль защищён Android Keystore
              </p>
            )}

            {isAndroid() && (
              <Button fullWidth variant="secondary" onClick={() => void handleScanQr()} loading={scanning} disabled={scanning || forgetting || connecting}>
                <QrCode className="w-4 h-4 inline mr-1" aria-hidden />
                Сканировать QR
              </Button>
            )}

            <Button fullWidth onClick={onTestConnection} disabled={connecting || !canTestServerConnection(serverConfig)} loading={connecting}>
              {connecting ? 'Подключение…' : 'Подключить'}
            </Button>

            <Button variant="danger" fullWidth onClick={() => void handleForgetServer()} loading={forgetting} disabled={forgetting || scanning || connecting}>
              <LogOut className="w-4 h-4 inline mr-1" aria-hidden />
              Забыть сервер
            </Button>
          </div>
        </section>

        <ServerNetworkSettings
          serverConfig={serverConfig}
          onChangeServerConfig={onChangeServerConfig}
        />

        <section className={sectionClass}>
          <h3 className={sectionTitle}>Внешний вид</h3>
          <div>
            <SettingsChoice
              label="Тема"
              options={appearanceOptions.map((item) => {
                const Icon = item.icon;
                return {
                  id: item.id,
                  label: item.label,
                  selected: appearance === item.id,
                  onSelect: () => onChangeAppearance(item.id),
                  icon: <Icon className="w-3.5 h-3.5" aria-hidden />,
                };
              })}
            />
            <SettingsChoice
              label="Цвет"
              options={colorOptions.map((item) => ({
                id: item.id,
                label: item.label,
                selected: colorSource === item.id,
                onSelect: () => onChangeColorSource(item.id),
              }))}
            />
            <SettingsChoice
              label="Фон"
              hint={
                colorSource !== 'server'
                  ? 'Доступно при цвете «Сервер»'
                  : hasServerBackground
                    ? 'Обои библиотеки с сервера'
                    : 'На сервере нет фонового изображения'
              }
              disabled={!(hasServerBackground && colorSource === 'server')}
              options={([false, true] as const).map((on) => ({
                id: on ? 'on' : 'off',
                label: on ? 'Вкл' : 'Выкл',
                selected: useServerBackground === on,
                onSelect: () => {
                  if (hasServerBackground && colorSource === 'server' && useServerBackground !== on) {
                    onChangeUseServerBackground(on);
                  }
                },
              }))}
            />
            <SettingsChoice
              label="E-Ink"
              hint={
                einkMode === 'auto'
                  ? (einkDetected ? 'Обнаружено e-ink устройство' : 'Обычный экран')
                  : einkMode === 'on'
                    ? 'Высокий контраст, без анимаций'
                    : 'Режим e-ink выключен'
              }
              options={([
                { id: 'auto' as const, label: 'Авто' },
                { id: 'on' as const, label: 'Вкл' },
                { id: 'off' as const, label: 'Выкл' },
              ]).map((item) => ({
                id: item.id,
                label: item.label,
                selected: einkMode === item.id,
                onSelect: () => onChangeEinkMode(item.id),
              }))}
            />
            {(
              [
                {
                  key: 'home',
                  label: 'Главная',
                  hint: 'Недавно, новинки и рекомендации на главной',
                  value: homeViewMode,
                  onChange: setHomeViewMode,
                },
                {
                  key: 'books',
                  label: 'Остальное',
                  hint: 'Каталог, мои книги, новинки и рекомендации «Показать всё»',
                  value: booksViewMode,
                  onChange: setBooksViewMode,
                },
              ] as const
            ).map((group) => (
              <div key={group.key} className="flex items-center justify-between gap-3 min-h-14 py-3 border-b border-[color:var(--app-border)] last:border-b-0">
                <div className="min-w-0">
                  <p className={`${textStyles.body} ${theme.text}`}>{group.label}</p>
                  <p className={`${textStyles.caption} ${themeTextMuted}`}>{group.hint}</p>
                </div>
                <ViewModeToggle value={group.value} onChange={group.onChange} />
              </div>
            ))}
          </div>
        </section>

        <section className={sectionClass}>
          <h3 className={sectionTitle}>Хранилище</h3>
          <div className="space-y-2 py-1">
            {libraryFolders.folders.map((folder) => {
              const isDefault = folder.id === libraryFolders.defaultId;
              return (
                <div key={folder.id} className="flex items-center gap-2 min-h-12">
                  <button
                    type="button"
                    className={`min-w-0 flex-1 text-left ${theme.focusRing}`}
                    onClick={() => {
                      const next = setDefaultLibraryFolder(libraryFolders, folder.id);
                      setLibraryFolders(next);
                      onChangeStorageDirectory({ label: folder.label, uri: folder.uri });
                    }}
                  >
                    <p className={`${textStyles.body} ${theme.text}`}>{folder.label}</p>
                    <p className={`${textStyles.caption} ${themeTextMuted}`}>
                      {isDefault
                        ? (libraryFolders.hideDefaultInLocal ? 'Папка по умолчанию · скрыта в разделе «Папки»' : 'Папка по умолчанию')
                        : 'Нажмите, чтобы сделать основной'}
                    </p>
                  </button>
                  {isDefault && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const next = setHideDefaultInLocal(libraryFolders, !libraryFolders.hideDefaultInLocal);
                        setLibraryFolders(next);
                        window.dispatchEvent(new Event('inpx-settings'));
                      }}
                    >
                      {libraryFolders.hideDefaultInLocal ? 'Показать' : 'Скрыть'}
                    </Button>
                  )}
                  {libraryFolders.folders.length > 1 && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const next = removeLibraryFolder(libraryFolders, folder.id);
                        setLibraryFolders(next);
                        const def = defaultLibraryFolder(next);
                        onChangeStorageDirectory({ label: def.label, uri: def.uri });
                      }}
                    >
                      Убрать
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <Button className="w-full whitespace-nowrap" onClick={handlePickFolder} loading={pickingFolder} disabled={pickingFolder}>
            Добавить папку
          </Button>
        </section>

        <section className={sectionClass}>
          <h3 className={sectionTitle}>Главная и файлы</h3>
          <SettingsChoice
            label="Новинки"
            hint="Блок на главной"
            options={([
              ['on', 'Все'],
              ['fav', 'Мои авторы'],
              ['off', 'Скрыть'],
            ] as const).map(([id, label]) => ({
              id,
              label,
              selected: homeRecent === id,
              onSelect: () => {
                setAppSettingRaw(APP_SETTING_KEYS.homeRecent, id satisfies HomeRecentMode);
                setHomeRecent(id);
                window.dispatchEvent(new Event('inpx-settings'));
              },
            }))}
          />
          <SettingsChoice
            label="Имена папок"
            hint="Как называть автора и серию на диске"
            options={([
              ['original', 'Как в каталоге'],
              ['translit', 'Латиницей'],
            ] as const).map(([id, label]) => ({
              id,
              label,
              selected: nameStyle === id,
              onSelect: () => {
                setAppSettingRaw(APP_SETTING_KEYS.storageNames, id satisfies StorageNameStyle);
                setNameStyle(id);
              },
            }))}
          />
          <div className="flex gap-2 pt-2">
            <Button className="min-w-0 flex-1" variant="secondary" onClick={() => void saveSettingsBackup(storageDirectory, snackbar.show)}>
              Сохранить настройки
            </Button>
            <Button className="min-w-0 flex-1" variant="secondary" onClick={() => void loadSettingsBackup(storageDirectory, snackbar.show)}>
              Восстановить
            </Button>
          </div>
        </section>

        <AppUpdateSection serverConfig={serverConfig} />
      </div>
    </div>
  );
}

const SETTINGS_BACKUP_PATH = '.inpx-reader/settings-backup.json';

async function saveSettingsBackup(dir: StorageDirectory | null, show: (message: string) => void) {
  if (!dir?.uri) {
    show('Сначала выберите папку книг');
    return;
  }
  await BookStorage.writeTextFile({
    treeUri: dir.uri,
    path: SETTINGS_BACKUP_PATH,
    content: await exportAppSettingsJson(),
  });
  show('Настройки записаны в папку книг');
}

async function loadSettingsBackup(dir: StorageDirectory | null, show: (message: string) => void) {
  if (!dir?.uri) {
    show('Сначала выберите папку книг');
    return;
  }
  const { content } = await BookStorage.readTextFile({ treeUri: dir.uri, path: SETTINGS_BACKUP_PATH });
  const n = await importAppSettingsJson(content);
  window.dispatchEvent(new Event('inpx-settings'));
  show(n > 0 ? 'Настройки восстановлены' : 'В файле нет настроек');
}

function SettingsChoice({
  label,
  hint,
  options,
  disabled = false,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  options: Array<{
    id: string;
    label: string;
    selected: boolean;
    onSelect: () => void;
    icon?: React.ReactNode;
  }>;
}) {
  const calm = useCalmMotion();
  return (
    <div className="py-3 space-y-2 border-b border-[color:var(--app-border)]">
      <div>
        <p className={`${textStyles.body} ${theme.text}`}>{label}</p>
        {hint ? <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>{hint}</p> : null}
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className={`flex p-1 ${radii.button} bg-[var(--app-panel-soft)] ${disabled ? 'opacity-40' : ''}`}
      >
        {options.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={item.selected}
            disabled={disabled}
            onClick={() => {
              if (!item.selected) item.onSelect();
            }}
            className={`relative min-h-12 flex-1 inline-flex items-center justify-center gap-1.5 px-2 ${radii.button} ${textStyles.body} ${theme.focusRing} ${motion.press} disabled:pointer-events-none ${
              item.selected ? theme.text : theme.textMuted
            } ${calm && item.selected ? 'bg-[var(--app-surface)]' : ''}`}
          >
            {item.selected && !calm ? (
              <Motion.span
                layoutId={`settings-segment-${label}`}
                className={`absolute inset-0 ${radii.button} border border-[color:var(--app-border)] bg-[var(--app-surface)]`}
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
              {item.icon}
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
