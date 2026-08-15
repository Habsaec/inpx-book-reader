import type { Book } from '../types';

/**
 * Short tap on a book card always opens the details sheet.
 * Read / download live on the sheet and in the long-press menu — not on the card tap.
 */
export function resolveBookTapAction(
  _book: Book,
  _downloadedBookIds?: Iterable<string>,
): 'open' | 'details' {
  return 'details';
}
