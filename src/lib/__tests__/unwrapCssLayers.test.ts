import { describe, it, expect } from 'vitest';
import { addFlexGapFallback, physicalizeLogicalCss, unwrapCssLayers } from '../../../scripts/unwrap-css-layers.mjs';

describe('Chrome 83 CSS lowering', () => {
  it('should_keep_rules_in_order_when_layers_are_unwrapped', () => {
    const css = '@layer theme, base;@layer base{a{color:red}}@layer utilities{.flex{display:flex}@media (min-width:600px){.x{left:0}}}';
    expect(unwrapCssLayers(css)).toBe('a{color:red}.flex{display:flex}@media (min-width:600px){.x{left:0}}');
  });

  it('should_not_touch_layer_text_inside_strings', () => {
    const css = '.a::before{content:"@layer x{"}';
    expect(unwrapCssLayers(css)).toBe(css);
  });

  it('should_turn_logical_padding_into_left_and_right', () => {
    expect(physicalizeLogicalCss('.px-4{padding-inline:1rem}')).toBe('.px-4{padding-left: 1rem; padding-right: 1rem}');
  });

  it('should_add_margin_fallback_for_flex_gap', () => {
    const out = addFlexGapFallback('.gap-3{gap:calc(var(--spacing) * 3)}');
    expect(out).toContain(
      'html[data-flex-gap="0"] .flex.gap-3>*+*,html[data-flex-gap="0"] .inline-flex.gap-3>*+*{margin-left:calc(var(--spacing) * 3)}',
    );
    expect(out).toContain('html[data-flex-gap="0"] .flex-col.gap-3>*+*{margin-left:0;margin-top:calc(var(--spacing) * 3)}');
  });
});
