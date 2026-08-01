import React from 'react';
import { theme } from '../lib/appTheme';
import {
  Settings,
  Sun,
  Moon,
  Tv,
  ShieldCheck,
  Palette,
  LogOut,
  AlertTriangle,
  QrCode,
} from 'lucide-react';
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
import { scanAppPairingQr } from '../lib/scanAppPairingQr';
import type { AppThemeMode } from '../lib/serverTheme';
import type { EinkModePref } from '../lib/einkMode';
import DiagnosticsTab from './DiagnosticsTab';
import { textStyles, semantic } from '../ui/tokens';
import Button from '../ui/Button';
import { useSnackbar } from '../ui/Snackbar';

interface SyncSettingsTabProps {
  storageDirectory: StorageDirectory | null;
  onChangeStorageDirectory: (dir: StorageDirectory | null) => void;
  appTheme: AppThemeMode;
  onChangeTheme: (theme: AppThemeMode) => void;
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
  appTheme,
  onChangeTheme,
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
        snackbar.show(`Папка выбрана: ${picked.label}`, undefined, 'success');
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
    setForgetting(true);
    try {
      await clearServerCredentials(serverConfig);
      onChangeServerConfig({
        url: 'http://127.0.0.1:3000',
        username: '',
        password: '',
        deviceToken: '',
        deviceTokenId: '',
        connectionStatus: 'disconnected',
      });
      onForgetServer?.();
    } finally {
      setForgetting(false);
    }
  };

  const handleScanQr = async () => {
    setScanning(true);
    try {
      const raw = await scanAppPairingQr();
      const payload = parsePairingQrPayload(raw);
      const redeemed = await redeemPairingCode(payload.url, payload.code);
      onPairingLogin({
        url: redeemed.serverUrl || payload.url,
        username: redeemed.username,
        deviceToken: redeemed.deviceToken,
        deviceTokenId: redeemed.deviceTokenId,
      });
      snackbar.show('Вход по QR выполнен', undefined, 'success');
    } catch (error) {
      snackbar.show(error instanceof Error ? error.message : 'Не удалось войти по QR', undefined, 'error');
    } finally {
      setScanning(false);
    }
  };

  React.useEffect(() => {
    if (!isAndroid() || isValidStorageDirectory(storageDirectory)) return;
    let cancelled = false;
    void ensureStorageDirectory(storageDirectory).then((resolved) => {
      if (!cancelled && resolved) onChangeStorageDirectory(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [storageDirectory, onChangeStorageDirectory]);

  const themeOptions: Array<{ id: AppThemeMode; label: string; icon: typeof Sun }> = [
    { id: 'server', label: 'Как на сервере', icon: Palette },
    { id: 'system', label: 'Система', icon: Tv },
    { id: 'light', label: 'День', icon: Sun },
    { id: 'dark', label: 'Ночь', icon: Moon },
    { id: 'sepia', label: 'Сепия', icon: Sun },
    { id: 'auto', label: 'Авто', icon: Tv },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
      {!embedded && (
        <div className={`px-4 py-4 shrink-0 border-b ${theme.header}`}>
          <div className="flex items-center gap-2">
            <Settings className={`w-5 h-5 ${themeAccentText}`} />
            <div>
              <h2 className={textStyles.title}>Настройки</h2>
              <p className={`${textStyles.caption} ${theme.textMuted}`}>Сервер, тема и хранение</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-8">
        <section className="space-y-3.5">
          <div className="flex justify-between items-center select-none">
            <h3 className={textStyles.sectionLabel}>Сервер</h3>
            <span className={`${textStyles.caption} ${
              serverConfig.connectionStatus === 'testing' ? `${semantic.warning} animate-pulse` :
              serverConfig.connectionStatus === 'connected' ? semantic.success :
              theme.textMuted
            }`}>
              {serverConfig.connectionStatus === 'testing' && 'Проверка…'}
              {serverConfig.connectionStatus === 'connected' ? 'Подключён' : 'Отключён'}
            </span>
          </div>

          {httpWarning && (
            <div className={`flex gap-2 rounded-lg px-3 py-2.5 border border-[color-mix(in_srgb,var(--app-warning)_25%,transparent)] ${semantic.warningBg}`} role="alert">
              <AlertTriangle className={`w-4 h-4 shrink-0 ${semantic.warning}`} aria-hidden />
              <p className={`${textStyles.caption} ${semantic.warning} leading-relaxed`}>{httpWarning}</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1">
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
                className={`w-full px-3 py-2.5 ${textStyles.body} rounded-lg border ${theme.inputFocus} ${themeInput}`}
              />
            </div>

            {connectionError && (
              <p role="alert" className={`${textStyles.caption} px-3 py-2 rounded-xl ${semantic.errorBg}`}>{connectionError}</p>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label htmlFor="server-username" className={`${textStyles.caption} ${theme.textMuted}`}>Логин</label>
                <input
                  id="server-username"
                  type="text"
                  value={serverConfig.username || ''}
                  onChange={(e) => onChangeServerConfig({ username: e.target.value })}
                  autoComplete="username"
                  className={`w-full px-3 py-2.5 ${textStyles.body} rounded-lg border ${theme.inputFocus} ${themeInput}`}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="server-password" className={`${textStyles.caption} ${theme.textMuted}`}>Пароль</label>
                <input
                  id="server-password"
                  type="password"
                  value={serverConfig.password || ''}
                  onChange={(e) => onChangeServerConfig({ password: e.target.value })}
                  autoComplete="current-password"
                  className={`w-full px-3 py-2.5 ${textStyles.body} rounded-lg border ${theme.inputFocus} ${themeInput}`}
                />
              </div>
            </div>

            {isAndroid() && (
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 bg-[var(--app-panel-soft)]">
                <ShieldCheck className={`w-4 h-4 shrink-0 ${themeAccentText}`} aria-hidden />
                <p className={`${textStyles.caption} leading-relaxed ${themeTextMuted}`}>
                  Пароль защищён Android Keystore
                </p>
              </div>
            )}

            {isAndroid() && (
              <Button fullWidth variant="secondary" onClick={() => void handleScanQr()} loading={scanning} disabled={scanning}>
                <QrCode className="w-4 h-4 inline mr-1" aria-hidden />
                Сканировать QR
              </Button>
            )}

            <Button fullWidth onClick={onTestConnection} disabled={serverConfig.connectionStatus === 'testing' || !serverConfig.url} loading={serverConfig.connectionStatus === 'testing'}>
              {serverConfig.connectionStatus === 'testing' ? 'Подключение…' : 'Подключить'}
            </Button>

            {lastSynced && (
              <p className={`${textStyles.caption} ${theme.textMuted} text-center`}>Последняя синхронизация: {lastSynced}</p>
            )}

            <Button variant="secondary" fullWidth onClick={handleForgetServer} loading={forgetting} disabled={forgetting}>
              <LogOut className="w-4 h-4 inline mr-1" aria-hidden />
              Забыть сервер
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className={textStyles.sectionLabel}>Тема</h3>
          <div className="flex flex-wrap gap-2">
            {themeOptions.map((item) => {
              const Icon = item.icon;
              const isSel = appTheme === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeTheme(item.id)}
                  aria-pressed={isSel}
                  className={`min-h-12 px-3 rounded-full inline-flex items-center gap-1.5 ${textStyles.caption} ${theme.focusRing} ${
                    isSel ? `${theme.accentActive} font-semibold` : `${theme.textMuted} font-medium`
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
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
                  className={`min-h-12 px-4 rounded-full ${textStyles.caption} ${theme.focusRing} ${
                    isSel ? `${theme.accentActive} font-semibold` : `${theme.textMuted} font-medium`
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

        <section className="space-y-3">
          <h3 className={textStyles.sectionLabel}>Папка книг</h3>
          <p className={`${textStyles.body} break-all ${theme.textMuted}`}>{storageDirectory?.label || DEFAULT_STORAGE_LABEL}</p>
          <div className="flex gap-2">
            <Button fullWidth onClick={handlePickFolder} loading={pickingFolder} disabled={pickingFolder}>
              Выбрать папку
            </Button>
            {storageDirectory && !isDefaultStorageDirectory(storageDirectory) && (
              <Button variant="secondary" onClick={handleResetFolder} disabled={pickingFolder}>
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
