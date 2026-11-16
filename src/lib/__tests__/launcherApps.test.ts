import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}), Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove: async () => {} }) } }));

import {
  arrangeLauncherApps,
  filterLauncherApps,
  launcherAppKey,
  normalizeAppKeys,
  pushRecentApp,
  toggleAppKey,
} from '../launcherHome';

const app = (label: string, pkg: string, user?: number) => ({ label, packageName: pkg, activityName: 'Main', user });

describe('launcher apps screen', () => {
  const apps = [app('Chrome', 'chrome'), app('Файловый менеджер +', 'files'), app('Gmail', 'gmail'), app('Work Chrome', 'chrome', 10)];

  it('keys an app by package/activity and by profile', () => {
    expect(launcherAppKey(apps[0])).toBe('chrome/Main');
    expect(launcherAppKey(apps[3])).toBe('chrome/Main#10');
  });

  it('keeps valid unique keys up to the limit', () => {
    expect(normalizeAppKeys(['a/b', 'a/b', 'bad', 5, 'c/d', 'e/f'], 2)).toEqual(['a/b', 'c/d']);
    expect(normalizeAppKeys('nope', 5)).toEqual([]);
  });

  it('puts the opened app first and keeps five', () => {
    expect(pushRecentApp(['a/1', 'b/1'], 'b/1')).toEqual(['b/1', 'a/1']);
    expect(pushRecentApp(['1/a', '2/a', '3/a', '4/a', '5/a'], '6/a')).toEqual(['6/a', '1/a', '2/a', '3/a', '4/a']);
    expect(toggleAppKey(['a/1'], 'a/1')).toEqual([]);
    expect(toggleAppKey(['a/1'], 'b/1')).toEqual(['a/1', 'b/1']);
  });

  it('finds apps by every word, any case', () => {
    expect(filterLauncherApps(apps, 'менеджер ФАЙЛ').map((a) => a.packageName)).toEqual(['files']);
    expect(filterLauncherApps(apps, 'chrome')).toHaveLength(2);
    expect(filterLauncherApps(apps, '  ')).toBe(apps);
  });

  it('keeps hidden apps apart (the «Скрытые» folder) and lists recent ones first', () => {
    const opts = { hidden: ['gmail/Main'], recent: ['gmail/Main', 'files/Main', 'gone/Main', 'chrome/Main'], query: '' };
    const view = arrangeLauncherApps(apps, opts);
    expect(view.all.map((a) => a.label)).toEqual(['Chrome', 'Файловый менеджер +', 'Work Chrome']);
    expect(view.recent.map((a) => a.label)).toEqual(['Файловый менеджер +', 'Chrome']);
    expect(view.hidden.map((a) => a.label)).toEqual(['Gmail']);
    // A search looks through each list separately: a hidden app is found inside its folder only.
    const found = arrangeLauncherApps(apps, { ...opts, query: 'gmail' });
    expect(found.all).toEqual([]);
    expect(found.hidden.map((a) => a.label)).toEqual(['Gmail']);
    expect(found.recent).toEqual([]);
  });
});
