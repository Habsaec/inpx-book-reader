import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ServerConfig } from '../../types';
import { theme } from '../../lib/appTheme';
import { displayAuthorName, fetchAlphaIndex, type AlphaIndexResult } from '../../lib/inpxClient';
import { textStyles, motion } from '../../ui/tokens';
import { t, formatNumber, getLocale } from '../../i18n';

/* Alphabet index of authors / series, as on the web /authors?idx= pages: a letter opens its next-letter groups with
   counts («Ка 4235 · Ко 5622 …»), a group deepens until it holds ≤ 300 names, which are then listed A–Z.
   The open prefix survives leaving the list (an author page and back) for the rest of the session. */
const lastPrefix: Record<'authors' | 'series', string> = { authors: '', series: '' };

const cap = (s: string) => s.replace(/^./u, (c) => c.toUpperCase()).replace(/ $/, ' …');

export default function AlphaIndexPanel({
  kind,
  serverConfig,
  onOpen,
  onActiveChange,
}: {
  kind: 'authors' | 'series';
  serverConfig: ServerConfig;
  onOpen: (name: string) => void;
  /** true while a letter is open — the regular list below is hidden then. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [prefix, setPrefixState] = React.useState(lastPrefix[kind]);
  const [root, setRoot] = React.useState<AlphaIndexResult | null>(null);
  const [current, setCurrent] = React.useState<AlphaIndexResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  const setPrefix = (next: string) => {
    lastPrefix[kind] = next;
    setPrefixState(next);
  };

  React.useEffect(() => {
    onActiveChange?.(Boolean(prefix));
  }, [prefix, onActiveChange]);

  React.useEffect(() => {
    let cancelled = false;
    fetchAlphaIndex(serverConfig, kind, '')
      .then((r) => { if (!cancelled) setRoot(r); })
      .catch(() => { /* older server: no index */ });
    return () => { cancelled = true; };
  }, [serverConfig, kind]);

  React.useEffect(() => {
    setCurrent(null);
    if (!prefix) return;
    let cancelled = false;
    setLoading(true);
    fetchAlphaIndex(serverConfig, kind, prefix)
      .then((r) => { if (!cancelled) setCurrent(r); })
      .catch(() => { /* keep the list */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [serverConfig, kind, prefix]);

  if (!root || !root.groups.length) return null;
  const cyr = root.groups.filter((g) => /^[а-яё]$/.test(g.prefix));
  const lat = root.groups.filter((g) => /^[a-z]$/.test(g.prefix));
  const rows = (getLocale() === 'en' ? [lat, cyr] : [cyr, lat]).filter((row) => row.length);

  const crumbs: string[] = [];
  for (let i = 1; i <= prefix.length; i += 1) {
    const p = prefix.slice(0, i);
    if (p.endsWith(' ') && i < prefix.length) continue;
    crumbs.push(p);
  }

  const chip = `min-h-9 px-3 rounded-full ${textStyles.captionBold} ${theme.focusRing} ${motion.press}`;
  return (
    <div className="space-y-3 pb-1">
      <div className="space-y-1" aria-label={t('alphaIndex.title')}>
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap gap-1">
            {row.map((g) => (
              <button
                key={g.prefix}
                type="button"
                onClick={() => setPrefix(prefix[0] === g.prefix && prefix.length === 1 ? '' : g.prefix)}
                className={`min-w-9 min-h-9 px-1.5 rounded-lg ${textStyles.bodyBold} ${theme.focusRing} ${motion.press} ${
                  prefix[0] === g.prefix ? `${theme.accentMuted} ${theme.accentText}` : theme.text
                }`}
              >
                {g.prefix.toUpperCase()}
              </button>
            ))}
          </div>
        ))}
      </div>
      {prefix ? (
        <>
          <div className={`flex flex-wrap items-center gap-1 ${textStyles.body}`}>
            {crumbs.map((p, i) => (
              <React.Fragment key={p}>
                {i > 0 ? <ChevronRight className={`w-3.5 h-3.5 ${theme.textMuted}`} aria-hidden /> : null}
                {i === crumbs.length - 1 ? (
                  <strong className={theme.text}>{cap(p)}</strong>
                ) : (
                  <button type="button" onClick={() => setPrefix(p)} className={`${theme.accentText} ${theme.focusRing}`}>{cap(p)}</button>
                )}
              </React.Fragment>
            ))}
            {current ? <span className={`${textStyles.caption} ${theme.textMuted}`}>· {formatNumber(current.total)}</span> : null}
            <button type="button" onClick={() => setPrefix('')} className={`ml-auto ${textStyles.caption} ${theme.accentText} ${theme.focusRing}`}>
              {t('alphaIndex.close')}
            </button>
          </div>
          {loading && !current ? <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('alphaIndex.loading')}</p> : null}
          {current?.groups.length ? (
            <div className="flex flex-wrap gap-1.5">
              {current.groups.map((g) => (
                <button key={g.prefix} type="button" onClick={() => setPrefix(g.prefix)} className={`${chip} ${theme.accentMuted} ${theme.accentText}`}>
                  {cap(g.prefix)} <span className={`font-normal ${theme.textMuted}`}>{formatNumber(g.count)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {current?.items.length ? (
            <div>
              {current.items.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => onOpen(item.name)}
                  className={`w-full min-h-11 py-2 flex items-center justify-between gap-3 text-left border-b ${theme.divider} ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
                >
                  <span className={`min-w-0 truncate ${textStyles.body} ${theme.text}`}>
                    {kind === 'authors' ? displayAuthorName(item.displayName || item.name) : (item.displayName || item.name)}
                  </span>
                  <span className={`shrink-0 ${textStyles.caption} ${theme.textMuted}`}>{formatNumber(item.bookCount)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
