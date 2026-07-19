export function enrichAndroidPositionPayload(payload, loc, renderer, currentLayoutMode) {
  const sectionIndex = Number(loc?.section?.current);
  const page = Number(renderer?.page);
  const pages = Number(renderer?.pages);
  if (Number.isFinite(sectionIndex)) payload.sectionIndex = sectionIndex;
  if (Number.isInteger(loc?.textOffset) && loc.textOffset >= 0) {
    payload.textOffset = loc.textOffset;
  }
  if (typeof loc?.textQuote === 'string') {
    payload.textQuote = loc.textQuote.slice(0, 256);
  }
  if (Number.isInteger(loc?.textSectionLength) && loc.textSectionLength >= 0) {
    payload.textSectionLength = loc.textSectionLength;
  }
  if (Number.isFinite(page)) payload.paginatorPage = page;
  if (Number.isFinite(pages)) payload.paginatorPages = pages;
  if (Number.isFinite(page) && Number.isFinite(pages) && pages > 2) {
    payload.sectionPageFraction = Math.max(0, Math.min(1, (page - 1) / (pages - 2)));
  }
  payload.layoutMode = String(currentLayoutMode || 'paginated');
  return payload;
}
