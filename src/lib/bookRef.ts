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

function bookSegment(prefix: string, id: string, suffix = ''): string {
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
  return id
    .replace(/[\/\\*?"<>|]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '_')
    .slice(0, 180);
}

/**
 * Pre-b64 filesystem key (controls → `_`). Used only to migrate legacy
 * `.inpx-reader/` paths written before `safeBookIdFileKey` used `b64_`.
 */
export function legacyStrippedBookIdFileKey(bookId: string): string {
  return String(bookId ?? '')
    .replace(/[\/\\*?"<>|]/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '_')
    .slice(0, 180);
}

function apiActionPath(prefix: string, id: string): string {
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

export function apiReadingHistoryPath(id: string): string {
  return apiActionPath('/api/reading-history', id);
}
