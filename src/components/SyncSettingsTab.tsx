import React from 'react';
import { theme } from '../lib/appTheme';
import {
  Sun,
  Moon,
  Tv,
  ShieldCheck,
  LogOut,
  QrCode,
  ChevronRight,
  Server,
  Palette,
  FolderOpen,
  Info,
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
import { insecureHttpWarning, serverHostLabel } from '../lib/serverUrl';
import { clearServerCredentials } from '../lib/secureServerConfig';
import { parsePairingQrPayload, redeemPairingCode, saveUserPreferences } from '../lib/inpxClient';
import {
  isAppReadableDownloadFormat,
  isDownloadFormatOffOnServer,
  setDownloadFormat,
  setServerDownloadFormats,
  useDownloadFormat,
  useServerDownloadFormats,
} from '../lib/downloadFormatPreference';
import { setHomeLayout, useHomeLayout } from '../lib/homeLayout';
import { forgetAccountForConfig } from '../lib/accounts';
import HomeLayoutSettings from './HomeLayoutSettings';
import { scanAppPairingQr, isQrScanCanceled } from '../lib/scanAppPairingQr';
import type { AppAppearance, AppColorSource } from '../lib/serverTheme';
import type { EinkModePref } from '../lib/einkMode';
import AppUpdateSection from './AppUpdateSection';
import ServerNetworkSettings, { canTestServerConnection } from './ServerNetworkSettings';
import { textStyles, semantic, radii, motion } from '../ui/tokens';
import { usePageTitle } from '../ui/pageTitle';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
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
import { t, getLocale, getUiLanguagePref, localeForPref, setUiLanguagePref, type UiLanguagePref } from '../i18n';

interface SyncSettingsTabProps {
  storageDirectory: StorageDirectory | null;
  onChangeStorageDirectory: (dir: StorageDirectory | null) => void;
  appearance: AppAppearance;
  onChangeAppearance: (mode: AppAppearance) => void;
  colorSource: AppColorSource;
  onChangeColorSource: (source: AppColorSource) => void;
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
  /** Bumped to open «О приложении» («Обновить» in the snackbar). */
  updateFocusEpoch?: number;
  /** Profile tab visible — the open section's title and Back belong to it only then. */
  active?: boolean;
  /** Bumped on a Profile tab re-tap: back to the section list. */
  rootEpoch?: number;
}

export type SettingsSection = 'connection' | 'appearance' | 'storage' | 'about';

const SECTION_TITLES: Record<SettingsSection, string> = {
  connection: t('syncSettingsTab.connection'),
  appearance: t('syncSettingsTab.appearance'),
  storage: t('syncSettingsTab.storage'),
  about: t('common.aboutTheApp'),
};

export default function SyncSettingsTab({
  storageDirectory,
  onChangeStorageDirectory,
  appearance,
  onChangeAppearance,
  colorSource,
  onChangeColorSource,
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
  updateFocusEpoch = 0,
  active = true,
  rootEpoch = 0,
}: SyncSettingsTabProps) {
  usePageTitle(t('syncSettingsTab.settings'), undefined, !embedded);
  // Embedded in Profile: a short list of sections, each opens as its own page.
  // Standalone (no Profile header) keeps everything on one page.
  const [section, setSection] = React.useState<SettingsSection | null>(null);
  const [uiLanguage, setUiLanguage] = React.useState<UiLanguagePref>(getUiLanguagePref);
  const shows = (id: SettingsSection) => !embedded || section === id;
  const closeSection = React.useCallback(() => setSection(null), []);
  const sectionOpen = embedded && active && section != null;
  usePageTitle(section ? SECTION_TITLES[section] : '', closeSection, sectionOpen);
  useOverlayBackHandler(sectionOpen, closeSection);
  const rootEpochSeen = React.useRef(rootEpoch);
  React.useEffect(() => {
    if (rootEpochSeen.current === rootEpoch) return;
    rootEpochSeen.current = rootEpoch;
    setSection(null);
  }, [rootEpoch]);
  /** Connected users see who they are, not a login form; «Сменить» brings the form back. */
  const [editingAccount, setEditingAccount] = React.useState(false);
  const connected = serverConfig.connectionStatus === 'connected';
  React.useEffect(() => {
    if (connected) setEditingAccount(false);
  }, [connected]);
  const showAccountSummary = connected && !editingAccount;
  const [pickingFolder, setPickingFolder] = React.useState(false);
  const [forgetting, setForgetting] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const authActionGen = React.useRef(0);
  const { viewMode: homeViewMode, setViewMode: setHomeViewMode } = useCatalogViewMode('home');
  const { viewMode: booksViewMode, setViewMode: setBooksViewMode } = useCatalogViewMode('books');
  const snackbar = useSnackbar();
  const downloadFormat = useDownloadFormat();
  const serverDownloadFormats = useServerDownloadFormats();
  const homeLayout = useHomeLayout();
  const [homeRecent, setHomeRecent] = React.useState(getHomeRecentMode);
  const [libraryFolders, setLibraryFolders] = React.useState(() => readLibraryFolders(storageDirectory));
  const [nameStyle, setNameStyle] = React.useState(getStorageNameStyle);
  React.useEffect(() => {
    const refresh = () => {
      setLibraryFolders(readLibraryFolders(storageDirectory));
      setHomeRecent(getHomeRecentMode());
      setNameStyle(getStorageNameStyle());
    };
    window.addEventListener('inpx-settings', refresh);
    return () => window.removeEventListener('inpx-settings', refresh);
  }, [storageDirectory]);
  const dialog = useDialog();
  const settingsScrollRef = React.useRef<HTMLDivElement>(null);
  const connectionFocusSeen = React.useRef(connectionFocusEpoch);
  const updateFocusSeen = React.useRef(updateFocusEpoch);
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
        snackbar.show(next.folders.length === libraryFolders.folders.length ? t('syncSettingsTab.thisFolderIsAlreadyIn') : t('syncSettingsTab.folderAdded'));
      }
    } catch (error) {
      snackbar.show(error instanceof Error ? error.message : t('syncSettingsTab.couldNotChooseTheFolder'), undefined, 'error');
    } finally {
      setPickingFolder(false);
    }
  };

  const handleForgetServer = async () => {
    if (scanning) return;
    const accepted = await dialog.confirm({
      title: t('syncSettingsTab.signOut'),
      message: t('syncSettingsTab.theServerAddressAndSign'),
      confirmLabel: t('syncSettingsTab.signOutButton'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!accepted) return;
    setForgetting(true);
    const gen = ++authActionGen.current;
    const snapshot = serverConfig;
    // «Выйти» revokes the device token, so the account leaves the quick-switch list too.
    await forgetAccountForConfig(snapshot).catch(() => undefined);
    // Wipe React state first so the 250ms persist effect cannot re-save credentials
    // after clearServerCredentials finishes.
    onChangeServerConfig({
      url: '',
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
      snackbar.show(error instanceof Error ? error.message : t('common.couldNotSignInWith'), undefined, 'error');
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

  const scrollSectionIntoView = React.useCallback((id: string) => {
    const root = settingsScrollRef.current;
    const section = root?.querySelector(`#${id}`);
    if (!root || !(section instanceof HTMLElement)) {
      root?.scrollTo({ top: 0 });
      return;
    }
    const top = section.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    root.scrollTo({ top: Math.max(0, top) });
  }, []);
  const scrollServerIntoView = React.useCallback(
    () => scrollSectionIntoView('settings-server'),
    [scrollSectionIntoView],
  );

  React.useLayoutEffect(() => {
    if (updateFocusEpoch === updateFocusSeen.current) return;
    updateFocusSeen.current = updateFocusEpoch;
    if (embedded) {
      setSection('about');
      settingsScrollRef.current?.scrollTo({ top: 0 });
      return;
    }
    scrollSectionIntoView('settings-update');
  }, [updateFocusEpoch, scrollSectionIntoView, embedded]);

  React.useLayoutEffect(() => {
    if (connectionFocusEpoch === connectionFocusSeen.current) return;
    connectionFocusSeen.current = connectionFocusEpoch;
    if (embedded) {
      setSection('connection');
      settingsScrollRef.current?.scrollTo({ top: 0 });
      return;
    }
    scrollServerIntoView();
  }, [connectionFocusEpoch, scrollServerIntoView, embedded]);

  React.useLayoutEffect(() => {
    settingsScrollRef.current?.scrollTo({ top: 0 });
  }, [section]);

  const connecting = serverConfig.connectionStatus === 'testing';
  // Only an explicit «Подключить» moves the page. Background reconnect attempts run every
  // few seconds while the server is down and must not yank the scroll or steal focus.
  const handleConnect = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    scrollServerIntoView();
    onTestConnection();
  };

  const appearanceOptions: Array<{ id: AppAppearance; label: string; icon: typeof Sun }> = [
    { id: 'light', label: t('syncSettingsTab.day'), icon: Sun },
    { id: 'dark', label: t('syncSettingsTab.night'), icon: Moon },
    { id: 'auto', label: t('syncSettingsTab.auto'), icon: Tv },
  ];
  const colorOptions: Array<{ id: AppColorSource; label: string }> = [
    { id: 'app', label: t('syncSettingsTab.app') },
    { id: 'library', label: t('common.server') },
    { id: 'system', label: t('syncSettingsTab.system') },
  ];

  const sectionClass = `space-y-3`;
  const sectionTitle = `${textStyles.sectionLabel} ${theme.text}`;
  const inputClass = `w-full px-4 py-3.5 ${textStyles.body} ${radii.md} ${theme.inputFocus} ${themeInput}`;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div
        ref={settingsScrollRef}
        data-large-title={embedded ? '' : undefined}
        className="flex-1 overflow-y-auto inpx-page-scroll px-[max(1.25rem,calc((100%_-_45rem)/2))] py-4 space-y-8"
      >
        {embedded && section == null ? (
          <>
            {scrollHeader}
            <nav aria-label={t('syncSettingsTab.settings')} className={`border-t ${theme.divider}`}>
              {([
                {
                  id: 'connection' as const,
                  icon: Server,
                  hint: connecting
                    ? t('common.checking')
                    : connected
                      ? t('syncSettingsTab.connected', { url: serverHostLabel(serverConfig.url) })
                      : t('syncSettingsTab.disconnected'),
                },
                {
                  id: 'appearance' as const,
                  icon: Palette,
                  hint: appearanceOptions.find((item) => item.id === appearance)?.label ?? '',
                },
                {
                  id: 'storage' as const,
                  icon: FolderOpen,
                  hint: defaultLibraryFolder(libraryFolders)?.label || t('syncSettingsTab.noFolderChosen'),
                },
                { id: 'about' as const, icon: Info, hint: t('syncSettingsTab.versionAndUpdates') },
              ]).map(({ id, icon: Icon, hint }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={`w-full min-h-16 flex items-center gap-3.5 px-0.5 text-left border-b ${theme.divider} ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${themeTextMuted}`} aria-hidden />
                  <span className="flex-1 min-w-0">
                    <span className={`block ${textStyles.bodyBold} ${theme.text}`}>{SECTION_TITLES[id]}</span>
                    {hint ? (
                      <span className={`block truncate ${textStyles.caption} ${
                        id === 'connection' && connected ? semantic.success : themeTextMuted
                      }`}>{hint}</span>
                    ) : null}
                  </span>
                  <ChevronRight className={`w-5 h-5 shrink-0 ${themeTextMuted}`} aria-hidden />
                </button>
              ))}
            </nav>
          </>
        ) : null}

        {shows('connection') ? (<>
        <section id="settings-server" className={sectionClass}>
          <div className="flex justify-between items-baseline gap-3 select-none">
            <h3 className={sectionTitle}>{t('common.server')}</h3>
            <span className={`${textStyles.caption} ${
              connecting ? semantic.warning :
              serverConfig.connectionStatus === 'connected' ? semantic.success :
              theme.textMuted
            }`}>
              {connecting
                ? t('common.checking')
                : serverConfig.connectionStatus === 'connected'
                  ? t('syncSettingsTab.connectedShort')
                  : t('syncSettingsTab.disconnected')}
            </span>
          </div>

          {httpWarning && (
            <p className={`${textStyles.caption} ${semantic.warning} leading-relaxed`} role="alert">
              {httpWarning}
            </p>
          )}

          {showAccountSummary ? (
            <div className="space-y-4">
              <div className={`p-4 ${radii.lg} ${theme.card}`}>
                <p className={`${textStyles.caption} ${themeTextMuted}`}>{t('syncSettingsTab.signedInAs')}</p>
                <p className={`${textStyles.bodyBold} ${theme.text} truncate`}>{serverConfig.username || '—'}</p>
                <p className={`mt-2 ${textStyles.caption} ${themeTextMuted}`}>{t('common.server')}</p>
                <p className={`${textStyles.body} ${theme.text} break-all`}>{serverConfig.url}</p>
              </div>
              <Button fullWidth variant="secondary" onClick={() => setEditingAccount(true)}>
                {t('syncSettingsTab.changeTheServerOrAccount')}
              </Button>
              <Button variant="ghost" fullWidth className="!text-[var(--app-danger)]" onClick={() => void handleForgetServer()} loading={forgetting} disabled={forgetting}>
                <LogOut className="w-4 h-4 inline mr-1" aria-hidden />
                {t('syncSettingsTab.signOutButton')}
              </Button>
            </div>
          ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="server-url" className={`${textStyles.caption} ${theme.textMuted}`}>{t('common.serverAddress')}</label>
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
              <p role="alert" className={`${textStyles.caption} ${semantic.error}`}>{connectionError}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="server-username" className={`${textStyles.caption} ${theme.textMuted}`}>{t('common.login')}</label>
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
                <label htmlFor="server-password" className={`${textStyles.caption} ${theme.textMuted}`}>{t('common.password')}</label>
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
              <p className={`${textStyles.caption} ${themeTextMuted} inline-flex items-center gap-2`}>
                <ShieldCheck className={`w-4 h-4 shrink-0 ${themeAccentText}`} aria-hidden />
                {t('syncSettingsTab.thePasswordIsProtectedBy')}
              </p>
            )}

            {isAndroid() && (
              <Button fullWidth variant="secondary" onClick={() => void handleScanQr()} loading={scanning} disabled={scanning || forgetting || connecting}>
                <QrCode className="w-4 h-4 inline mr-1" aria-hidden />
                {t('common.scanQr')}
              </Button>
            )}

            <Button fullWidth onClick={handleConnect} disabled={connecting || !canTestServerConnection(serverConfig)} loading={connecting}>
              {connecting ? t('syncSettingsTab.connecting') : t('common.connect')}
            </Button>

            {connected && editingAccount ? (
              <Button variant="secondary" fullWidth onClick={() => setEditingAccount(false)}>
                {t('common.cancel')}
              </Button>
            ) : null}

            <Button variant="ghost" fullWidth className="!text-[var(--app-danger)]" onClick={() => void handleForgetServer()} loading={forgetting} disabled={forgetting || scanning || connecting}>
              <LogOut className="w-4 h-4 inline mr-1" aria-hidden />
              {t('syncSettingsTab.forgetTheServer')}
            </Button>
          </div>
          )}
        </section>

        <ServerNetworkSettings
          serverConfig={serverConfig}
          onChangeServerConfig={onChangeServerConfig}
        />
        </>) : null}

        {shows('appearance') ? (
        <section className={sectionClass}>
          {embedded ? null : <h3 className={sectionTitle}>{t('syncSettingsTab.appearance')}</h3>}
          <div>
            <SettingsChoice
              label={t('syncSettingsTab.theme')}
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
              label={t('syncSettingsTab.color')}
              options={colorOptions.map((item) => ({
                id: item.id,
                label: item.label,
                selected: colorSource === item.id,
                onSelect: () => onChangeColorSource(item.id),
              }))}
            />
            <SettingsChoice
              label={t('syncSettingsTab.language')}
              hint={uiLanguage === 'auto' ? t('syncSettingsTab.languageAutoHint') : undefined}
              options={([
                { id: 'auto' as const, label: t('syncSettingsTab.auto') },
                { id: 'ru' as const, label: 'Русский' },
                { id: 'en' as const, label: 'English' },
              ]).map((item) => ({
                id: item.id,
                label: item.label,
                selected: uiLanguage === item.id,
                onSelect: () => {
                  if (item.id === uiLanguage) return;
                  setUiLanguagePref(item.id);
                  // Strings are picked at start-up: reload the app in the new language.
                  if (localeForPref(item.id) !== getLocale()) window.location.reload();
                  else setUiLanguage(item.id);
                },
              }))}
            />
            <SettingsChoice
              label="E-Ink"
              hint={
                einkMode === 'auto'
                  ? (einkDetected ? t('syncSettingsTab.eInkDeviceDetected') : t('syncSettingsTab.regularScreen'))
                  : einkMode === 'on'
                    ? t('syncSettingsTab.highContrastNoAnimations')
                    : t('syncSettingsTab.eInkModeIsOff')
              }
              options={([
                { id: 'auto' as const, label: t('syncSettingsTab.auto') },
                { id: 'on' as const, label: t('syncSettingsTab.on') },
                { id: 'off' as const, label: t('syncSettingsTab.off') },
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
                  label: t('common.home'),
                  hint: t('syncSettingsTab.recentNewBooksAndRecommendations'),
                  value: homeViewMode,
                  onChange: setHomeViewMode,
                },
                {
                  key: 'books',
                  label: t('syncSettingsTab.everythingElse'),
                  hint: t('syncSettingsTab.catalogMyBooksNewBooks'),
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
            <HomeLayoutSettings
              layout={homeLayout}
              onChange={(next) => {
                const previous = homeLayout;
                setHomeLayout(next);
                if (!connected) return;
                void saveUserPreferences(serverConfig, { homeLayout: next })
                  .then((prefs) => {
                    if (prefs.homeLayout !== undefined) setHomeLayout(prefs.homeLayout);
                  })
                  .catch(() => {
                    setHomeLayout(previous);
                    snackbar.show(t('syncSettingsTab.couldNotSaveTheHome'), undefined, 'error');
                  });
              }}
            />
            <SettingsChoice
              label={t('common.newBooks')}
              hint={t('syncSettingsTab.allNewBooksOrOnly')}
              options={([
                ['on', t('common.all')],
                ['fav', t('syncSettingsTab.myAuthors')],
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
          </div>
        </section>
        ) : null}

        {shows('storage') ? (<>
        <section className={sectionClass}>
          <h3 className={sectionTitle}>{t('syncSettingsTab.bookFolders')}</h3>
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
                    <p className={`${textStyles.body} ${theme.text} break-all`}>{folder.label}</p>
                    <p className={`${textStyles.caption} ${themeTextMuted}`}>
                      {isDefault
                        ? (libraryFolders.hideDefaultInLocal ? t('syncSettingsTab.defaultFolderHiddenInFolders') : t('common.defaultFolder'))
                        : t('syncSettingsTab.tapToMakeItThe')}
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
                      {libraryFolders.hideDefaultInLocal ? t('syncSettingsTab.show') : t('common.hide')}
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
                      {t('common.remove')}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <Button className="w-full whitespace-nowrap" onClick={handlePickFolder} loading={pickingFolder} disabled={pickingFolder}>
            {t('syncSettingsTab.addAFolder')}
          </Button>
        </section>

        <section className={sectionClass}>
          <h3 className={sectionTitle}>{t('syncSettingsTab.filesAndSettings')}</h3>
          {connected ? (
            <SettingsChoice
              label={t('syncSettingsTab.downloadFormat')}
              hint={downloadFormatHint(downloadFormat, serverDownloadFormats)}
              options={APP_DOWNLOAD_FORMAT_OPTIONS.map(([id, label]) => ({
                id: id || 'source',
                label: isDownloadFormatOffOnServer(id, serverDownloadFormats)
                  ? t('syncSettingsTab.downloadFormatOffLabel', { format: label })
                  : label,
                selected: downloadFormat === id,
                onSelect: () => {
                  if (downloadFormat === id) return;
                  const previous = downloadFormat;
                  setDownloadFormat(id);
                  void saveUserPreferences(serverConfig, { downloadFormat: id })
                    .then((prefs) => {
                      setDownloadFormat(prefs.downloadFormat);
                      setServerDownloadFormats(prefs.availableDownloadFormats);
                    })
                    .catch(() => {
                      setDownloadFormat(previous);
                      snackbar.show(t('syncSettingsTab.couldNotSaveTheFormat'), undefined, 'error');
                    });
                },
              }))}
            />
          ) : null}
          <SettingsChoice
            label={t('syncSettingsTab.folderNames')}
            hint={t('syncSettingsTab.howToNameTheAuthor')}
            options={([
              ['original', t('syncSettingsTab.asInTheCatalog')],
              ['translit', t('syncSettingsTab.inLatinLetters')],
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
              {t('syncSettingsTab.saveSettings')}
            </Button>
            <Button
              className="min-w-0 flex-1"
              variant="secondary"
              onClick={() => {
                void (async () => {
                  const accepted = await dialog.confirm({
                    title: t('syncSettingsTab.restoreTheSettings'),
                    message: t('syncSettingsTab.theCurrentAppSettingsWill'),
                    confirmLabel: t('syncSettingsTab.restore'),
                    cancelLabel: t('common.cancel'),
                  });
                  if (accepted) await loadSettingsBackup(storageDirectory, snackbar.show);
                })();
              }}
            >
              {t('syncSettingsTab.restore')}
            </Button>
          </div>
        </section>

        </>) : null}

        {shows('about') ? (
        <div id="settings-update">
          <AppUpdateSection serverConfig={serverConfig} />
        </div>
        ) : null}
      </div>
    </div>
  );
}

const SETTINGS_BACKUP_PATH = '.inpx-reader/settings-backup.json';

type ShowSnackbar = ReturnType<typeof useSnackbar>['show'];

async function saveSettingsBackup(dir: StorageDirectory | null, show: ShowSnackbar) {
  if (!dir?.uri) {
    show(t('syncSettingsTab.chooseTheBookFolderFirst'), undefined, 'error');
    return;
  }
  try {
    await BookStorage.writeTextFile({
      treeUri: dir.uri,
      path: SETTINGS_BACKUP_PATH,
      content: await exportAppSettingsJson(),
    });
    show(t('syncSettingsTab.settingsWrittenToTheBook'), undefined, 'success');
  } catch (error) {
    console.warn('[SyncSettingsTab] settings backup failed:', error);
    show(t('syncSettingsTab.couldNotSaveTheSettings'), undefined, 'error');
  }
}

async function loadSettingsBackup(dir: StorageDirectory | null, show: ShowSnackbar) {
  if (!dir?.uri) {
    show(t('syncSettingsTab.chooseTheBookFolderFirst'), undefined, 'error');
    return;
  }
  let content: string;
  try {
    ({ content } = await BookStorage.readTextFile({ treeUri: dir.uri, path: SETTINGS_BACKUP_PATH }));
  } catch (error) {
    console.warn('[SyncSettingsTab] settings backup read failed:', error);
    show(t('syncSettingsTab.noSavedSettingsInThe'), undefined, 'error');
    return;
  }
  try {
    const n = await importAppSettingsJson(content);
    window.dispatchEvent(new Event('inpx-settings'));
    show(n > 0 ? t('syncSettingsTab.settingsRestored') : t('syncSettingsTab.noSettingsInTheFile'), undefined, n > 0 ? 'success' : 'default');
  } catch (error) {
    show(error instanceof SyntaxError || !(error instanceof Error) ? t('syncSettingsTab.theSettingsFileIsDamaged') : error.message, undefined, 'error');
  }
}

/** App-readable choices of the account «Формат скачивания» ('' = the original file). */
const APP_DOWNLOAD_FORMAT_OPTIONS = [
  ['', t('syncSettingsTab.original')],
  ['epub2', 'EPUB'],
  ['epub3', 'EPUB3'],
] as const;

function downloadFormatHint(format: string, available: string[] | null): string {
  if (!format) return t('syncSettingsTab.asInTheWebsiteProfile');
  // Switched off by the admin (or no converter on the server): books keep coming as FB2.
  if (isDownloadFormatOffOnServer(format, available)) {
    return t('syncSettingsTab.downloadFormatOffOnServer', { format: format.toUpperCase() });
  }
  if (isAppReadableDownloadFormat(format)) {
    return t('syncSettingsTab.theServerConvertsFb2To');
  }
  return t('syncSettingsTab.theWebsiteHasSelectedThe', { format: format.toUpperCase() });
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
        className={`inpx-segment flex p-1 ${radii.button} bg-[var(--app-panel-soft)] ${disabled ? 'opacity-40' : ''}`}
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
