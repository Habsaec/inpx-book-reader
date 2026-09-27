import { describe, expect, it } from 'vitest';
import { createOpeningClickGuard } from '../openingClickGuard';

describe('createOpeningClickGuard', () => {
  it('swallows the click that follows the opening finger-up', () => {
    const guard = createOpeningClickGuard();
    guard.notePointerUp();
    expect(guard.isArmed()).toBe(true);
    expect(guard.consumeReleaseClick()).toBe(true);
    expect(guard.consumeReleaseClick()).toBe(false);
  });

  it('does not swallow a tap that starts after a release with no click', () => {
    const guard = createOpeningClickGuard();
    guard.notePointerUp();
    guard.notePointerDown();
    expect(guard.consumeReleaseClick()).toBe(false);
  });

  it('does not treat a later finger-up as another release click', () => {
    const guard = createOpeningClickGuard();
    guard.notePointerUp();
    expect(guard.consumeReleaseClick()).toBe(true);
    guard.notePointerDown();
    guard.notePointerUp();
    expect(guard.consumeReleaseClick()).toBe(false);
  });

  it('swallows a click that arrives before finger-up and then stays quiet', () => {
    const guard = createOpeningClickGuard();
    expect(guard.consumeReleaseClick()).toBe(true);
    expect(guard.isArmed()).toBe(true);
    guard.notePointerUp();
    expect(guard.consumeReleaseClick()).toBe(false);
  });
});
