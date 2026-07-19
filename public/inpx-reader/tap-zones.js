/** Pure helpers for AlReaderX-style 9-zone taps (short/long). */

export const TAP_ZONE_IDS = Object.freeze(['tl', 'tm', 'tr', 'ml', 'mm', 'mr', 'bl', 'bm', 'br']);

export const TAP_ACTIONS = Object.freeze([
  'none',
  'prevPage',
  'nextPage',
  'toggleChrome',
  'toc',
  'search',
  'bookmark',
  'settings',
  'dayNight',
  'tts',
  'prevChapter',
  'nextChapter',
  'goto',
  'autoFlip',
]);

export const TAP_ACTION_LABELS = Object.freeze({
  none: 'Нет',
  prevPage: 'Назад',
  nextPage: 'Вперёд',
  toggleChrome: 'Панель',
  toc: 'Оглавление',
  search: 'Поиск',
  bookmark: 'Закладка',
  settings: 'Настройки',
  dayNight: 'День/ночь',
  tts: 'Озвучка',
  prevChapter: 'Пред. глава',
  nextChapter: 'След. глава',
  goto: 'Перейти…',
  autoFlip: 'Автолист',
});

export function defaultTapZonesShort() {
  return {
    tl: 'prevPage', tm: 'toggleChrome', tr: 'nextPage',
    ml: 'prevPage', mm: 'toggleChrome', mr: 'nextPage',
    bl: 'prevPage', bm: 'toggleChrome', br: 'nextPage',
  };
}

export function defaultTapZonesLong() {
  return {
    tl: 'none', tm: 'none', tr: 'none',
    ml: 'none', mm: 'toc', mr: 'none',
    bl: 'none', bm: 'goto', br: 'none',
  };
}

export function isTapAction(v) {
  return TAP_ACTIONS.includes(v);
}

/** Normalize a stored zones map; fill missing keys from defaults. */
export function normalizeTapZones(raw, fallback) {
  const base = { ...fallback };
  if (!raw || typeof raw !== 'object') return base;
  for (const id of TAP_ZONE_IDS) {
    const v = raw[id];
    if (isTapAction(v)) base[id] = v;
  }
  return base;
}

/**
 * Map normalized coords (0..1) in the foliate-view box to a 3×3 zone id.
 * When verticalWriting is true, axes are swapped (as with vertical-* writing-mode).
 */
export function resolveTapZone9(fx, fy, { verticalWriting = false } = {}) {
  const x = Math.max(0, Math.min(1, Number(fx) || 0));
  const y = Math.max(0, Math.min(1, Number(fy) || 0));
  const a = verticalWriting ? y : x;
  const b = verticalWriting ? x : y;
  const col = a < 1 / 3 ? 0 : a < 2 / 3 ? 1 : 2;
  const row = b < 1 / 3 ? 0 : b < 2 / 3 ? 1 : 2;
  return TAP_ZONE_IDS[row * 3 + col];
}
