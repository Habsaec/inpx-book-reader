import React from 'react';
import { theme } from '../lib/appTheme';
import {
  Settings,
  Sun,
  Moon,
  Tv,
  RefreshCw,
  Server,
  FolderOpen,
  ShieldCheck,
  Palette,
  LogOut,
  AlertTriangle,
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
import type { AppThemeMode } from '../lib/serverTheme';
import DiagnosticsTab from './DiagnosticsTab';
import { textStyles } from '../ui/tokens';
import Button from '../ui/Button';
import { useSnackbar } from '../ui/Snackbar';

interface SyncSettingsTabProps {
  storageDirectory: StorageDirectory | null;
  onChangeStorageDirectory: (dir: StorageDirectory | null) => void;
  appTheme: AppThemeMode;
  onChangeTheme: (theme: AppThemeMode) => void;
  isAppDark: boolean;
  serverConfig: ServerConfig;
  onChangeServerConfig: (config: Partial<ServerConfig>) => void;
  onTestConnection: () => void;
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
  serverConfig,
  onChangeServerConfig,
  onTestConnection,
  onForgetServer,
  connectionError,
  lastSynced,
  embedded = false,
}: SyncSettingsTabProps) {
  const [pickingFolder, setPickingFolder] = React.useState(false);
  const [forgetting, setForgetting] = React.useState(false);
  const snackbar = useSnackbar();
  const themeCard = theme.card;
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

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        <div className={`p-4 border rounded-2xl space-y-3.5 shadow-xs ${themeCard}`}>
          <div className="flex justify-between items-center select-none">
            <div className="flex items-center gap-2">
              <Server className={`w-4 h-4 ${themeAccentText}`} />
              <span className={`${textStyles.captionBold} uppercase tracking-wider ${theme.textMuted}`}>Сервер INPX</span>
            </div>
            <span className={`${textStyles.caption} font-bold px-2 py-0.5 rounded uppercase ${
              serverConfig.connectionStatus === 'testing' ? 'bg-amber-500/10 text-amber-500 animate-pulse' :
              serverConfig.connectionStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-500' :
              'bg-stone-500/10 text-stone-500'
            }`}>
              {serverConfig.connectionStatus === 'testing' && 'Тест...'}
              {serverConfig.connectionStatus === 'connected' ? 'Подключен' : 'Отключен'}
            </span>
          </div>

          {httpWarning && (
            <div className="flex gap-2 rounded-lg px-3 py-2.5 bg-amber-500/10 border border-amber-500/20" role="alert">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" aria-hidden />
              <p className={`${textStyles.caption} text-amber-800 dark:text-amber-200 leading-relaxed`}>{httpWarning}</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="server-url" className={`${textStyles.captionBold} ${theme.textMuted}`}>Адрес сервера</label>
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
              <p role="alert" className={`${textStyles.caption} text-[var(--app-danger)] font-medium`}>{connectionError}</p>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label htmlFor="server-username" className={`${textStyles.captionBold} ${theme.textMuted}`}>Логин</label>
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
                <label htmlFor="server-password" className={`${textStyles.captionBold} ${theme.textMuted}`}>Пароль</label>
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
        </div>

        <div className={`p-4 border rounded-2xl space-y-3 shadow-xs ${themeCard}`}>
          <span className={`${textStyles.captionBold} uppercase tracking-wider ${theme.textMuted}`}>Тема</span>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {themeOptions.map((item) => {
              const Icon = item.icon;
              const isSel = appTheme === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeTheme(item.id)}
                  aria-pressed={isSel}
                  className={`py-2.5 px-1 rounded-xl border flex flex-col items-center gap-1 ${textStyles.captionBold} ${theme.focusRing} ${
                    isSel ? `${theme.accentBg} border-transparent` : `${theme.input} ${theme.textMuted}`
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`p-4 border rounded-2xl space-y-3 shadow-xs ${themeCard}`}>
          <div className="flex items-center gap-2">
            <FolderOpen className={`w-4 h-4 ${themeAccentText}`} />
            <span className={`${textStyles.captionBold} uppercase tracking-wider ${theme.textMuted}`}>Папка книг</span>
          </div>
          <p className={`${textStyles.body} font-semibold break-all`}>{storageDirectory?.label || DEFAULT_STORAGE_LABEL}</p>
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
        </div>

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
