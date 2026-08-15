export type CatalogSubTab = 'books' | 'authors' | 'series' | 'genres';

/** Full set (legacy / back-handler). */
export const CATALOG_SUB_TABS: CatalogSubTab[] = ['books', 'authors', 'series', 'genres'];

/** Browse catalog root (start screen). */
export const CATALOG_BROWSE_ROOT: CatalogSubTab = 'authors';

/** Browse catalog: Авторы / Серии / Жанры (no «Книги»). */
export const CATALOG_BROWSE_TABS: CatalogSubTab[] = ['authors', 'series', 'genres'];

/** Active search: books / authors / series (no genres). */
export const CATALOG_SEARCH_TABS: CatalogSubTab[] = ['books', 'authors', 'series'];

export const CATALOG_BROWSE_TAB_LABELS: { id: CatalogSubTab; label: string }[] = [
  { id: 'authors', label: 'Авторы' },
  { id: 'series', label: 'Серии' },
  { id: 'genres', label: 'Жанры' },
];

export const CATALOG_SEARCH_TAB_LABELS: { id: CatalogSubTab; label: string }[] = [
  { id: 'books', label: 'Книги' },
  { id: 'authors', label: 'Авторы' },
  { id: 'series', label: 'Серии' },
];

export type CatalogFormatFilter = 'all' | 'fb2' | 'epub' | 'txt';

/** Series presence filter for `/api/catalog?hasSeries=` */
export type CatalogHasSeriesFilter = 'any' | 'yes' | 'no';

export type DemoBookSort = 'rating' | 'downloads' | 'title' | 'year' | 'size';

export type { CatalogViewMode } from '../../lib/catalogViewMode';

/** Legacy localStorage key; preference now lives in app_meta via useCatalogViewMode. */
export const CATALOG_VIEW_STORAGE_KEY = 'inpx_catalog_view';
