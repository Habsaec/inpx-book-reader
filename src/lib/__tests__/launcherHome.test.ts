import { describe, expect, it } from 'vitest';
import {
  LAUNCHER_PINNED_APPS_MAX,
  launcherAppKey,
  normalizeLauncherBlocks,
  normalizePinnedApps,
  togglePinnedApp,
} from '../launcherHome';

describe('launcher settings', () => {
  it('defaults the apps row on and keeps booleans only', () => {
    expect(normalizeLauncherBlocks(null)).toEqual({ apps: true });
    expect(normalizeLauncherBlocks({ apps: false, following: false })).toEqual({ apps: false });
    expect(normalizeLauncherBlocks({ apps: 'no' })).toEqual({ apps: true });
  });

  it('normalizes and toggles pinned apps up to the limit', () => {
    const key = launcherAppKey({ packageName: 'com.x', activityName: 'com.x.Main' });
    expect(key).toBe('com.x/com.x.Main');
    expect(normalizePinnedApps(['a/b', 'a/b', 'bad', 3, 'c/d'])).toEqual(['a/b', 'c/d']);
    const full = Array.from({ length: LAUNCHER_PINNED_APPS_MAX }, (_, i) => `p${i}/A`);
    expect(togglePinnedApp(full, 'new/A')).toBe(full);
    expect(togglePinnedApp(full, 'p0/A')).not.toContain('p0/A');
    expect(togglePinnedApp([], key)).toEqual([key]);
  });
});
