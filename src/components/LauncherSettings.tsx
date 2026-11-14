import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles, motion, radii } from '../ui/tokens';
import { useSnackbar } from '../ui/Snackbar';
import { impactLight } from '../lib/haptics';
import { isNativeApp } from '../lib/platform';
import {
  LauncherHome,
  forgetLauncherHome,
  getLauncherBlocks,
  openFreezeSettings,
  requestHomeRole,
  requestUnrestricted,
  setLauncherBlocks,
  useLauncherSettings,
  useLauncherState,
  type LauncherBlocks,
} from '../lib/launcherHome';
import { t } from '../i18n';

/** Same markup as «Блоки главной»: `inpx-switch` is what the E-Ink styles target. */
export function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (next: boolean) => void }) {
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

/**
 * What keeps the home screen alive: on BOOX its app-freeze list (opened directly when the firmware
 * allows), elsewhere Android's battery optimisation (the system «run without limits» dialog).
 * Shared by the settings and the «home screen got lost» prompt.
 */
export function LauncherKeepAliveRow() {
  const state = useLauncherState();
  const snackbar = useSnackbar();
  if (state.onyx) {
    // BOOX freezes the app after a few idle minutes (whole package disabled) and Android then drops
    // the HOME role; Google Play / Chrome are not frozen by default, third-party apps are.
    return (
      <Row
        label={t('launcherSettings.freezeTitle')}
        hint={state.canOpenFreeze ? t('launcherSettings.freezeHintButton') : t('launcherSettings.onyxFreezeHint')}
      >
        {state.canOpenFreeze ? (
          <button
            type="button"
            className={`${linkButton} shrink-0`}
            onClick={() => {
              void openFreezeSettings().then((ok) => {
                if (!ok) snackbar.show(t('launcherSettings.couldNotOpenSettings'), undefined, 'error');
              });
            }}
          >
            {t('launcherSettings.open')}
          </button>
        ) : null}
      </Row>
    );
  }
  if (state.unrestricted) return null;
  return (
    <Row label={t('launcherSettings.backgroundTitle')} hint={t('launcherSettings.backgroundHint')}>
      <button type="button" className={`${linkButton} shrink-0`} onClick={() => void requestUnrestricted()}>
        {t('launcherSettings.allow')}
      </button>
    </Row>
  );
}

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

  // The HOME activity is always available (like any launcher). Becoming the home screen is the
  // system's own dialog (RoleManager, Android 10+); leaving it is the system home choice.
  return (
    <div>
      <div className="py-3 border-b border-[color:var(--app-border)]">
        <p className={`${textStyles.body} ${theme.text}`}>{t('launcherSettings.title')}</p>
        <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>
          {state.isDefault ? t('launcherSettings.defaultHint') : t('launcherSettings.offHint')}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {state.isDefault ? (
            <>
              <button
                type="button"
                className={linkButton}
                onClick={() => {
                  // Leaving on purpose: no «it got lost» prompt afterwards.
                  forgetLauncherHome();
                  openHomeSettings();
                }}
              >
                {t('launcherSettings.chooseOther')}
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
            </>
          ) : (
            <button type="button" className={`${linkButton} ${theme.accentBg}`} onClick={() => void requestHomeRole()}>
              {t('launcherSettings.makeHome')}
            </button>
          )}
        </div>
      </div>
      {state.isDefault || state.lost || state.onyx ? <LauncherKeepAliveRow /> : null}
      {state.isDefault ? (
        <Row label={t('launcherHome.apps')} hint={t('launcherSettings.appsHint')}>
          <Switch checked={blocks.apps} label={t('launcherHome.apps')} onChange={(v) => setBlock('apps', v)} />
        </Row>
      ) : null}
    </div>
  );
}
