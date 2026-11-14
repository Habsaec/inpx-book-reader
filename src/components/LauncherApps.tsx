import React from 'react';
import { Grid3x3, Home, Pin, PinOff, Snowflake, User } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { theme } from '../lib/appTheme';
import { textStyles, motion, radii } from '../ui/tokens';
import IconButton from '../ui/IconButton';
import EmptyState from '../ui/EmptyState';
import { BookListSkeleton } from '../ui/Skeleton';
import { useOverlayBackHandler } from '../hooks/useBackHandler';
import { usePageTitle } from '../ui/pageTitle';
import { useSnackbar } from '../ui/Snackbar';
import {
  LAUNCHER_PINNED_APPS_MAX,
  LauncherHome,
  launcherAppKey,
  setPinnedApps,
  togglePinnedApp,
  type LauncherApp,
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
    appsPromise = LauncherHome.listApps({ iconSize: 96 })
      .then((res) => {
        const items = (res?.items ?? []).filter((a) => a && a.packageName && a.label);
        items.sort((a, b) => a.label.localeCompare(b.label));
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
    void loadApps(refreshKey > 0).then((list) => {
      if (!cancelled) setApps(list);
    });
    // BOOX suspends / unfreezes apps while the reader is in the background (and an app may have been
    // installed or removed): read the list again on return, so the snowflakes and entries are current.
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void loadApps(true).then((list) => {
        if (!cancelled) setApps(list);
      });
    });
    return () => {
      cancelled = true;
      void sub.then((h) => h.remove()).catch(() => {});
    };
  }, [refreshKey]);
  return apps;
}

function launch(app: LauncherApp, onFail: () => void) {
  void LauncherHome.launchApp({ packageName: app.packageName, activityName: app.activityName })
    .then((res) => {
      if (!res?.ok) onFail();
    })
    .catch(onFail);
}

/** Suspended by BOOX: a snowflake on the icon, like BOOX's own launcher; a tap still opens the app. */
function AppIcon({ app, size = 'w-12 h-12' }: { app: LauncherApp; size?: string }) {
  return (
    <span className={`relative ${size} shrink-0`}>
      {app.icon ? (
        <img src={app.icon} alt="" className={`${size} object-contain`} draggable={false} />
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

/** Ряд закреплённых приложений (блок главной в режиме лаунчера); весь список — вкладка «Приложения». */
export function LauncherAppsRow({ pinnedApps }: { pinnedApps: string[] }) {
  const apps = useLauncherApps();
  const snackbar = useSnackbar();
  const pinned = React.useMemo(() => {
    if (!apps) return [];
    const byKey = new Map(apps.map((a) => [launcherAppKey(a), a]));
    return pinnedApps.map((key) => byKey.get(key)).filter((a): a is LauncherApp => Boolean(a));
  }, [apps, pinnedApps]);

  return (
    <section className="space-y-3" aria-label={t('launcherHome.apps')}>
      <div className="flex min-h-12 items-center justify-between gap-3 -mb-1">
        <h3 className={`min-w-0 truncate ${textStyles.sectionLabel} ${theme.text}`}>{t('launcherHome.apps')}</h3>
      </div>
      {apps && pinned.length === 0 ? (
        <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('launcherHome.noPinnedApps')}</p>
      ) : null}
      <div className="grid grid-cols-4 min-[600px]:grid-cols-6 gap-x-2 gap-y-3">
        {pinned.map((app) => (
          <button
            key={launcherAppKey(app)}
            type="button"
            onClick={() => launch(app, () => snackbar.show(t('launcherHome.couldNotOpenApp'), undefined, 'error'))}
            className={`flex flex-col items-center gap-1.5 py-2 ${radii.button} ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
          >
            <AppIcon app={app} />
            <span className={`w-full text-center ${textStyles.caption} ${theme.text} line-clamp-2`}>{app.label}</span>
          </button>
        ))}
      </div>
    </section>
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

/** Все приложения: запуск, закрепление на главной, выход в другой лаунчер. */
export function LauncherAppsPanel({
  pinnedApps,
  isTabActive,
  onClose,
  onOpenProfile,
}: {
  pinnedApps: string[];
  isTabActive: boolean;
  onClose: () => void;
  /** «Профиль и настройки»: in launcher mode the Profile tab is replaced by «Приложения». */
  onOpenProfile: () => void;
}) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const apps = useLauncherApps(refreshKey);
  const snackbar = useSnackbar();
  useOverlayBackHandler(isTabActive, onClose);
  usePageTitle(t('launcherHome.allApps'), onClose, isTabActive);
  React.useEffect(() => {
    if (!isTabActive) onClose();
  }, [isTabActive, onClose]);

  const openOther = () => {
    void LauncherHome.openOtherLauncher()
      .then((res) => {
        if (!res?.ok) snackbar.show(t('launcherHome.noOtherLauncher'), undefined, 'error');
      })
      .catch(() => snackbar.show(t('launcherHome.noOtherLauncher'), undefined, 'error'));
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto inpx-page-scroll px-5 py-4 min-[600px]:px-8">
      <div className="mx-auto w-full max-w-[60rem]">
        <p className={`mb-1 ${textStyles.caption} ${theme.textMuted}`}>
          {t('launcherHome.pinHint', { max: LAUNCHER_PINNED_APPS_MAX })}
        </p>
        {apps == null ? (
          <BookListSkeleton count={8} />
        ) : apps.length === 0 ? (
          <EmptyState
            compact
            icon={Grid3x3}
            title={t('launcherHome.noApps')}
            actionLabel={t('common.retry')}
            actionVariant="secondary"
            onAction={() => setRefreshKey((k) => k + 1)}
          />
        ) : (
          <ul>
            {apps.map((app) => {
              const key = launcherAppKey(app);
              const isPinned = pinnedApps.includes(key);
              return (
                <li key={key} className="flex items-center gap-2 border-b border-[color:var(--app-border)] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => launch(app, () => snackbar.show(t('launcherHome.couldNotOpenApp'), undefined, 'error'))}
                    className={`flex-1 min-w-0 min-h-14 flex items-center gap-3 py-2 text-left ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
                  >
                    <AppIcon app={app} size="w-10 h-10" />
                    <span className={`min-w-0 truncate ${textStyles.body} ${theme.text}`}>{app.label}</span>
                  </button>
                  <IconButton
                    label={isPinned ? t('launcherHome.unpin', { label: app.label }) : t('launcherHome.pin', { label: app.label })}
                    className={isPinned ? theme.accentText : theme.textMuted}
                    onClick={() => {
                      const next = togglePinnedApp(pinnedApps, key);
                      if (next === pinnedApps) {
                        snackbar.show(t('launcherHome.pinLimit', { max: LAUNCHER_PINNED_APPS_MAX }));
                        return;
                      }
                      setPinnedApps(next);
                    }}
                  >
                    {isPinned ? <PinOff className="w-5 h-5" aria-hidden /> : <Pin className="w-5 h-5" aria-hidden />}
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
        {/* Service rows go last: the apps are what this list is opened for. */}
        <div className="mt-4 border-t border-[color:var(--app-border)]">
          <PanelRow
            icon={<User className="w-6 h-6" aria-hidden />}
            title={t('launcherHome.profileAndSettings')}
            hint={t('launcherHome.profileAndSettingsHint')}
            onClick={onOpenProfile}
          />
          <PanelRow
            icon={<Home className="w-6 h-6" aria-hidden />}
            title={t('launcherHome.otherLauncher')}
            hint={t('launcherHome.otherLauncherHint')}
            onClick={openOther}
          />
        </div>
      </div>
    </div>
  );
}
