/** Shared Foliate position helpers (web reader.js + Android reader.js). */

import {
  normalizeReadingFraction,
  fractionToProgress,
  progressToFraction,
  isFb2HrefFormat,
} from '../position-sync.js';

export const normalizeFraction = normalizeReadingFraction;
export { fractionToProgress, progressToFraction };

export function foliateIdFromRange(range) {
  if (!range) return '';
  let node = range.startContainer;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && node !== node.ownerDocument?.documentElement) {
    const id = node.getAttribute?.('data-foliate-id');
    if (id != null && id !== '') return id;
    node = node.parentElement;
  }
  return '';
}

function visibleFoliateIdFromRange(range) {
  const doc = range?.startContainer?.ownerDocument;
  if (!doc || range?.collapsed) return '';
  for (const marker of doc.querySelectorAll?.('[data-foliate-id]') ?? []) {
    try {
      if (!range.intersectsNode(marker)) continue;
      const id = marker.getAttribute('data-foliate-id');
      if (id != null && id !== '') return id;
    } catch {
      // Ignore detached markers.
    }
  }
  return '';
}

/** @param {object} loc Foliate location
 * @param {boolean} isFb2 whether current book is FB2 */
export function resolveFb2Href(loc, isFb2) {
  if (!isFb2) return '';
  const sectionIndex = loc?.section?.current;
  if (!Number.isFinite(Number(sectionIndex))) return '';
  // If a new chapter heading is visible on the current page, show/save that
  // chapter instead of the chapter whose trailing lines begin the page.
  const blockId = visibleFoliateIdFromRange(loc?.range) || foliateIdFromRange(loc?.range);
  if (blockId !== '') return `${sectionIndex}#${blockId}`;
  const tocHref = String(loc?.tocItem?.href || '').trim();
  if (tocHref && isFb2HrefFormat(tocHref)) return tocHref;
  return String(sectionIndex);
}

/** @param {object} loc Foliate location
 * @param {boolean} isFb2Active FB2 book with href-based restore */
export function positionFromLocation(loc, isFb2Active) {
  const fraction = normalizeFraction(loc?.fraction ?? 0);
  const href = resolveFb2Href(loc, isFb2Active);
  const payload = {
    position: isFb2Active ? '' : String(loc?.cfi || ''),
    fraction,
    progress: fractionToProgress(fraction),
  };
  if (href) payload.fb2Href = href;
  if (Number.isInteger(loc?.textOffset) && loc.textOffset >= 0) {
    payload.textOffset = loc.textOffset;
  }
  if (typeof loc?.textQuote === 'string') {
    payload.textQuote = loc.textQuote.slice(0, 256);
  }
  if (Number.isInteger(loc?.textSectionLength) && loc.textSectionLength >= 0) {
    payload.textSectionLength = loc.textSectionLength;
  }
  return payload;
}
