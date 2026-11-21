import { describe, expect, it } from 'vitest';
import { coverTonesFromItem } from '../inpxClient';

describe('server cover tones', () => {
  it('passes a well-formed color and WebP placeholder through', () => {
    expect(coverTonesFromItem({ coverColor: '#a1b2c3', coverLqip: 'data:image/webp;base64,UklGRg==' }))
      .toEqual({ coverColor: '#a1b2c3', coverLqip: 'data:image/webp;base64,UklGRg==' });
  });

  it('drops anything that could break out of an inline style', () => {
    expect(coverTonesFromItem({ coverColor: 'red;background:url(x)', coverLqip: 'javascript:alert(1)' })).toEqual({});
    expect(coverTonesFromItem({ coverLqip: 'data:image/webp;base64,AA) ; x' })).toEqual({});
  });

  it('older servers send nothing: no fields at all', () => {
    expect(coverTonesFromItem({})).toEqual({});
  });
});
