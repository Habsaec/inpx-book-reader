import { describe, expect, it } from 'vitest';
import { flattenColorMix } from '../flattenColorMix';

describe('flattenColorMix', () => {
  it('should_mix_hex_over_transparent_when_browser_cannot_parse_color_mix', () => {
    expect(flattenColorMix('color-mix(in srgb, #2a2218 14%, transparent)')).toBe('rgba(42, 34, 24, 0.14)');
  });

  it('should_keep_plain_colors', () => {
    expect(flattenColorMix('#fffdf9')).toBe('#fffdf9');
  });

  it('should_blend_two_opaque_colors', () => {
    expect(flattenColorMix('color-mix(in srgb, #000000 50%, #ffffff)')).toBe('rgb(128, 128, 128)');
  });
});
