import React from 'react';
import { ChevronRight, Eye, EyeOff, Folder, Grid3x3, Home, Info, Snowflake, Trash2, User } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { theme } from '../lib/appTheme';
import { elevation, textStyles, motion, radii } from '../ui/tokens';
import EmptyState from '../ui/EmptyState';
import ViewModeToggle from '../ui/ViewModeToggle';
import DragSheet from '../ui/DragSheet';
import { SheetDragHandle, sheetPanelClass, sheetPanelStyle } from '../ui/SheetChrome';
import type { CatalogViewMode } from '../lib/catalogViewMode';
import { APP_SETTINGS_HYDRATED_EVENT, getAppSettingString, setAppSettingRaw } from '../lib/appSettings';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { useLongPress } from '../hooks/useLongPress';
import { usePageTitle } from '../ui/pageTitle';
import { useBarHeight } from '../ui/useBarHeight';
import { useSnackbar } from '../ui/Snackbar';
import LocalBookFilter from './mybooks/LocalBookFilter';
import {
  LauncherHome,
  arrangeLauncherApps,
  launcherAppKey,
  noteAppOpened,
  openFreezeSettings,
  setHiddenApp,
  useLauncherAppPrefs,
  type LauncherApp,
  type LauncherShortcut,
} from '../lib/launcherHome';
import { t } from '../i18n';

/** Список приложений один на сессию: иконки рендерит Android, повторный запрос ни к чему. */
let appsCache: LauncherApp[] | null = null;
let appsPromise: Promise<LauncherApp[]> | null = null;

function loadApps(force = false): Promise<LauncherApp[]> {
  if (force) {
    appsCache = null;
    appsPromise = null;
  }
  if (appsCache) return Promise.resolve(appsCache);
  if (!appsPromise) {
    appsPromise = LauncherHome.listApps({ iconSize: 144 })
      .then((res) => {
        const items = (res?.items ?? []).filter((a) => a && a.packageName && a.label);
        items.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        appsCache = items;
        return items;
      })
      .catch(() => [])
      .finally(() => {
        appsPromise = null;
      });
  }
  return appsPromise;
}

function useLauncherApps(refreshKey = 0) {
  const [apps, setApps] = React.useState<LauncherApp[] | null>(appsCache);
  React.useEffect(() => {
    let cancelled = false;
    const reload = (force: boolean) => {
      void loadApps(force).then((list) => {
        if (!cancelled) setApps(list);
      });
    };
    reload(refreshKey > 0);
    // BOOX suspends / unfreezes apps while the reader is in the background: read the list again on
    // return, so the snowflakes are current.
    const resumed = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) reload(true);
    });
    // Installed, removed, updated, suspended: Android says so (one install sends several events).
    let timer: ReturnType<typeof setTimeout> | null = null;
    let changed: Promise<{ remove: () => Promise<void> }> | null = null;
    try {
      changed = LauncherHome.addListener('appsChanged', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => reload(true), 400);
      });
    } catch {
      /* an older native build: the list still refreshes on return to the app */
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void resumed.then((h) => h.remove()).catch(() => {});
      void changed?.then((h) => h.remove()).catch(() => {});
    };
  }, [refreshKey]);
  return apps;
}

/** Suspended by BOOX: a snowflake on the icon, like BOOX's own launcher; a tap still opens the app. */
function AppIcon({ app, size = 'w-12 h-12' }: { app: LauncherApp; size?: string }) {
  return (
    <span className={`relative ${size} shrink-0`}>
      {app.icon ? (
        <img src={app.icon} alt="" className={`${size} object-contain pointer-events-none`} draggable={false} />
      ) : (
        <span className={`block ${size} ${radii.button} bg-[var(--app-panel-soft)]`} aria-hidden />
      )}
      {app.frozen ? (
        <span
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border border-[color:var(--app-border)] bg-[var(--app-surface)] inline-flex items-center justify-center"
          title={t('launcherHome.suspended')}
        >
          <Snowflake className={`w-3.5 h-3.5 ${theme.text}`} aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

const APPS_VIEW_KEY = 'launcher_apps_view';

function readAppsView(): CatalogViewMode {
  return getAppSettingString(APPS_VIEW_KEY, 'grid') === 'list' ? 'list' : 'grid';
}

/** Icons or rows in «Приложения»: a device setting (app_meta), icons by default like a regular launcher. */
function useAppsView(): [CatalogViewMode, (mode: CatalogViewMode) => void] {
  const [view, setView] = React.useState<CatalogViewMode>(readAppsView);
  React.useEffect(() => {
    const onHydrated = () => setView(readAppsView());
    window.addEventListener(APP_SETTINGS_HYDRATED_EVENT, onHydrated);
    return () => window.removeEventListener(APP_SETTINGS_HYDRATED_EVENT, onHydrated);
  }, []);
  const update = React.useCallback((mode: CatalogViewMode) => {
    setView(mode);
    setAppSettingRaw(APPS_VIEW_KEY, mode);
  }, []);
  return [view, update];
}

const GRID = 'grid grid-cols-4 min-[480px]:grid-cols-5 min-[600px]:grid-cols-6 gap-x-2 gap-y-4';
/** `select-none` + no touch callout: a long press opens the app menu, not the WebView's text / image menu. */
const NO_CALLOUT = 'select-none [-webkit-touch-callout:none]';
const CELL = `min-w-0 flex flex-col items-center gap-1.5 px-1 py-2 ${NO_CALLOUT} ${radii.button} ${theme.rowPress} ${theme.focusRing} ${motion.press}`;
const CELL_LABEL = `w-full text-center ${textStyles.caption} ${theme.text} line-clamp-2 break-words`;
const ROW = `w-full min-w-0 min-h-14 flex items-center gap-3 py-2 text-left ${NO_CALLOUT} ${theme.rowPress} ${theme.focusRing} ${motion.press}`;

/** One app: tap opens it, long press opens its menu. */
function AppEntry({
  app,
  view,
  onOpen,
  onMenu,
}: {
  app: LauncherApp;
  view: CatalogViewMode;
  onOpen: (app: LauncherApp) => void;
  onMenu: (app: LauncherApp) => void;
}) {
  const press = useLongPress(() => onOpen(app), () => onMenu(app));
  if (view === 'grid') {
    return (
      <button type="button" {...press} className={CELL}>
        <AppIcon app={app} size="w-14 h-14" />
        <span className={CELL_LABEL}>{app.label}</span>
      </button>
    );
  }
  return (
    <button type="button" {...press} className={ROW}>
      <AppIcon app={app} size="w-10 h-10" />
      <span className={`min-w-0 flex-1 truncate ${textStyles.body} ${theme.text}`}>{app.label}</span>
    </button>
  );
}

/** «Профиль и настройки» / «Другой главный экран» / the «Скрытые» folder as an icon among the apps. */
function ServiceCell({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={CELL}>
      <span className={`w-14 h-14 shrink-0 inline-flex items-center justify-center ${radii.button} border border-[color:var(--app-border)] ${theme.text}`}>
        {icon}
      </span>
      <span className={CELL_LABEL}>{title}</span>
    </button>
  );
}

function PanelRow({ icon, title, hint, onClick }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-h-14 flex items-center gap-3 py-2 text-left border-b border-[color:var(--app-border)] ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
    >
      <span className={`w-12 h-12 shrink-0 inline-flex items-center justify-center ${radii.button} border border-[color:var(--app-border)] ${theme.text}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block ${textStyles.body} ${theme.text}`}>{title}</span>
        <span className={`block ${textStyles.caption} ${theme.textMuted}`}>{hint}</span>
      </span>
    </button>
  );
}

function MenuRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-h-14 flex items-center gap-3 text-left border-b ${theme.divider} ${theme.rowPress} ${theme.focusRing}`}
    >
      <span className={`w-6 shrink-0 inline-flex justify-center ${theme.textMuted}`}>{icon}</span>
      <span className={`flex-1 min-w-0 truncate ${textStyles.body} ${theme.text}`}>{label}</span>
    </button>
  );
}

/**
 * Long-press menu of an app, as in a regular launcher: its shortcuts (Android gives them to the
 * default home screen only), «О приложении», hide / show, BOOX suspension settings, «Удалить».
 */
function AppMenuSheet({
  app,
  open,
  hidden,
  onClose,
}: {
  app: LauncherApp | null;
  open: boolean;
  hidden: boolean;
  onClose: () => void;
}) {
  const snackbar = useSnackbar();
  const titleId = React.useId();
  const [shortcuts, setShortcuts] = React.useState<LauncherShortcut[]>([]);
  useOverlayBackHandler(open, onClose);

  const pkg = app?.packageName ?? '';
  const ownProfile = app?.user == null;
  React.useEffect(() => {
    setShortcuts([]);
    if (!open || !pkg || !ownProfile || app?.frozen) return;
    let cancelled = false;
    void LauncherHome.getShortcuts({ packageName: pkg })
      .then((res) => {
        if (!cancelled) setShortcuts((res?.items ?? []).filter((s) => s && s.id && s.label));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per opened app
  }, [open, pkg, ownProfile]);

  const fail = () => snackbar.show(t('launcherHome.couldNotOpenScreen'), undefined, 'error');
  const run = (action: () => Promise<{ ok: boolean } | boolean>) => {
    onClose();
    void action()
      .then((res) => {
        if (!(typeof res === 'boolean' ? res : res?.ok)) fail();
      })
      .catch(fail);
  };

  return (
    <DragSheet
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      swallowOpeningPointer
      className={`${sheetPanelClass} px-5 pt-2 ${elevation.sheet}`}
    >
      <div style={sheetPanelStyle()}>
        <SheetDragHandle />
        {app ? (
          <>
            <div className="flex items-center gap-3 pt-2 pb-3">
              <AppIcon app={app} size="w-10 h-10" />
              <h2 id={titleId} className={`min-w-0 truncate ${textStyles.sectionLabel} ${theme.text}`}>{app.label}</h2>
            </div>
            <div className={`border-t ${theme.divider}`}>
              {shortcuts.map((shortcut) => (
                <MenuRow
                  key={shortcut.id}
                  icon={<ChevronRight className="w-5 h-5" aria-hidden />}
                  label={shortcut.label}
                  onClick={() => run(() => LauncherHome.startShortcut({ packageName: app.packageName, id: shortcut.id }))}
                />
              ))}
              <MenuRow
                icon={<Info className="w-5 h-5" aria-hidden />}
                label={t('launcherHome.appInfo')}
                onClick={() =>
                  run(() => LauncherHome.openAppInfo({ packageName: app.packageName, activityName: app.activityName, user: app.user }))
                }
              />
              <MenuRow
                icon={hidden ? <Eye className="w-5 h-5" aria-hidden /> : <EyeOff className="w-5 h-5" aria-hidden />}
                label={hidden ? t('launcherHome.showApp') : t('launcherHome.hideApp')}
                onClick={() => {
                  onClose();
                  setHiddenApp(launcherAppKey(app), !hidden);
                  if (!hidden) snackbar.show(t('launcherHome.appHidden', { label: app.label }));
                }}
              />
              {app.frozen ? (
                <MenuRow
                  icon={<Snowflake className="w-5 h-5" aria-hidden />}
                  label={t('launcherHome.freezeSettings')}
                  onClick={() => run(() => openFreezeSettings())}
                />
              ) : null}
              {!app.system && ownProfile ? (
                <MenuRow
                  icon={<Trash2 className="w-5 h-5" aria-hidden />}
                  label={t('launcherHome.uninstall')}
                  onClick={() => run(() => LauncherHome.uninstallApp({ packageName: app.packageName }))}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </DragSheet>
  );
}

/**
 * Все приложения значками (как в обычном лаунчере) или списком: поиск по названию, недавние сверху,
 * долгое нажатие — меню приложения; в конце — профиль, другой лаунчер и папка «Скрытые».
 */
export function LauncherAppsPanel({
  isTabActive,
  onClose,
  onOpenProfile,
}: {
  isTabActive: boolean;
  onClose: () => void;
  /** «Профиль и настройки»: in launcher mode the Profile tab is replaced by «Приложения». */
  onOpenProfile: () => void;
}) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const apps = useLauncherApps(refreshKey);
  const prefs = useLauncherAppPrefs();
  const snackbar = useSnackbar();
  const [view, setView] = useAppsView();
  const [query, setQuery] = React.useState('');
  /** The «Скрытые» folder is open: the screen lists the hidden apps only. */
  const [folderOpen, setFolderOpen] = React.useState(false);
  const [menuApp, setMenuApp] = React.useState<LauncherApp | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [setToolEl, toolH] = useBarHeight();
  const closeFolder = React.useCallback(() => {
    setFolderOpen(false);
    setQuery('');
  }, []);
  useOverlayBackHandler(isTabActive, onClose);
  usePageTitle(t('launcherHome.allApps'), onClose, isTabActive);
  // The folder is one more level: Back and the header arrow leave it first.
  useOverlayBackHandler(isTabActive && folderOpen, closeFolder);
  usePageTitle(t('launcherHome.hiddenFolder'), closeFolder, isTabActive && folderOpen);
  React.useEffect(() => {
    if (!isTabActive) onClose();
  }, [isTabActive, onClose]);

  const arranged = React.useMemo(
    () => arrangeLauncherApps(apps ?? [], { hidden: prefs.hidden, recent: prefs.recent, query }),
    [apps, prefs.hidden, prefs.recent, query],
  );
  const hiddenSet = React.useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const searching = Boolean(query.trim());
  // The last hidden app was returned to the list: the folder is gone, back to the apps.
  const hiddenTotal = prefs.hidden.length && apps ? apps.filter((app) => hiddenSet.has(launcherAppKey(app))).length : 0;
  React.useEffect(() => {
    if (folderOpen && apps && hiddenTotal === 0) closeFolder();
  }, [folderOpen, apps, hiddenTotal, closeFolder]);

  const openOther = () => {
    void LauncherHome.openOtherLauncher()
      .then((res) => {
        if (!res?.ok) snackbar.show(t('launcherHome.noOtherLauncher'), undefined, 'error');
      })
      .catch(() => snackbar.show(t('launcherHome.noOtherLauncher'), undefined, 'error'));
  };

  const onOpen = React.useCallback((app: LauncherApp) => {
    const fail = () => snackbar.show(t('launcherHome.couldNotOpenApp'), undefined, 'error');
    void LauncherHome.launchApp({ packageName: app.packageName, activityName: app.activityName, user: app.user })
      .then((res) => {
        if (res?.ok) noteAppOpened(launcherAppKey(app));
        else fail();
      })
      .catch(fail);
  }, [snackbar]);
  const onMenu = React.useCallback((app: LauncherApp) => {
    setMenuApp(app);
    setMenuOpen(true);
  }, []);

  const profileIcon = <User className="w-6 h-6" aria-hidden />;
  const otherIcon = <Home className="w-6 h-6" aria-hidden />;
  const folderIcon = <Folder className="w-6 h-6" aria-hidden />;
  const folderTitle = t('launcherHome.hiddenFolder');
  const openFolder = () => {
    setQuery('');
    setFolderOpen(true);
  };
  const shown = folderOpen ? arranged.hidden : arranged.all;

  const entries = (list: LauncherApp[], prefix: string) =>
    list.map((app) => (
      <AppEntry
        key={`${prefix}${launcherAppKey(app)}`}
        app={app}
        view={view}
        onOpen={onOpen}
        onMenu={onMenu}
      />
    ));
  const sectionLabel = (text: string) => (
    <h3 className={`mb-1 ${textStyles.caption} ${theme.textMuted}`}>{text}</h3>
  );
  const showRecent = !searching && !folderOpen && arranged.recent.length > 0;
  const showService = !searching && !folderOpen;

  return (
    <div className="relative flex-1 min-h-0 h-full" style={{ ['--inpx-tool' as string]: `${toolH}px` }}>
    {/* Search and the view toggle are a bar pinned under the header (like «Скачанные»), not a row that scrolls under it. */}
    <div
      ref={setToolEl}
      className="inpx-chrome inpx-chrome-top absolute inset-x-0 z-10 px-5 py-1 min-[600px]:px-8 flex items-center gap-2"
      style={{ top: 'calc(var(--app-header-offset, 4rem) + var(--inpx-under, 0px))' }}
    >
      <div className="min-w-0 flex-1">
        <LocalBookFilter value={query} onChange={setQuery} placeholder={t('launcherHome.findApp')} />
      </div>
      <ViewModeToggle value={view} onChange={setView} />
    </div>
    <div className="absolute inset-0 overflow-y-auto inpx-page-scroll px-5 py-4 min-[600px]:px-8">
      <div className="mx-auto w-full max-w-[60rem]">
        {apps == null ? (
          <div className={GRID} aria-busy>
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className="flex flex-col items-center gap-2 py-2">
                <span className={`block w-14 h-14 ${radii.button} bg-[var(--app-panel-soft)]`} />
                <span className={`block w-12 h-3 ${radii.button} bg-[var(--app-panel-soft)]`} />
              </span>
            ))}
          </div>
        ) : apps.length === 0 ? (
          <EmptyState
            compact
            icon={Grid3x3}
            title={t('launcherHome.noApps')}
            actionLabel={t('common.retry')}
            actionVariant="secondary"
            onAction={() => setRefreshKey((k) => k + 1)}
          />
        ) : searching && shown.length === 0 ? (
          <p className={`py-8 text-center ${textStyles.body} ${theme.textMuted}`}>{t('common.nothingFound')}</p>
        ) : null}
        {showRecent ? (
          <section className="mb-5">
            {sectionLabel(t('launcherHome.recent'))}
            {view === 'grid' ? (
              // One row: the fifth recent app shows only where the grid has five columns.
              <div className={`${GRID} max-[479px]:[&>*:nth-child(n+5)]:hidden`}>{entries(arranged.recent, 'recent:')}</div>
            ) : (
              <div className="divide-y divide-[color:var(--app-border)]">{entries(arranged.recent, 'recent:')}</div>
            )}
          </section>
        ) : null}
        {showRecent ? sectionLabel(t('launcherHome.allApps')) : null}
        {view === 'grid' ? (
          <div className={GRID}>
            {entries(shown, '')}
            {/* Service entries go last: the apps are what this screen is opened for. */}
            {showService ? (
              <>
                <ServiceCell icon={profileIcon} title={t('launcherHome.profileAndSettings')} onClick={onOpenProfile} />
                <ServiceCell icon={otherIcon} title={t('launcherHome.otherLauncher')} onClick={openOther} />
                {hiddenTotal > 0 ? <ServiceCell icon={folderIcon} title={folderTitle} onClick={openFolder} /> : null}
              </>
            ) : null}
          </div>
        ) : (
          <>
            <div className="divide-y divide-[color:var(--app-border)]">{entries(shown, '')}</div>
            {!showService ? null : (
              <div className="mt-4 border-t border-[color:var(--app-border)]">
                <PanelRow
                  icon={profileIcon}
                  title={t('launcherHome.profileAndSettings')}
                  hint={t('launcherHome.profileAndSettingsHint')}
                  onClick={onOpenProfile}
                />
                <PanelRow
                  icon={otherIcon}
                  title={t('launcherHome.otherLauncher')}
                  hint={t('launcherHome.otherLauncherHint')}
                  onClick={openOther}
                />
                {hiddenTotal > 0 ? (
                  <PanelRow icon={folderIcon} title={folderTitle} hint={t('launcherHome.hiddenFolderHint', { n: hiddenTotal })} onClick={openFolder} />
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
    <AppMenuSheet
      app={menuApp}
      open={menuOpen}
      hidden={menuApp ? hiddenSet.has(launcherAppKey(menuApp)) : false}
      onClose={() => setMenuOpen(false)}
    />
    </div>
  );
}
