function normalizedQuote(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Old FB2 builds exploded each chapter into its own Foliate section.
 * Paper-flow stitches fiction into one section, so chapter-local
 * textOffset/sectionIndex from those saves must not be reused.
 */
export function isStaleExplodedFb2Anchor(saved, { linearCount, currentTextLength } = {}) {
  if (!(Number(linearCount) <= 1)) return false;
  const sectionIndex = Number(saved?.sectionIndex);
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0) return false;
  if (sectionIndex > 0) return true;
  const savedLen = Number(saved?.textSectionLength);
  const currentLen = Number(currentTextLength);
  if (
    Number.isInteger(savedLen) && savedLen > 0
    && Number.isInteger(currentLen) && currentLen > 0
  ) {
    return currentLen > savedLen * 2;
  }
  return false;
}

/** Verify an FB2 text-anchor landing despite tiny renderer boundary drift. */
export function isTextAnchorLandingVerified(saved, landed, offsetTolerance = 8) {
  const sectionIndex = Number(saved?.sectionIndex);
  const textOffset = Number(saved?.textOffset);
  if (saved?.sectionIndex == null || saved?.textOffset == null) return false;
  if (!Number.isInteger(sectionIndex) || sectionIndex < 0) return false;
  if (!Number.isInteger(textOffset) || textOffset < 0) return false;
  if (Number(landed?.section?.current) !== sectionIndex) return false;

  const landedOffset = Number(landed?.textOffset);
  const offsetMatches = Number.isInteger(landedOffset)
    && Math.abs(landedOffset - textOffset) <= Math.max(0, Number(offsetTolerance) || 0);
  const targetQuote = normalizedQuote(saved?.textQuote);
  if (!targetQuote) return offsetMatches;

  const landedQuote = normalizedQuote(
    `${landed?.textQuote || ''} ${landed?.range?.toString?.() || ''}`,
  );
  const quoteProbe = targetQuote.slice(0, Math.min(32, targetQuote.length));
  const quoteMatches = Boolean(landedQuote && quoteProbe && landedQuote.includes(quoteProbe));
  return offsetMatches || quoteMatches;
}
