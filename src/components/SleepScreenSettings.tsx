import React from 'react';
import { theme } from '../lib/appTheme';
import { textStyles, motion, radii } from '../ui/tokens';
import {
  isSleepScreenSupported,
  setSleepScreenSettings,
  useSleepScreenSettings,
  useSleepScreenStatus,
  type SleepScreenSettings as Settings,
} from '../lib/sleepScreen';
import { Switch } from './LauncherSettings';
import { t } from '../i18n';

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

/** Segmented choice with the app's `inpx-segment` markup (E-Ink styles target it). */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
}) {
  return (
    <div className="py-3 space-y-2 border-b border-[color:var(--app-border)]">
      <p className={`${textStyles.body} ${theme.text}`}>{label}</p>
      <div role="radiogroup" aria-label={label} className={`inpx-segment flex p-1 ${radii.button} bg-[var(--app-panel-soft)]`}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            onClick={() => {
              if (value !== o.id) onChange(o.id);
            }}
            className={`relative min-h-12 flex-1 inline-flex items-center justify-center px-2 ${radii.button} ${textStyles.body} ${theme.focusRing} ${motion.press} ${
              value === o.id ? `${theme.text} bg-[var(--app-surface)] border border-[color:var(--app-border)]` : theme.textMuted
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Profile → Внешний вид → «Экран сна» (BOOX only): the current book's cover as the BOOX sleep
 * picture. One setting for the device, not per account.
 */
export default function SleepScreenSettings() {
  const [supported, setSupported] = React.useState(false);
  const settings = useSleepScreenSettings();
  const status = useSleepScreenStatus();
  React.useEffect(() => {
    let cancelled = false;
    void isSleepScreenSupported().then((ok) => {
      if (!cancelled) setSupported(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!supported) return null;

  const update = (patch: Partial<Settings>) => {
    void setSleepScreenSettings({ ...settings, ...patch });
  };

  return (
    <div>
      <Row label={t('sleepScreen.title')} hint={t('sleepScreen.hint')}>
        <Switch checked={settings.enabled} label={t('sleepScreen.title')} onChange={(v) => update({ enabled: v })} />
      </Row>
      {settings.enabled ? (
        <>
          {status.state !== 'idle' ? (
            <p role="status" className={`py-3 ${textStyles.caption} ${theme.text} border-b border-[color:var(--app-border)]`}>
              {status.state === 'published'
                ? t('sleepScreen.statusPublished', { title: status.title })
                : status.state === 'no-book'
                  ? t('sleepScreen.statusNoBook')
                  : t('sleepScreen.statusFailed')}
            </p>
          ) : null}
          <Choice
            label={t('sleepScreen.layout')}
            value={settings.layout}
            options={[
              { id: 'card', label: t('sleepScreen.layoutCard') },
              { id: 'cover', label: t('sleepScreen.layoutCover') },
            ]}
            onChange={(layout) => update({ layout })}
          />
          {settings.layout === 'card' ? (
            <>
              <Choice
                label={t('sleepScreen.background')}
                value={settings.theme}
                options={[
                  { id: 'light', label: t('sleepScreen.light') },
                  { id: 'dark', label: t('sleepScreen.dark') },
                ]}
                onChange={(value) => update({ theme: value })}
              />
              <Row label={t('sleepScreen.showProgress')}>
                <Switch checked={settings.showProgress} label={t('sleepScreen.showProgress')} onChange={(v) => update({ showProgress: v })} />
              </Row>
              <Row label={t('sleepScreen.clockSpace')} hint={t('sleepScreen.clockSpaceHint')}>
                <Switch checked={settings.clockSpace} label={t('sleepScreen.clockSpace')} onChange={(v) => update({ clockSpace: v })} />
              </Row>
            </>
          ) : null}
          <p className={`py-3 ${textStyles.caption} ${theme.textMuted} border-b border-[color:var(--app-border)]`}>
            {t('sleepScreen.booxOverlayHint')}
          </p>
        </>
      ) : null}
    </div>
  );
}
