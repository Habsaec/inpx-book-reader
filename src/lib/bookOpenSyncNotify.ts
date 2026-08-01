/** Fired after per-book open sync finishes so Foliate can re-seed / prompt. */
export const BOOK_OPEN_SYNC_DONE_EVENT = 'inpx-book-open-sync-done';

let lastDone: { bookId: string; at: number } | null = null;

export function notifyBookOpenSyncDone(bookId: string): void {
  const id = String(bookId || '').trim();
  if (!id) return;
  lastDone = { bookId: id, at: Date.now() };
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BOOK_OPEN_SYNC_DONE_EVENT, { detail: { bookId: id } }));
}

/** True if open-sync for this book finished recently (handles race before listener mounts). */
export function peekRecentBookOpenSyncDone(bookId: string, withinMs = 15_000): boolean {
  const id = String(bookId || '').trim();
  if (!id || !lastDone) return false;
  return lastDone.bookId === id && Date.now() - lastDone.at <= withinMs;
}
