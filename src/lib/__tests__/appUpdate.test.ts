import { describe, expect, it } from 'vitest';
import { buildAppUpdateCheckResult, compareVersions, shouldAutoCheckAppUpdate, shouldPromptAppUpdate } from '../appUpdate';

describe('compareVersions', () => {
  it('сравнивает семантические версии', () => {
    expect(compareVersions('1.4.5', '1.4.4')).toBe(1);
    expect(compareVersions('1.4.4', '1.4.5')).toBe(-1);
    expect(compareVersions('1.4.4', '1.4.4')).toBe(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('v1.5.0', '1.4.4')).toBe(1);
  });

  it('нераспознанные версии не считаются новее', () => {
    expect(compareVersions('?', '1.4.4')).toBe(0);
    expect(compareVersions('1.5.0', '')).toBe(0);
  });
});

describe('shouldAutoCheckAppUpdate', () => {
  const hour = 60 * 60 * 1000;
  it('проверяет, если ещё не было проверки', () => {
    expect(shouldAutoCheckAppUpdate(0, 1000)).toBe(true);
    expect(shouldAutoCheckAppUpdate(Number.NaN, 1000)).toBe(true);
  });
  it('не проверяет чаще интервала', () => {
    expect(shouldAutoCheckAppUpdate(1000, 1000 + 11 * hour)).toBe(false);
    expect(shouldAutoCheckAppUpdate(1000, 1000 + 12 * hour)).toBe(true);
  });
});

describe('shouldPromptAppUpdate', () => {
  it('показывает один раз на версию', () => {
    expect(shouldPromptAppUpdate('1.4.7', '')).toBe(true);
    expect(shouldPromptAppUpdate('1.4.7', '1.4.7')).toBe(false);
    expect(shouldPromptAppUpdate('1.4.8', '1.4.7')).toBe(true);
    expect(shouldPromptAppUpdate('', '1.4.7')).toBe(false);
  });
});

const releaseFixture = (tag: string, apkName: string | null) => ({
  tag_name: tag,
  html_url: `https://github.com/Habsaec/inpx-book-reader/releases/tag/${tag}`,
  published_at: '2026-09-02T19:03:32Z',
  body: 'Release notes',
  assets: apkName
    ? [
        {
          name: apkName,
          size: 48012712,
          browser_download_url: `https://github.com/Habsaec/inpx-book-reader/releases/download/${tag}/${apkName}`,
        },
      ]
    : [],
});

describe('buildAppUpdateCheckResult', () => {
  it('новее и есть APK-ассет → updateAvailable', () => {
    const r = buildAppUpdateCheckResult(
      releaseFixture('v9.9.9', 'INPX.Book.Reader.9.9.9.apk'),
      '1.4.4',
    );
    expect(r.updateAvailable).toBe(true);
    expect(r.latestVersion).toBe('9.9.9');
    expect(r.apkName).toBe('INPX.Book.Reader.9.9.9.apk');
    expect(r.apkUrl).toContain('/releases/download/');
    expect(r.apkSize).toBe(48012712);
  });

  it('та же версия → updateAvailable=false', () => {
    const r = buildAppUpdateCheckResult(
      releaseFixture('v1.4.4', 'INPX.Book.Reader.1.4.4.apk'),
      '1.4.4',
    );
    expect(r.updateAvailable).toBe(false);
  });

  it('новее, но без APK-ассета → updateAvailable=false', () => {
    const r = buildAppUpdateCheckResult(releaseFixture('v9.9.9', null), '1.4.4');
    expect(r.updateAvailable).toBe(false);
    expect(r.apkUrl).toBe('');
  });

  it('не-APK ассеты игнорируются', () => {
    const release = releaseFixture('v9.9.9', null);
    release.assets = [
      {
        name: 'mapping.txt',
        size: 10,
        browser_download_url: 'https://github.com/x/mapping.txt',
      },
    ];
    const r = buildAppUpdateCheckResult(release, '1.4.4');
    expect(r.updateAvailable).toBe(false);
  });
});
