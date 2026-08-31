import { describe, expect, it } from 'vitest';
import { isMalformedLocationCfi, parse } from '../../../public/foliate/epubcfi.js';

describe('isMalformedLocationCfi', () => {
  it('flags an empty-start range CFI (readest#4370)', () => {
    expect(isMalformedLocationCfi('epubcfi(/6/24!/4,,/20/1:58)')).toBe(true);
  });

  it('flags an empty-end range CFI', () => {
    expect(isMalformedLocationCfi('epubcfi(/6/24!/4/20/1:58,,)')).toBe(true);
  });

  it('accepts a well-formed point CFI', () => {
    expect(isMalformedLocationCfi('epubcfi(/6/24!/4/2/1:12)')).toBe(false);
  });

  it('accepts a well-formed range CFI', () => {
    expect(isMalformedLocationCfi('epubcfi(/6/24!/4/2:1,/4/20:58)')).toBe(false);
  });

  it('parse exposes empty start path on the degenerate form', () => {
    const parts = parse('epubcfi(/6/24!/4,,/20/1:58)');
    expect(parts.parent).toBeTruthy();
    expect(parts.start.every((group: unknown[]) => group.length === 0)).toBe(true);
  });
});
