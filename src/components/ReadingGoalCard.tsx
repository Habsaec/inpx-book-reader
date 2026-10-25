import React from 'react';
import { theme } from '../lib/appTheme';
import { fetchReadingStats, isAuthError, saveReadingGoal, type ReadingStats } from '../lib/inpxClient';
import type { ServerConfig } from '../types';
import { radii, textStyles } from '../ui/tokens';
import Button from '../ui/Button';

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

interface ReadingGoalCardProps {
  serverConfig: ServerConfig;
  isOnline: boolean;
  /** Re-fetch when the profile tab is shown again (books may have been finished meanwhile). */
  refreshKey?: number;
  onAuthExpired?: () => void;
}

/** Profile: yearly reading goal + this year by month (same data as the web profile, `/api/reading-stats`). */
export default function ReadingGoalCard({ serverConfig, isOnline, refreshKey = 0, onAuthExpired }: ReadingGoalCardProps) {
  const [stats, setStats] = React.useState<ReadingStats | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    fetchReadingStats(serverConfig)
      .then((value) => { if (!cancelled) setStats(value); })
      .catch((e) => {
        if (cancelled) return;
        if (isAuthError(e)) onAuthExpired?.();
      });
    return () => { cancelled = true; };
  }, [serverConfig, isOnline, refreshKey, onAuthExpired]);

  if (!stats) return null;

  const { year, goal, readThisYear, byMonth } = stats;
  const pct = goal ? Math.min(100, Math.round((readThisYear / goal) * 100)) : 0;
  const maxMonth = Math.max(1, ...byMonth);

  const save = async () => {
    const value = Math.max(0, Math.min(1000, Math.floor(Number(draft) || 0)));
    setSaving(true);
    setError('');
    try {
      setStats(await saveReadingGoal(serverConfig, value, year));
      setEditing(false);
    } catch (e) {
      if (isAuthError(e)) onAuthExpired?.();
      setError('Не удалось сохранить цель');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`mt-3 p-4 ${radii.lg} ${theme.card}`} aria-label={`Цель на ${year} год`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={`${textStyles.bodyBold} ${theme.text}`}>Цель на {year} год</h3>
        {!editing ? (
          <button
            type="button"
            className={`${textStyles.caption} ${theme.accentText} ${theme.focusRing} ${radii.sm}`}
            onClick={() => { setDraft(goal ? String(goal) : ''); setEditing(true); }}
          >
            {goal ? 'Изменить' : 'Поставить цель'}
          </button>
        ) : null}
      </div>
      <p className={`mt-1 ${textStyles.body} ${theme.textMuted}`}>
        {goal ? `Прочитано ${readThisYear} из ${goal}` : `В этом году прочитано ${readThisYear}`}
      </p>
      {goal ? (
        <div
          className="mt-2 h-2 rounded-full overflow-hidden bg-[var(--app-progress-track)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-valuenow={Math.min(readThisYear, goal)}
        >
          <span className="block h-full rounded-full bg-[var(--app-accent)]" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-12 gap-1 items-end h-16" aria-label="Прочитано по месяцам">
        {byMonth.map((n, i) => (
          <div key={MONTHS_SHORT[i]} className="flex h-full flex-col items-center gap-1" title={`${MONTHS_SHORT[i]}: ${n}`}>
            <span className="flex-1 w-full max-w-4 flex items-end rounded bg-[color-mix(in_srgb,var(--app-text)_6%,transparent)]">
              <span
                className="block w-full rounded bg-[var(--app-accent)]"
                style={{ height: n ? `${Math.max(8, Math.round((n / maxMonth) * 100))}%` : 0 }}
              />
            </span>
            <span className={`text-[0.625rem] leading-none ${theme.textMuted}`}>{MONTHS_SHORT[i]}</span>
          </div>
        ))}
      </div>
      {editing ? (
        <div className="mt-4 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={1000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="например, 40"
            aria-label="Цель, книг в год"
            className={`w-28 px-3 py-2 ${radii.md} ${theme.input}`}
          />
          <Button onClick={save} loading={saving}>Сохранить</Button>
          <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Отмена</Button>
        </div>
      ) : null}
      {error ? <p className={`mt-2 ${textStyles.caption} text-[var(--app-danger)]`} role="alert">{error}</p> : null}
    </section>
  );
}
