export type CatalogSubTab = 'books' | 'authors' | 'series' | 'genres';

export const CATALOG_SUB_TABS: CatalogSubTab[] = ['books', 'authors', 'series', 'genres'];

export type CatalogFormatFilter = 'all' | 'fb2' | 'epub' | 'txt';

/** Series presence filter for `/api/catalog?hasSeries=` */
export type CatalogHasSeriesFilter = 'any' | 'yes' | 'no';

export type DemoBookSort = 'rating' | 'downloads' | 'title' | 'year' | 'size';

export type CatalogViewMode = 'list' | 'grid';

export const CATALOG_VIEW_STORAGE_KEY = 'inpx_catalog_view';
