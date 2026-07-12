import { describe, it, expect } from 'vitest';
import { textStyles } from '../../ui/tokens';

/** Snapshot-style guard: typography tokens used by light/dark UI stay stable. */
describe('theme typography tokens', () => {
  it('defines micro and body scales for server-aligned UI', () => {
    expect(textStyles.micro).toContain('11px');
    expect(textStyles.body).toContain('text-sm');
    expect(textStyles.label).toContain('11px');
  });
});
