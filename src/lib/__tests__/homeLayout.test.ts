import { describe, expect, it } from 'vitest';
import { HOME_SECTION_IDS, moveHomeSection, normalizeHomeLayout, toggleHomeSection } from '../homeLayout';

describe('homeLayout', () => {
  it('defaults to every section in order', () => {
    expect(normalizeHomeLayout(null)).toEqual({ order: [...HOME_SECTION_IDS], hidden: [] });
  });

  it('keeps the server order and puts missing sections back in place', () => {
    const layout = normalizeHomeLayout({ order: ['shelves', 'novinki', 'bogus'], hidden: ['recent', 'nope'] });
    expect(layout.order).toEqual(['continue', 'recent', 'shelves', 'novinki', 'recommended', 'following']);
    expect(layout.hidden).toEqual(['recent']);
  });

  it('moves and toggles', () => {
    const layout = normalizeHomeLayout(null);
    expect(moveHomeSection(layout, 'novinki', 'up').order.slice(0, 3)).toEqual(['continue', 'novinki', 'recent']);
    expect(moveHomeSection(layout, 'continue', 'up')).toBe(layout);
    const hidden = toggleHomeSection(layout, 'recommended', false);
    expect(hidden.hidden).toEqual(['recommended']);
    expect(toggleHomeSection(hidden, 'recommended', true).hidden).toEqual([]);
  });
});
