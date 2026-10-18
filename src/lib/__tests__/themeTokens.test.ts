import { describe, it, expect } from 'vitest';
import { textStyles } from '../../ui/tokens';

/** Snapshot-style guard: typography tokens stay on the redesign scale. */
describe('theme typography tokens', () => {
  it('defines four UI type levels', () => {
    expect(textStyles.title).toContain('text-[1.75rem]');
    expect(textStyles.sectionLabel).toContain('text-xl');
    expect(textStyles.body).toContain('text-[0.9375rem]');
    expect(textStyles.caption).toContain('text-[0.8125rem]');
    expect(textStyles.micro).toContain('text-[0.8125rem]');
    expect(textStyles.label).toContain('text-[0.8125rem]');
  });

  it('keeps tab labels readable and book titles in the UI sans', () => {
    expect(textStyles.tabLabel).toContain('text-[0.8125rem]');
    expect(textStyles.tabLabel).not.toContain('text-[11px]');
    expect(textStyles.bookTitle).not.toContain('font-serif');
    expect(textStyles.bookTitleHero).not.toContain('font-serif');
    expect(textStyles.bookTitleHero).toContain('font-extrabold');
  });
});
