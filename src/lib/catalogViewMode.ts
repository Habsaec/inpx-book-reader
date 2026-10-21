export type CatalogViewMode = 'list' | 'grid';

/** `home` — полки на главной; `books` — каталог, мои книги, «Показать всё». */
export type BooksViewScope = 'home' | 'books';

export function parseCatalogViewMode(raw: string | null | undefined): CatalogViewMode | null {
  if (raw === 'list' || raw === 'grid') return raw;
  return null;
}

/** Default when the user has not chosen a view mode yet: covers on Home, rows everywhere else. */
export function defaultCatalogViewMode(scope: BooksViewScope): CatalogViewMode {
  return scope === 'home' ? 'grid' : 'list';
}

export function resolveCatalogViewMode(raw: string | null | undefined, scope: BooksViewScope): CatalogViewMode {
  return parseCatalogViewMode(raw) ?? defaultCatalogViewMode(scope);
}
