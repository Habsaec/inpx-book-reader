import React from 'react';
import { theme } from '../../lib/appTheme';
import { textStyles, radii, elevation, motion } from '../../ui/tokens';
import type { CatalogSearchHints } from '../../lib/inpxClient';

interface Props {
  hints: CatalogSearchHints | null | undefined;
  onDidYouMean: (q: string) => void;
}

export default function CatalogSearchHintsBanner({ hints, onDidYouMean }: Props) {
  if (!hints) return null;
  const typos = (hints.didYouMean || []).map((s) => String(s || '').trim()).filter(Boolean);
  const tip = String(hints.tip || '').trim();
  if (!tip && !typos.length) return null;

  return (
    <div className={`mb-4 ${radii.lg} ${theme.card} ${elevation.card} px-4 py-3.5 space-y-2.5`}>
      {tip ? <p className={`${textStyles.body} ${theme.textMuted}`}>{tip}</p> : null}
      {typos.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${textStyles.caption} ${theme.textMuted}`}>Возможно, вы имели в виду</span>
          {typos.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onDidYouMean(q)}
              className={`min-h-10 px-4 ${radii.button} ${textStyles.captionBold} ${theme.accentText} ${theme.accentMuted} ${theme.focusRing} ${motion.press}`}
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
