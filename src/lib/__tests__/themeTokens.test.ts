import { describe, it, expect } from 'vitest';
import { textStyles } from '../../ui/tokens';

/** Snapshot-style guard: typography tokens stay on the «Книжная бумага» scale. */
describe('theme typography tokens', () => {
  it('defines the UI type levels', () => {
    expect(textStyles.title).toContain('text-[1.875rem]');
    expect(textStyles.sectionLabel).toContain('text-[1.3125rem]');
    expect(textStyles.body).toContain('text-base');
    expect(textStyles.caption).toContain('text-[0.8125rem]');
    expect(textStyles.micro).toContain('text-[0.8125rem]');
    expect(textStyles.label).toContain('text-[0.8125rem]');
  });

  it('keeps tab labels in the UI sans and titles in the serif', () => {
    expect(textStyles.tabLabel).toContain('text-[0.8125rem]');
    expect(textStyles.tabLabel).not.toContain('font-serif');
    expect(textStyles.title).toContain('font-serif');
    expect(textStyles.sectionLabel).toContain('font-serif');
    expect(textStyles.bookTitle).toContain('font-serif');
    expect(textStyles.bookTitleHero).toContain('font-serif');
  });
});
