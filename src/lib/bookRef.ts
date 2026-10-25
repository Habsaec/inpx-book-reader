/**
 * Safe book ID URLs — mirrors INPX Library Server `utils/book-ref.js`.
 * IDs with NUL / control chars must use `/b64/<base64url>` or HTTP stacks return 400.
 */

export function bookIdNeedsSafeUrl(id: string): boolean {
  const s = String(id ?? '');
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function encodeBookRef(id: string): string {
  const bytes = new TextEncoder().encode(String(id));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeBookRef(ref: string): string | null {
  if (!ref || typeof ref !== 'string') return null;
  try {
    let b64 = ref.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    return decoded.length ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Local book id → id on the active server. A book downloaded from another server (or before
 * its source was added again under a new source id) keeps its old id on the device; the
 * server knows it under another one (`POST /api/books/resolve`, see serverBookAliases.ts).
 */
const aliasToServer = new Map<string, string>();
const aliasToLocal = new Map<string, string>();

export function setServerBookAliases(aliases: Record<string, string>): void {
  aliasToServer.clear();
  aliasToLocal.clear();
  for (const [localId, serverId] of Object.entries(aliases)) {
    if (!localId || !serverId || localId === serverId) continue;
    aliasToServer.set(localId, serverId);
    aliasToLocal.set(serverId, localId);
  }
}

export function toServerBookId(id: string): string {
  const s = String(id ?? '');
  return aliasToServer.get(s) ?? s;
}

/** Server id from a list / sync response → the id this device stores the book under. */
export function toLocalBookId(id: string): string {
  const s = String(id ?? '');
  return aliasToLocal.get(s) ?? s;
}

function bookSegment(prefix: string, localId: string, suffix = ''): string {
  const id = toServerBookId(localId);
  const tail = suffix ? (suffix.startsWith('/') ? suffix : `/${suffix}`) : '';
  if (bookIdNeedsSafeUrl(id)) {
    return `${prefix}/b64/${encodeBookRef(id)}${tail}`;
  }
  return `${prefix}/${encodeURIComponent(id)}${tail}`;
}

/**
 * Filesystem-safe key for bookId under `.inpx-reader/` (covers, chapters JSON).
 * Flibusta-style IDs with NUL/control chars must not appear raw in paths.
 */
export function safeBookIdFileKey(bookId: string): string {
  const id = String(bookId ?? '');
  if (bookIdNeedsSafeUrl(id)) {
    return `b64_${encodeBookRef(id)}`;
  }
  // ':' тоже под замену: FUSE/vfat на /sdcard молча конвертирует ':' в '_' при записи,
  // иначе путь с Flibusta-id вида '1:758073' никогда не совпадёт с файлом на диске.
  return id
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '_')
    .slice(0, 180);
}

/**
 * Pre-b64 filesystem key (controls → `_`). Used only to migrate legacy
 * `.inpx-reader/` paths written before `safeBookIdFileKey` used `b64_`.
 */
export function legacyStrippedBookIdFileKey(bookId: string): string {
  return String(bookId ?? '')
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '_')
    .slice(0, 180);
}

function apiActionPath(prefix: string, localId: string): string {
  const id = toServerBookId(localId);
  return bookIdNeedsSafeUrl(id)
    ? `${prefix}/b64/${encodeBookRef(id)}`
    : `${prefix}/${encodeURIComponent(id)}`;
}

/** `/api/books/:id` or `/api/books/b64/:ref` (+ optional suffix like `/content`). */
export function apiBookPath(id: string, suffix = ''): string {
  return bookSegment('/api/books', id, suffix);
}

export function apiReadPath(id: string): string {
  return apiActionPath('/api/read', id);
}

export function apiBookmarkPath(id: string): string {
  return apiActionPath('/api/bookmarks', id);
}

/** «Хочу прочитать» toggle (server: `/api/want/:id`, `/api/want/b64/<ref>`). */
export function apiWantPath(id: string): string {
  return apiActionPath('/api/want', id);
}

/** Personal rating 1–5 (server: `/api/rating/:id`, `/api/rating/b64/<ref>`). */
export function apiRatingPath(id: string): string {
  return apiActionPath('/api/rating', id);
}

export function apiReadingHistoryPath(id: string): string {
  return apiActionPath('/api/reading-history', id);
}
