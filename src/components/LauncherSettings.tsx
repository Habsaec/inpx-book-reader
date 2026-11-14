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

  // The HOME activity is always available (like any launcher): turning the mode on or off is the
  // system «Главный экран» choice — pick the reader, or pick BOOX back.
  return (
    <div>
      <div className="py-3 border-b border-[color:var(--app-border)]">
        <p className={`${textStyles.body} ${theme.text}`}>{t('launcherSettings.title')}</p>
        <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>
          {state.isDefault ? t('launcherSettings.defaultHint') : t('launcherSettings.offHint')}
        </p>
        {state.onyx ? (
          // BOOX freezes the app after a few idle minutes (whole package disabled) and Android then
          // drops the HOME role; Google Play / Chrome are not frozen by default, third-party apps are.
          <p
            role="note"
            className={`mt-2 px-3 py-2 ${radii.button} border border-[color:var(--app-border)] ${textStyles.caption} ${theme.text}`}
          >
            {t('launcherSettings.onyxFreezeHint')}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" className={linkButton} onClick={openHomeSettings}>
            {t('launcherSettings.chooseHome')}
          </button>
          {state.isDefault ? (
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
          ) : null}
        </div>
      </div>
      {state.isDefault ? (
        <Row label={t('launcherHome.apps')} hint={t('launcherSettings.appsHint')}>
          <Switch checked={blocks.apps} label={t('launcherHome.apps')} onChange={(v) => setBlock('apps', v)} />
        </Row>
      ) : null}
    </div>
  );
}
