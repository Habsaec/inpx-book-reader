import { describe, expect, it } from 'vitest';
import { HOME_SECTION_IDS, moveHomeSection, normalizeHomeLayout, orderShelves, reorderShelfGroup, toggleHomeSection } from '../homeLayout';

describe('homeLayout', () => {
  it('defaults to every section in order', () => {
    expect(normalizeHomeLayout(null)).toEqual({ order: [...HOME_SECTION_IDS], hidden: [], shelfOrder: [] });
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

  it('orders shelves and reorders one kind, keeping shelfOrder through section edits', () => {
    const shelves = [{ key: 'shelf:1' }, { key: 'smart:3' }, { key: 'smart:4' }];
    expect(orderShelves(shelves, ['smart:4', 'shelf:9']).map((s) => s.key)).toEqual(['smart:4', 'shelf:1', 'smart:3']);
    const all = ['shelf:1', 'smart:3', 'shelf:2', 'smart:4'];
    const layout = reorderShelfGroup(normalizeHomeLayout(null), all, ['shelf:2', 'shelf:1']);
    expect(layout.shelfOrder).toEqual(['shelf:2', 'smart:3', 'shelf:1', 'smart:4']);
    expect(reorderShelfGroup(layout, all, ['shelf:2'])).toBe(layout);
    expect(moveHomeSection(layout, 'novinki', 'up').shelfOrder).toEqual(layout.shelfOrder);
    expect(toggleHomeSection(layout, 'recent', false).shelfOrder).toEqual(layout.shelfOrder);
    expect(normalizeHomeLayout({ shelfOrder: ['smart:3', 'x', 'smart:3'] }).shelfOrder).toEqual(['smart:3']);
  });
});
