export type CatalogViewMode = 'list' | 'grid';

export function parseCatalogViewMode(raw: string | null | undefined): CatalogViewMode | null {
  if (raw === 'list' || raw === 'grid') return raw;
  return null;
}

export function isEinkDocumentActive(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.eink === '1';
}

/** Default when the user has not chosen a view mode yet. */
export function defaultCatalogViewMode(einkActive = isEinkDocumentActive()): CatalogViewMode {
  return einkActive ? 'list' : 'grid';
}

export function resolveCatalogViewMode(
  raw: string | null | undefined,
  einkActive = isEinkDocumentActive(),
): CatalogViewMode {
  return parseCatalogViewMode(raw) ?? defaultCatalogViewMode(einkActive);
}
