import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles, motion, radii } from '../ui/tokens';
import { useSnackbar } from '../ui/Snackbar';
import { impactLight } from '../lib/haptics';
import { isNativeApp } from '../lib/platform';
import {
  LauncherHome,
  getLauncherBlocks,
  setLauncherBlocks,
  setLauncherEnabled,
  useLauncherSettings,
  useLauncherState,
  type LauncherBlocks,
} from '../lib/launcherHome';
import { t } from '../i18n';

/** Same markup as «Блоки главной»: `inpx-switch` is what the E-Ink styles target. */
function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        impactLight();
        onChange(!checked);
      }}
      className={`inpx-switch relative ml-1 h-7 w-12 shrink-0 rounded-full ${theme.focusRing} ${
        checked ? theme.accentBg : theme.panel
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
          checked ? 'translate-x-[1.125rem]' : 'translate-x-0'
        }`}
        aria-hidden
      />
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-14 py-3 border-b border-[color:var(--app-border)]">
      <div className="min-w-0">
        <p className={`${textStyles.body} ${theme.text}`}>{label}</p>
        {hint ? <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

const linkButton = `min-h-12 px-4 ${radii.button} ${textStyles.bodyBold} inline-flex items-center border border-[color:var(--app-border)] ${theme.text} ${theme.focusRing} ${motion.press}`;

/** Профиль → Внешний вид → «Домашний экран» (лаунчер для читалок; только приложение). */
export default function LauncherSettings() {
  const state = useLauncherState();
  const { blocks } = useLauncherSettings();
  const snackbar = useSnackbar();
  if (!isNativeApp() || !state.supported) return null;

  const openHomeSettings = () => {
    void LauncherHome.openHomeSettings()
      .then((res) => {
        if (!res?.ok) snackbar.show(t('launcherSettings.couldNotOpenSettings'), undefined, 'error');
      })
      .catch(() => snackbar.show(t('launcherSettings.couldNotOpenSettings'), undefined, 'error'));
  };

  const setBlock = (key: keyof LauncherBlocks, value: boolean) => {
    setLauncherBlocks({ ...getLauncherBlocks(), [key]: value });
  };

  const hint = !state.enabled
    ? t('launcherSettings.offHint')
    : state.isDefault
      ? t('launcherSettings.defaultHint')
      : t('launcherSettings.notDefaultHint');

  return (
    <div>
      <Row label={t('launcherSettings.title')} hint={hint}>
        <Switch
          checked={state.enabled}
          label={t('launcherSettings.title')}
          onChange={(next) => {
            const wasDefault = state.isDefault;
            void setLauncherEnabled(next).then((s) => {
              // Turned on: the system screen picks the default home app.
              if (next && s.enabled && !s.isDefault) openHomeSettings();
              // Turned off while it was the home screen: hand the screen back to the other launcher.
              if (!next && wasDefault) void LauncherHome.openOtherLauncher().catch(() => {});
            });
          }}
        />
      </Row>
      {state.enabled ? (
        <>
          <div className="flex flex-wrap gap-2 py-3 border-b border-[color:var(--app-border)]">
            <button type="button" className={linkButton} onClick={openHomeSettings}>
              {t('launcherSettings.chooseHome')}
            </button>
            <button
              type="button"
              className={linkButton}
              onClick={() => {
                void LauncherHome.openOtherLauncher()
                  .then((res) => {
                    if (!res?.ok) snackbar.show(t('launcherHome.noOtherLauncher'), undefined, 'error');
                  })
                  .catch(() => snackbar.show(t('launcherHome.noOtherLauncher'), undefined, 'error'));
              }}
            >
              {t('launcherHome.otherLauncher')}
            </button>
          </div>
          <Row label={t('launcherHome.apps')} hint={t('launcherSettings.appsHint')}>
            <Switch checked={blocks.apps} label={t('launcherHome.apps')} onChange={(v) => setBlock('apps', v)} />
          </Row>
        </>
      ) : null}
    </div>
  );
}
