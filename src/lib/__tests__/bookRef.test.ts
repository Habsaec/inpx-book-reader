import { describe, it, expect } from 'vitest';
import {
  bookIdNeedsSafeUrl,
  encodeBookRef,
  decodeBookRef,
  apiBookPath,
  apiBookmarkPath,
  apiReadingHistoryPath,
} from '../bookRef';

/** Same sample as inpx-library-server/test/book-ref.test.js */
const SAMPLE_ID = '8:791195\x00f.fb2-791176-794180.7z\x00791195\x00fb2';

describe('bookRef', () => {
  it('detects NUL / control chars', () => {
    expect(bookIdNeedsSafeUrl('normal-book-id.fb2')).toBe(false);
    expect(bookIdNeedsSafeUrl(SAMPLE_ID)).toBe(true);
    expect(bookIdNeedsSafeUrl('line\nbreak')).toBe(true);
  });

  it('round-trips base64url refs', () => {
    const ref = encodeBookRef(SAMPLE_ID);
    expect(ref).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeBookRef(ref)).toBe(SAMPLE_ID);
  });

  it('uses /b64/ only for unsafe ids', () => {
    expect(apiBookPath('abc.fb2', 'content')).toBe('/api/books/abc.fb2/content');
    expect(apiBookPath(SAMPLE_ID, 'content')).toMatch(/^\/api\/books\/b64\/.+\/content$/);
    expect(apiBookmarkPath(SAMPLE_ID)).toMatch(/^\/api\/bookmarks\/b64\//);
    expect(apiReadingHistoryPath('safe-id')).toBe('/api/reading-history/safe-id');
  });
});
