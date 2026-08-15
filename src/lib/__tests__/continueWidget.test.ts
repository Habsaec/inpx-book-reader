import { describe, expect, it } from 'vitest';
import { safeBookIdFileKey } from '../bookRef';
import { widgetCoverCachePath } from '../continueWidget';

describe('widgetCoverCachePath', () => {
  it('points at the app-cache thumb used by coverCache', () => {
    expect(widgetCoverCachePath('1:758073')).toBe(`covers/${safeBookIdFileKey('1:758073')}_thumb.jpg`);
    expect(widgetCoverCachePath('1:758073')).toBe('covers/1_758073_thumb.jpg');
  });
});
