import { describe, it, expect } from 'vitest';
import {
  buildMergeInputFromOfflineStore,
  buildCrossDevicePromptLines,
  needsDeferredCrossDevicePromptFromStore,
} from '../../../public/inpx-reader/position-sync.js';
import { fnv1a32Hex } from '../fileDigest';
import {
  isServerCollectionNewer,
  shouldUseServerPosition,
  shouldPushLocalPosition,
  shouldShowCrossDevicePositionPrompt,
  positionsMeaningfullyDiffer,
  serverPositionChangedSinceLastSync,
  normalizeReadingFraction,
  fractionToProgress,
  formatPositionProgressLabel,
  buildCrossDevicePromptDetails,
  CROSS_DEVICE_POSITION_MESSAGE,
  type PositionMergeInput,
} from '../syncMerge';

function posInput(overrides: Partial<PositionMergeInput>): PositionMergeInput {
  return {
    skipPosition: false,
    localFraction: 0,
    localPosition: '',
    localFb2Href: null,
    localPositionRev: '1970-01-01T00:00:00.000Z',
    localHasPaginator: false,
    serverFraction: 0,
    serverProgress: 0,
    serverPosition: '',
    serverFb2Href: null,
    serverPosUpdatedAt: null,
    localServerPositionUpdatedAt: null,
    localServerPositionProgress: -1,
    localServerPositionFraction: -1,
    ...overrides,
  };
}

describe('fileDigest', () => {
  it('computes stable fnv1a digest', () => {
    const buf = new TextEncoder().encode('hello').buffer;
    expect(fnv1a32Hex(buf)).toBe(fnv1a32Hex(buf));
    expect(fnv1a32Hex(buf)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('syncMerge', () => {
  it('detects newer server bookmark revision', () => {
    expect(
      isServerCollectionNewer('2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 2, 2),
    ).toBe(true);
    expect(
      isServerCollectionNewer('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 2, 2),
    ).toBe(false);
  });

  it('pulls a non-empty server collection on first sync without revision metadata', () => {
    expect(
      isServerCollectionNewer('1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z', 2, -1),
    ).toBe(true);
    expect(
      isServerCollectionNewer('1970-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 2, -1),
    ).toBe(false);
  });

  it('does not wipe local bookmarks when empty server is older than local edits', () => {
    expect(
      isServerCollectionNewer('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 0, 3),
    ).toBe(false);
    expect(
      isServerCollectionNewer('2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0, 3),
    ).toBe(true);
  });

  it('uses newer server position by timestamp when server edit is newer', () => {
    const input = posInput({
      localFraction: 0.2,
      localPositionRev: '2026-01-01T00:00:00.000Z',
      serverFraction: 0.45,
      serverProgress: 45,
      serverPosition: 'epubcfi(/6/4!)',
      serverPosUpdatedAt: '2026-01-02T00:00:00.000Z',
      localServerPositionUpdatedAt: '2026-01-01T00:00:00.000Z',
      localServerPositionProgress: 20,
    });
    expect(shouldUseServerPosition(input)).toBe(true);
    expect(shouldPushLocalPosition(input, 20, true)).toBe(false);
  });

  it('keeps newer local backward scroll over higher server fraction', () => {
    const input = posInput({
      localFraction: 0.4,
      localPositionRev: '2026-07-12T11:00:00.000Z',
      serverFraction: 0.94,
      serverProgress: 94,
      serverPosUpdatedAt: '2026-07-12T10:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-12T10:00:00.000Z',
      localServerPositionProgress: 94,
    });
    expect(shouldUseServerPosition(input)).toBe(false);
    expect(shouldPushLocalPosition(input, 40, true)).toBe(true);
  });

  it('pushes local position when local timestamp is newer', () => {
    const input = posInput({
      localFraction: 0.6,
      localPositionRev: '2026-01-03T00:00:00.000Z',
      localHasPaginator: true,
      serverFraction: 0.2,
      serverProgress: 20,
      serverPosUpdatedAt: '2026-01-01T00:00:00.000Z',
      localServerPositionUpdatedAt: '2026-01-01T00:00:00.000Z',
      localServerPositionProgress: 20,
    });
    expect(shouldUseServerPosition(input)).toBe(false);
    expect(shouldPushLocalPosition(input, 60, true)).toBe(true);
  });

  it('uses newer server position at same fraction including paginator', () => {
    const input = posInput({
      localFraction: 0.42,
      localPositionRev: '2026-01-01T00:00:00.000Z',
      localHasPaginator: true,
      serverFraction: 0.42,
      serverProgress: 42,
      serverPosition: 'app:ch2:p15',
      serverPosUpdatedAt: '2026-01-03T00:00:00.000Z',
      localServerPositionUpdatedAt: '2026-01-02T00:00:00.000Z',
      localServerPositionProgress: 42,
    });
    expect(shouldUseServerPosition(input)).toBe(true);
    expect(shouldPushLocalPosition(input, 42, true)).toBe(false);
  });

  it('pushes local paginator update when local edit is newer', () => {
    const input = posInput({
      localFraction: 0.42,
      localPositionRev: '2026-01-04T00:00:00.000Z',
      localHasPaginator: true,
      serverFraction: 0.42,
      serverProgress: 42,
      serverPosition: 'app:ch2:p14',
      serverPosUpdatedAt: '2026-01-03T00:00:00.000Z',
      localServerPositionUpdatedAt: '2026-01-03T00:00:00.000Z',
      localServerPositionProgress: 42,
    });
    expect(shouldUseServerPosition(input)).toBe(false);
    expect(shouldPushLocalPosition(input, 42, true)).toBe(true);
  });

  it('prefers newer server edit by timestamp even when local fraction is higher', () => {
    const input = posInput({
      localFraction: 0.9,
      localPositionRev: '2026-07-11T10:00:00.000Z',
      serverFraction: 0.85,
      serverProgress: 85,
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-11T08:00:00.000Z',
      localServerPositionProgress: 62,
    });
    expect(shouldUseServerPosition(input)).toBe(true);
    expect(shouldPushLocalPosition(input, 90, true)).toBe(false);
  });

  it('pushes local edit when local timestamp is newer even if server changed since last sync', () => {
    const input = posInput({
      localFraction: 0.62,
      localPositionRev: '2026-07-12T15:00:00.000Z',
      serverFraction: 0.85,
      serverProgress: 85,
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-11T08:00:00.000Z',
      localServerPositionProgress: 62,
    });
    expect(serverPositionChangedSinceLastSync(input)).toBe(true);
    expect(shouldUseServerPosition(input)).toBe(false);
    expect(shouldPushLocalPosition(input, 62, true)).toBe(true);
  });

  it('pulls newer server backward read on web', () => {
    const input = posInput({
      localFraction: 0.94,
      localPositionRev: '2026-07-12T10:00:00.000Z',
      serverFraction: 0.4,
      serverProgress: 40,
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-12T10:00:00.000Z',
      localServerPositionProgress: 94,
      localServerPositionFraction: 0.94,
    });
    expect(shouldUseServerPosition(input)).toBe(true);
    expect(shouldPushLocalPosition(input, 94, true)).toBe(false);
  });

  it('pulls newer precise fraction even when coarse fb2Href matches', () => {
    const input = posInput({
      localFraction: 0.94,
      localFb2Href: '9#2',
      localPositionRev: '2026-07-11T10:00:00.000Z',
      serverFraction: 0.84,
      serverProgress: 84,
      serverFb2Href: '9#2',
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-11T08:00:00.000Z',
      localServerPositionProgress: 94,
      localServerPositionFraction: 0.84,
    });
    expect(shouldUseServerPosition(input)).toBe(true);
    expect(serverPositionChangedSinceLastSync(input)).toBe(true);
  });

  it('does not pull unchanged server snapshot while local edit is pending push', () => {
    const input = posInput({
      localFraction: 0.4,
      localPositionRev: '2026-07-12T11:00:00.000Z',
      serverFraction: 0.94,
      serverProgress: 94,
      serverPosUpdatedAt: '2026-07-12T10:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-12T10:00:00.000Z',
      localServerPositionProgress: 94,
    });
    expect(serverPositionChangedSinceLastSync(input)).toBe(false);
    expect(shouldUseServerPosition(input)).toBe(false);
    expect(shouldPushLocalPosition(input, 40, true)).toBe(true);
  });

  it('does not pull a server rev the user declined ("stay here")', () => {
    const input = posInput({
      localFraction: 0.2,
      localFb2Href: '3#1',
      localPositionRev: '2026-07-11T10:00:00.000Z',
      serverFraction: 0.85,
      serverProgress: 85,
      serverFb2Href: '9#2',
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      dismissedServerPositionUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionProgress: 85,
    });
    expect(shouldUseServerPosition(input)).toBe(false);
    expect(shouldShowCrossDevicePositionPrompt(input)).toBe(false);
    expect(shouldPushLocalPosition(input, 20, true)).toBe(false);
  });

  it('normalizes fraction precision', () => {
    expect(normalizeReadingFraction(0.123456789)).toBe(0.123457);
    expect(fractionToProgress(0.5)).toBe(50);
  });
});

describe('cross-device position prompt', () => {
  it('uses the required Russian prompt copy', () => {
    expect(CROSS_DEVICE_POSITION_MESSAGE).toBe(
      'Ранее вы уже читали эту книгу на другом устройстве. Перейти на сохранённую позицию?',
    );
  });

  it('prompts when server is newer and position differs', () => {
    const input = posInput({
      localFraction: 0.2,
      localPositionRev: '2026-07-11T10:00:00.000Z',
      serverFraction: 0.85,
      serverProgress: 85,
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-11T08:00:00.000Z',
      localServerPositionProgress: 20,
    });
    expect(shouldShowCrossDevicePositionPrompt(input)).toBe(true);
  });

  it('prompts when local has no position but server does', () => {
    const input = posInput({
      localFraction: 0,
      localPositionRev: '1970-01-01T00:00:00.000Z',
      serverFraction: 0.42,
      serverProgress: 42,
      serverFb2Href: '5#1',
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
    });
    expect(shouldShowCrossDevicePositionPrompt(input)).toBe(true);
  });

  it('prompts when precise fractions differ despite matching coarse fb2Href', () => {
    const input = posInput({
      localFraction: 0.94,
      localFb2Href: '9#2',
      localPositionRev: '2026-07-11T10:00:00.000Z',
      serverFraction: 0.84,
      serverProgress: 84,
      serverFb2Href: '9#2',
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-11T08:00:00.000Z',
      localServerPositionProgress: 94,
    });
    expect(shouldShowCrossDevicePositionPrompt(input)).toBe(true);
    expect(positionsMeaningfullyDiffer(0.94, '', '9#2', 0.84, '', '9#2')).toBe(true);
  });

  it('compares exact text anchors before approximate fractions', () => {
    expect(
      positionsMeaningfullyDiffer(0.94, '', '9#2', 0.84, '', '9#8', 80489, 80489, 9, 9),
    ).toBe(false);
    expect(
      positionsMeaningfullyDiffer(0.94, '', '9#2', 0.94, '', '9#2', 80489, 80520, 9, 9),
    ).toBe(true);
  });

  it('does not prompt for already dismissed server snapshot', () => {
    const input = posInput({
      localFraction: 0.2,
      localPositionRev: '2026-07-11T10:00:00.000Z',
      serverFraction: 0.85,
      serverProgress: 85,
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      dismissedServerPositionUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-11T08:00:00.000Z',
      localServerPositionProgress: 20,
    });
    expect(shouldShowCrossDevicePositionPrompt(input)).toBe(false);
  });

  it('prompts when local is newer but positions differ (stay-or-go choice)', () => {
    const input = posInput({
      localFraction: 0.9,
      localPositionRev: '2026-07-12T16:00:00.000Z',
      serverFraction: 0.85,
      serverProgress: 85,
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionProgress: 85,
    });
    expect(shouldShowCrossDevicePositionPrompt(input)).toBe(true);
    expect(shouldUseServerPosition(input)).toBe(false);
  });

  it('does not prompt when positions match within tolerance', () => {
    const input = posInput({
      localFraction: 0.42,
      localPositionRev: '2026-07-11T10:00:00.000Z',
      serverFraction: 0.4200001,
      serverProgress: 42,
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-11T08:00:00.000Z',
      localServerPositionProgress: 42,
    });
    expect(shouldShowCrossDevicePositionPrompt(input)).toBe(false);
  });

  it('prompts when phone read ahead locally while server stayed behind on another device', () => {
    const input = posInput({
      localFraction: 0.85,
      localFb2Href: '10#1',
      localPositionRev: '2026-07-12T18:00:00.000Z',
      serverFraction: 0.08,
      serverProgress: 8,
      serverFb2Href: '8#1',
      serverPosUpdatedAt: '2026-07-12T10:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-12T10:00:00.000Z',
      localServerPositionProgress: 8,
    });
    expect(shouldShowCrossDevicePositionPrompt(input)).toBe(true);
    expect(shouldUseServerPosition(input)).toBe(false);
  });

  it('prompts when local clock is ahead but server changed on another device', () => {
    const input = posInput({
      localFraction: 0.62,
      localPositionRev: '2026-07-12T15:00:00.000Z',
      serverFraction: 0.85,
      serverProgress: 85,
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-11T08:00:00.000Z',
      localServerPositionProgress: 62,
    });
    expect(shouldShowCrossDevicePositionPrompt(input)).toBe(true);
  });

  it('prompts after metadata pre-sync even when last-known server rev matches', () => {
    const input = posInput({
      localFraction: 0.62,
      localPositionRev: '2026-07-12T15:00:00.000Z',
      serverFraction: 0.85,
      serverProgress: 85,
      serverPosUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionUpdatedAt: '2026-07-12T14:00:00.000Z',
      localServerPositionProgress: 85,
    });
    expect(shouldShowCrossDevicePositionPrompt(input)).toBe(true);
    expect(shouldUseServerPosition(input)).toBe(false);
  });

  it('still defers iframe prompt after snapshot write sets pendingCrossDevicePrompt', () => {
    const store = {
      pendingCrossDevicePrompt: true,
      progress: 20,
      fraction: 0.2,
      fb2Href: '8#1',
      positionChangedAt: '2026-07-11T10:00:00.000Z',
      serverPositionUpdatedAt: '2026-07-12T14:00:00.000Z',
      serverPositionProgress: 85,
      serverPositionFraction: 0.85,
      serverFb2Href: '12#1',
    };
    expect(shouldShowCrossDevicePositionPrompt(buildMergeInputFromOfflineStore(store))).toBe(false);
    expect(needsDeferredCrossDevicePromptFromStore(store)).toBe(true);
  });

  it('skips deferred prompt when user already dismissed this server snapshot', () => {
    const store = {
      pendingCrossDevicePrompt: true,
      progress: 20,
      fraction: 0.2,
      serverPositionUpdatedAt: '2026-07-12T14:00:00.000Z',
      dismissedServerPositionUpdatedAt: '2026-07-12T14:00:00.000Z',
      serverPositionProgress: 85,
      serverPositionFraction: 0.85,
    };
    expect(needsDeferredCrossDevicePromptFromStore(store)).toBe(false);
  });

  it('builds readable prompt lines with progress and chapter', () => {
    const input = posInput({
      localFraction: 0.12,
      serverFraction: 0.47,
      serverProgress: 47,
    });
    const details = buildCrossDevicePromptDetails(
      input,
      { fb2Href: '3#2' },
      { fb2Href: '8#1', paginatorPage: 120, paginatorPages: 300 },
    );
    expect(details.message).toBe(CROSS_DEVICE_POSITION_MESSAGE);
    expect(details.localLine).toBe('12% · глава 3#2');
    expect(details.serverLine).toBe('47% · стр. 120 из 300');
    expect(formatPositionProgressLabel(0.5, 50)).toBe('50%');
    expect(formatPositionProgressLabel(0.84, 94)).toBe('84%');
  });

  it('estimates server chapter from TOC when fb2Href is missing', () => {
    const toc = ['1', '5', '8#1', '9#1', '9#2', '9#3', '10'];
    const lines = buildCrossDevicePromptLines(
      { fraction: 0.851351, fb2Href: '9#3' },
      { fraction: 0.945521, progress: 95 },
      toc,
    );
    expect(lines.localLine).toBe('85% · глава 9#3');
    expect(lines.serverLine).toBe('95% · глава 10');
  });

  it('estimates chapter by text-volume so it matches the percent (not section index)', () => {
    const toc = [
      { href: '1', label: 'Пролог', startFraction: 0.0 },
      { href: '2', label: 'Часть I', startFraction: 0.016 },
      { href: '6', label: 'Часть V', startFraction: 0.649 },
      { href: '7', label: 'Часть VI. Недолго музыка играла', startFraction: 0.809 },
      { href: '8', label: 'Эпилог', startFraction: 0.971 },
      { href: '9', label: 'Приложение', startFraction: 1.0 },
    ];
    const lines = buildCrossDevicePromptLines(
      { fraction: 0.945521, position: 'epubcfi(/6/20!/4/2)' },
      { fraction: 0.945521, fb2Href: null },
      toc,
    );
    expect(lines.localLine).toBe('95% · Часть VI. Недолго музыка играла');
    expect(lines.serverLine).toBe('95% · Часть VI. Недолго музыка играла');
  });

  it('uses the exact text anchor for the displayed chapter', () => {
    const toc = [
      { href: '9', label: 'Часть II', startFraction: 0.8, sectionIndex: 9, textOffset: 0 },
      { href: '9#4', label: 'Глава 5', startFraction: 0.86, sectionIndex: 9, textOffset: 4000 },
      { href: '9#8', label: 'Глава 9', startFraction: 0.93, sectionIndex: 9, textOffset: 8000 },
    ];
    const lines = buildCrossDevicePromptLines(
      { fraction: 0.94, sectionIndex: 9, textOffset: 4500 },
      { fraction: 0.94, sectionIndex: 9, textOffset: 4500 },
      toc,
    );
    expect(lines.localLine).toBe('94% · Глава 5');
    expect(lines.serverLine).toBe('94% · Глава 5');
  });

  it('recomputes whole-book percent from exact anchors when stored fraction is stale', () => {
    const toc = [{
      href: '9#4',
      label: 'Глава 5',
      sectionIndex: 9,
      textOffset: 4000,
      sectionStartFraction: 0.8,
      sectionFraction: 0.2,
      sectionTextLength: 10000,
    }];
    const anchor = {
      fraction: 0.87,
      fb2Href: '9#4',
      sectionIndex: 9,
      textOffset: 7500,
      textSectionLength: 10000,
    };
    const lines = buildCrossDevicePromptLines(anchor, anchor, toc);
    expect(lines.localLine).toBe('95% · Глава 5');
    expect(lines.serverLine).toBe('95% · Глава 5');
  });

  it('shows real chapter titles from labeled TOC (section index != chapter number)', () => {
    const toc = [
      { href: '2', label: 'Часть I' },
      { href: '9', label: 'Глава 10. Место под солнцем' },
      { href: '13', label: 'Часть II' },
      { href: '17', label: 'Глава 4. И даже не Фили' },
    ];
    const lines = buildCrossDevicePromptLines(
      { fraction: 0.9508, fb2Href: '9#9' },
      { fraction: 0.9455, fb2Href: '17#2' },
      toc,
    );
    expect(lines.localLine).toBe('95% · Глава 10. Место под солнцем');
    expect(lines.serverLine).toBe('95% · Глава 4. И даже не Фили');
  });
});
