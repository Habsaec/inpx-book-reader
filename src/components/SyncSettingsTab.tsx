import React from 'react';
import { theme } from '../lib/appTheme';
import {
  Settings,
  Sun,
  Moon,
  Tv,
  ShieldCheck,
  LogOut,
  AlertTriangle,
  QrCode,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useCatalogViewMode } from '../hooks/useCatalogViewMode';
import { ServerConfig } from '../types';
import {
  StorageDirectory,
  pickStorageDirectory,
  getDefaultStorageDirectory,
  ensureStorageDirectory,
  DEFAULT_STORAGE_LABEL,
  isDefaultStorageDirectory,
  isValidStorageDirectory,
} from '../lib/storageDirectory';
import { isAndroid } from '../lib/platform';
import { insecureHttpWarning } from '../lib/serverUrl';
import { clearServerCredentials } from '../lib/secureServerConfig';
import { parsePairingQrPayload, redeemPairingCode } from '../lib/inpxClient';
import { scanAppPairingQr, isQrScanCanceled } from '../lib/scanAppPairingQr';
import type { AppAppearance, AppColorSource } from '../lib/serverTheme';
import type { EinkModePref } from '../lib/einkMode';
import DiagnosticsTab from './DiagnosticsTab';
import { textStyles, semantic, radii, elevation, motion } from '../ui/tokens';
import Button from '../ui/Button';
import { useSnackbar } from '../ui/Snackbar';

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
  lastSynced: string | null;
  embedded?: boolean;
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
  lastSynced,
  embedded = false,
}: SyncSettingsTabProps) {
  const [pickingFolder, setPickingFolder] = React.useState(false);
  const [forgetting, setForgetting] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const authActionGen = React.useRef(0);
  const { viewMode: homeViewMode, setViewMode: setHomeViewMode } = useCatalogViewMode('home');
  const { viewMode: booksViewMode, setViewMode: setBooksViewMode } = useCatalogViewMode('books');
  const snackbar = useSnackbar();
  const themeInput = theme.input;
  const themeAccentText = theme.accentText;
  const themeTextMuted = theme.textMuted;

  const httpWarning = insecureHttpWarning(serverConfig.url);

  const handlePickFolder = async () => {
    setPickingFolder(true);
    try {
      const picked = await pickStorageDirectory();
      if (picked) {
        onChangeStorageDirectory(picked);
      }
    } catch (error) {
      snackbar.show(error instanceof Error ? error.message : 'Не удалось выбрать папку', undefined, 'error');
    } finally {
      setPickingFolder(false);
    }
  };

  const handleResetFolder = async () => {
    setPickingFolder(true);
    try {
      const defaultDir = await getDefaultStorageDirectory();
      if (defaultDir) onChangeStorageDirectory(defaultDir);
    } finally {
      setPickingFolder(false);
    }
  };

  const handleForgetServer = async () => {
    if (scanning) return;
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

  const appearanceOptions: Array<{ id: AppAppearance; label: string; icon: typeof Sun }> = [
    { id: 'light', label: 'День', icon: Sun },
    { id: 'dark', label: 'Ночь', icon: Moon },
    { id: 'auto', label: 'Авто', icon: Tv },
  ];
  const colorOptions: Array<{ id: AppColorSource; label: string }> = [
    { id: 'server', label: 'Сервер' },
    { id: 'system', label: 'Система' },
  ];

  const sectionClass = `${radii.lg} ${theme.card} ${elevation.card} p-5 space-y-4`;
  const inputClass = `w-full px-4 py-3.5 ${textStyles.body} ${radii.lg} ${theme.inputFocus} ${themeInput}`;

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
      {!embedded && (
        <div className={`px-5 py-4 shrink-0 border-b ${theme.header}`}>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center justify-center w-11 h-11 ${radii.lg} ${theme.accentMuted}`}>
              <Settings className={`w-5 h-5 ${themeAccentText}`} />
            </span>
            <div>
              <h2 className={textStyles.title}>Настройки</h2>
              <p className={`${textStyles.caption} ${theme.textMuted}`}>Сервер, тема и хранение</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <section className={sectionClass}>
          <div className="flex justify-between items-center select-none">
            <h3 className={textStyles.sectionLabel}>Сервер</h3>
            <span className={`${textStyles.captionBold} px-2.5 py-1 ${radii.full} ${
              serverConfig.connectionStatus === 'testing' ? `${semantic.warningBg} ${semantic.warning} animate-pulse` :
              serverConfig.connectionStatus === 'connected' ? semantic.successBg :
              `${theme.panel} ${theme.textMuted}`
            }`}>
              {serverConfig.connectionStatus === 'testing'
                ? 'Проверка…'
                : serverConfig.connectionStatus === 'connected'
                  ? 'Подключён'
                  : 'Отключён'}
            </span>
          </div>

          {httpWarning && (
            <div className={`flex gap-2 ${radii.lg} px-4 py-3 border border-[color-mix(in_srgb,var(--app-warning)_25%,transparent)] ${semantic.warningBg}`} role="alert">
              <AlertTriangle className={`w-4 h-4 shrink-0 ${semantic.warning}`} aria-hidden />
              <p className={`${textStyles.caption} ${semantic.warning} leading-relaxed`}>{httpWarning}</p>
            </div>
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
                className={inputClass}
              />
            </div>

            {connectionError && (
              <p role="alert" className={`${textStyles.caption} px-4 py-3 ${radii.lg} ${semantic.errorBg}`}>{connectionError}</p>
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
                  className={inputClass}
                />
              </div>
            </div>

            {isAndroid() && (
              <div className={`flex items-center gap-2 ${radii.lg} px-4 py-3 ${theme.panel}`}>
                <ShieldCheck className={`w-4 h-4 shrink-0 ${themeAccentText}`} aria-hidden />
                <p className={`${textStyles.caption} leading-relaxed ${themeTextMuted}`}>
                  Пароль защищён Android Keystore
                </p>
              </div>
            )}

            {isAndroid() && (
              <Button fullWidth variant="secondary" onClick={() => void handleScanQr()} loading={scanning} disabled={scanning || forgetting}>
                <QrCode className="w-4 h-4 inline mr-1" aria-hidden />
                Сканировать QR
              </Button>
            )}

            <Button fullWidth onClick={onTestConnection} disabled={serverConfig.connectionStatus === 'testing' || !serverConfig.url} loading={serverConfig.connectionStatus === 'testing'}>
              {serverConfig.connectionStatus === 'testing' ? 'Подключение…' : 'Подключить'}
            </Button>

            <Button variant="secondary" fullWidth onClick={() => void handleForgetServer()} loading={forgetting} disabled={forgetting || scanning}>
              <LogOut className="w-4 h-4 inline mr-1" aria-hidden />
              Забыть сервер
            </Button>
          </div>
        </section>

        <section className={sectionClass}>
          <h3 className={textStyles.sectionLabel}>Тема</h3>
          <div className="flex flex-wrap gap-2">
            {appearanceOptions.map((item) => {
              const Icon = item.icon;
              const isSel = appearance === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeAppearance(item.id)}
                  aria-pressed={isSel}
                  className={`min-h-11 px-4 ${radii.button} inline-flex items-center gap-1.5 ${textStyles.caption} ${theme.focusRing} ${motion.press} ${
                    isSel ? `${theme.accentActive} font-semibold` : `${theme.chip} ${theme.chipHover} font-medium`
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            <p className={`${textStyles.bodyBold} ${theme.text}`}>Цвет</p>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((item) => {
                const isSel = colorSource === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeColorSource(item.id)}
                    aria-pressed={isSel}
                    className={`min-h-11 px-4 ${radii.button} inline-flex items-center ${textStyles.caption} ${theme.focusRing} ${motion.press} ${
                      isSel ? `${theme.accentActive} font-semibold` : `${theme.chip} ${theme.chipHover} font-medium`
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className={`flex items-center gap-3 min-h-12 ${hasServerBackground ? theme.interactive : 'opacity-60'}`}>
            <input
              id="server-background"
              type="checkbox"
              checked={useServerBackground}
              disabled={!hasServerBackground}
              onChange={(e) => onChangeUseServerBackground(e.target.checked)}
              className="w-5 h-5 shrink-0"
            />
            <span className={textStyles.body}>Фон</span>
          </label>
          <p className={`${textStyles.caption} ${themeTextMuted}`}>
            {hasServerBackground
              ? 'Обои библиотеки с сервера'
              : 'На сервере нет фонового изображения'}
          </p>
        </section>

        <section className={sectionClass}>
          <h3 className={textStyles.sectionLabel}>Вид книг</h3>
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
            <div key={group.key} className="space-y-3">
              <p className={`${textStyles.bodyBold} ${theme.text}`}>{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'list' as const, label: 'Список', Icon: List },
                  { id: 'grid' as const, label: 'Карточки', Icon: LayoutGrid },
                ]).map((item) => {
                  const isSel = group.value === item.id;
                  const Icon = item.Icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => group.onChange(item.id)}
                      aria-pressed={isSel}
                      className={`min-h-11 px-4 ${radii.button} inline-flex items-center gap-1.5 ${textStyles.caption} ${theme.focusRing} ${motion.press} ${
                        isSel ? `${theme.accentActive} font-semibold` : `${theme.chip} ${theme.chipHover} font-medium`
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden />
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <p className={`${textStyles.caption} ${themeTextMuted}`}>{group.hint}</p>
            </div>
          ))}
        </section>

        <section className={sectionClass}>
          <h3 className={textStyles.sectionLabel}>E-Ink</h3>
          <div className="flex flex-wrap gap-2">
            {([
              { id: 'auto' as const, label: 'Авто' },
              { id: 'on' as const, label: 'Вкл' },
              { id: 'off' as const, label: 'Выкл' },
            ]).map((item) => {
              const isSel = einkMode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeEinkMode(item.id)}
                  aria-pressed={isSel}
                  className={`min-h-11 px-5 ${radii.button} ${textStyles.caption} ${theme.focusRing} ${motion.press} ${
                    isSel ? `${theme.accentActive} font-semibold` : `${theme.chip} ${theme.chipHover} font-medium`
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <p className={`${textStyles.caption} ${themeTextMuted}`}>
            {einkMode === 'auto'
              ? (einkDetected ? 'Обнаружено e-ink устройство' : 'Обычный экран')
              : einkMode === 'on'
                ? 'Высокий контраст, без анимаций'
                : 'Режим e-ink выключен'}
          </p>
        </section>

        <section className={sectionClass}>
          <h3 className={textStyles.sectionLabel}>Папка книг</h3>
          <p className={`${textStyles.body} break-all ${theme.textMuted}`}>{storageDirectory?.label || DEFAULT_STORAGE_LABEL}</p>
          <div className="flex gap-2 items-center">
            <Button className="min-w-0 flex-1 whitespace-nowrap" onClick={handlePickFolder} loading={pickingFolder} disabled={pickingFolder}>
              Выбрать папку
            </Button>
            {storageDirectory && !isDefaultStorageDirectory(storageDirectory) && (
              <Button className="min-w-0 flex-1 whitespace-nowrap" variant="secondary" onClick={handleResetFolder} disabled={pickingFolder}>
                По умолчанию
              </Button>
            )}
          </div>
        </section>

        <DiagnosticsTab
          serverUrl={serverConfig.url}
          connectionStatus={serverConfig.connectionStatus}
          storageLabel={storageDirectory?.label ?? null}
          lastSynced={lastSynced}
        />
      </div>
    </div>
  );
}
