export interface AndroidPositionPayload {
  sectionIndex?: number;
  textOffset?: number;
  textQuote?: string;
  textSectionLength?: number;
  sectionPageFraction?: number;
  paginatorPage?: number;
  paginatorPages?: number;
  layoutMode?: string;
  [key: string]: unknown;
}

export function enrichAndroidPositionPayload<T extends AndroidPositionPayload>(
  payload: T,
  loc: unknown,
  renderer: unknown,
  currentLayoutMode: string,
): T;
