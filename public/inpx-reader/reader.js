import '/foliate/view.js?v=swipe-4';
import { createTOCView } from '/foliate/ui/tree.js?v=fb2seek4';
import { Overlayer } from '/foliate/overlayer.js?v=fb2seek4';
import {
  FootnoteHandler,
  footnoteTargetFragmentFromHref,
  shouldTrySpineFootnoteClone,
} from '/foliate/footnotes.js?v=fb2seek4';
import {
  normalizeFraction,
  fractionToProgress,
  progressToFraction,
  resolveFb2Href,
  positionFromLocation as sharedPositionFromLocation,
} from '/inpx-reader/reader-shared/reader-position.js';
import { createSuppressionCounter } from '/inpx-reader/reader-shared/suppression-counter.js';
import { enrichAndroidPositionPayload } from '/inpx-reader/reader-shared/android-position.js';
import { isStaleExplodedFb2Anchor, isTextAnchorLandingVerified } from '/inpx-reader/reader-shared/text-anchor.js';
import {
  TAP_ZONE_IDS,
  TAP_ACTION_LABELS,
  defaultTapZonesShort,
  defaultTapZonesLong,
  normalizeTapZones,
  resolveTapZone9,
} from '/inpx-reader/tap-zones.js';
import { isMalformedLocationCfi } from '/foliate/epubcfi.js';

(function () {
  'use strict';

  const _nativeFetch = window.fetch.bind(window);
  function readerCsrfToken() {
    const m = document.querySelector('meta[name="csrf-token"]');
    const t = m && m.getAttribute('content');
    return t && String(t).trim() ? String(t).trim() : '';
  }
  window.fetch = function readerPatchedFetch(input, init) {
    const opts = init === undefined ? {} : { ...init };
    const method = String(opts.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const token = readerCsrfToken();
      if (token) {
        const headers = new Headers(opts.headers);
        if (!headers.has('X-CSRF-Token')) {
          headers.set('X-CSRF-Token', token);
        }
        opts.headers = headers;
      }
    }
    return _nativeFetch(input, opts);
  };

  let _readerI18n = { locale: 'ru', strings: {} };
  try {
    const el = document.getElementById('ui-i18n-json');
    if (el && el.textContent && el.textContent.trim() !== '{"locale":"ru","strings":{}}') {
      _readerI18n = JSON.parse(el.textContent);
    }
  } catch { /* */ }
  async function ensureReaderI18n() {
    if (_readerI18n.strings && Object.keys(_readerI18n.strings).length > 0) return;
    try {
      const r = await fetch('/inpx-reader/reader-i18n-ru.json');
      if (r.ok) _readerI18n = await r.json();
    } catch { /* */ }
  }
  function rt(key) {
    const s = _readerI18n.strings;
    if (!s || !Object.prototype.hasOwnProperty.call(s, key)) return key;
    const v = s[key];
    if (v === undefined || v === null) return key;
    return v;
  }
  function rtp(key, vars = {}) {
    let str = rt(key);
    for (const [k, v] of Object.entries(vars)) str = str.split(`{{${k}}}`).join(String(v));
    return str;
  }
  function rLocale() {
    return _readerI18n.locale === 'en' ? 'en' : 'ru';
  }
  function rPlural(type, n) {
    const lang = rLocale();
    const v = Math.floor(Math.abs(Number(n) || 0));
    if (lang === 'en') {
      return rt(`plural.${type}.${v === 1 ? 'one' : 'other'}`);
    }
    const m10 = v % 10;
    const m100 = v % 100;
    let suf;
    if (m100 >= 11 && m100 <= 14) suf = 'many';
    else if (m10 === 1) suf = 'one';
    else if (m10 >= 2 && m10 <= 4) suf = 'few';
    else suf = 'many';
    return rt(`plural.${type}.${suf}`);
  }

  /* ===== Constants & DOM refs ===== */
  const bookId = window.__READER_BOOK_ID;
  const bookExt = window.__READER_BOOK_EXT;
  let effectiveBookExt = bookExt;
  const READER_LITE = Boolean(window.__READER_LITE);
  const SETTINGS_STORAGE_KEY = READER_LITE ? 'reader-settings-lite' : 'reader-settings';

  function readerBookPagePath() {
    if (window.__READER_BOOK_PAGE_PATH) return window.__READER_BOOK_PAGE_PATH;
    return globalThis.bookPagePath ? globalThis.bookPagePath(bookId) : `/book/${encodeURIComponent(bookId)}`;
  }
  const $ = (s) => document.getElementById(s);
  const readerBody = $('reader-body');
  const toolbarChapter = $('toolbar-chapter');
  const progressText = $('progress-text');
  const panelKickerEl = $('panel-kicker');
  const panelTitleEl = $('panel-title');
  const seekBar = $('ft-seek');
  const pctLabel = $('ft-pct');
  const ftChapter = $('ft-chapter');
  const tocSearchInput = $('toc-search-input');
  const tocPrevBtn = $('toc-prev-chapter');
  const tocNextBtn = $('toc-next-chapter');
  const panelOverlay = $('panel-overlay');
  const panelTabs = document.querySelectorAll('.panel-tab');
  const panelBodies = document.querySelectorAll('[data-panel-tab]');
  const toastEl = $('reader-toast');
  const btnTts = $('btn-tts');
  const btnTtsDock = $('btn-tts-dock');
  const btnTtsStop = $('btn-tts-stop');
  const btnTtsDockStop = $('btn-tts-dock-stop');
  const ttsDockEl = $('reader-tts-dock');
  const bookPagesEl = $('reader-book-pages');
  const bookPageLeft = $('book-page-left');
  const bookPageRight = $('book-page-right');
  const statusStripEl = $('reader-status-strip');
  const rssChapter = $('rss-chapter');
  const rssPage = $('rss-page');
  const rssChapterLeft = $('rss-chapter-left');
  const rssPct = $('rss-pct');
  const rssClock = $('rss-clock');
  const autoFlipHud = $('reader-autoflip-hud');
  const gotoOverlay = $('reader-goto');

  const isTouch = window.matchMedia('(pointer: coarse)');

  /** Last paginator screen estimate for status / goto. */
  let lastPageInfo = { current: 0, total: 0, chapterLeft: 0, chapterLabel: '' };
  let statusClockTimer = null;
  let lastPageHapticAt = 0;
  let autoFlipTimer = null;
  let autoFlipArmed = false;
  let tapEditMode = 'short';
  let tapEditSelected = 'mm';

  /**
   * ===== Screen Wake Lock =====
   * Экран не гаснет во время чтения (Chrome/Android, Safari 16.4+, нужен HTTPS).
   * Во время TTS удержание экрана ОБЯЗАТЕЛЬНО: на Android Chrome останавливает
   * SpeechSynthesis на уровне платформы, как только у страницы пропадает видимое окно
   * (TtsPlatformImpl в Chromium игнорирует речь фоновых/невидимых вкладок) — никакой
   * аудио-keepalive или Media Session это не обходят. Поэтому пока идёт озвучка,
   * держим wake lock, чтобы экран не гас сам по таймауту бездействия. Против ручной
   * блокировки экрана (кнопка питания) Wake Lock API бессилен — это ограничение ОС/Chrome.
   */
  let wakeLock = null;
  /** false после __READER_TEARDOWN__ — иначе release() снова запрашивает lock у уже мёртвой сессии. */
  let readerSessionAlive = true;
  async function acquireReaderWakeLock() {
    if (!readerSessionAlive) return;
    if (!('wakeLock' in navigator)) return;
    if (wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        if (readerSessionAlive && document.visibilityState === 'visible') {
          void acquireReaderWakeLock();
        }
      });
    } catch {
      /* Нет активного жеста пользователя, запрет ОС (энергосбережение) или API недоступен */
    }
  }
  function releaseReaderWakeLock() {
    try {
      wakeLock?.release();
    } catch { /* */ }
    wakeLock = null;
  }
  function clearTtsBackgroundMaintain() {
    if (ttsBgMaintainTimer != null) {
      clearInterval(ttsBgMaintainTimer);
      ttsBgMaintainTimer = null;
    }
  }

  /**
   * Пока страница скрыта (ручная блокировка экрана / переход в другое приложение — Wake Lock
   * это не предотвращает), синтез речи на Android всё равно не работает. Раньше здесь
   * форсировался переход к следующему сегменту по таймауту простоя — из-за этого отменённая
   * платформой фраза мгновенно дёргала onend/onerror и цепочка проматывала книгу вперёд
   * (иногда на главы), пока не находилась в невидимой вкладке. Теперь просто поддерживаем
   * keepalive/Media Session и ждём возврата видимости — сегмент, прерванный платформой,
   * не пропускается (guard на document.visibilityState в onend/onerror), а повторяется.
   */
  function ttsCanAdvanceAfterUtterance() {
    if (window.__INPX_USE_NATIVE_TTS) return true;
    return document.visibilityState !== 'hidden';
  }

  function maintainTtsInBackground() {
    clearTtsBackgroundMaintain();
    if (!ttsChainActive || ttsPausedByUser) return;
    const tick = () => {
      if (!ttsChainActive || ttsPausedByUser || document.visibilityState === 'visible') {
        clearTtsBackgroundMaintain();
        return;
      }
      void startTtsKeepalivePlayback();
      syncTtsMediaSessionPlayback();
    };
    tick();
    ttsBgMaintainTimer = setInterval(tick, 2000);
  }

  /** Возврат из фона/разблокировка: если платформа прервала фразу без реальной озвучки — повторяем её, а не пропускаем. */
  function resumeTtsAfterHidden() {
    if (!ttsChainActive || ttsPausedByUser) return;
    if (speechSynthesis.speaking || speechSynthesis.pending) return;
    try { ttsKickSpeak?.(); } catch (e) { console.warn('[reader TTS resume]', e); }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      clearTtsBackgroundMaintain();
      void acquireReaderWakeLock();
      if (ttsChainActive && !ttsPausedByUser) {
        void startTtsKeepalivePlayback();
        try { speechSynthesis.resume(); } catch { /* */ }
        resumeTtsAfterHidden();
      }
    } else if (ttsChainActive && !ttsPausedByUser) {
      maintainTtsInBackground();
    } else {
      releaseReaderWakeLock();
    }
  });
  window.addEventListener('pagehide', () => {
    if (ttsChainActive && !ttsPausedByUser) {
      void startTtsKeepalivePlayback();
      maintainTtsInBackground();
    } else {
      releaseReaderWakeLock();
    }
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void acquireReaderWakeLock();
  });
  /* Панель/тулбар вне iframe — первый тап даёт жест для request() на мобильных. */
  document.body.addEventListener(
    'touchstart',
    () => {
      void acquireReaderWakeLock();
    },
    { capture: true, passive: true }
  );

  let view = null;
  /** Цепочка озвучивания (Web Speech API); пауза только по кнопке. */
  let ttsChainActive = false;
  let ttsPausedByUser = false;
  /** Не вызывать stopReaderTts при load iframe — переходим к следующей секции во время TTS. */
  let ttsAdvancingSection = false;
  /** Долгое нажатие на кнопку TTS — стоп (сенсорные устройства). */
  let ttsStopLongPressTimer = null;
  let ttsStopLongPressConsumeClick = false;
  let ttsStopLongPressPt = null;
  const TTS_STOP_LONG_PRESS_MS = 550;
  const TTS_STOP_LONG_PRESS_SLOP_PX = 14;
  /** Инвалидирует callbacks utterance при пропуске / стопе */
  let ttsSpeakToken = 0;
  const ttsNav = { skipBack() {}, skipForward() {} };
  let ttsKeepaliveUrl = null;
  let ttsKeepaliveEl = null;
  let ttsMediaSessionHandlers = false;
  let ttsNativeMediaActionBound = false;
  let ttsCoverBase64Cache = '';
  let ttsCoverArtworkUrl = '';
  let ttsBgMaintainTimer = null;
  let ttsKickSpeak = null;
  let lastTtsSpeechAt = 0;
  let tocData = [];
  let rawToc = null;
  let tocView = null;
  const calibreAnnotationsByValue = new Map();
  let bookmarksData = [];
  let annotationsData = [];
  let annotationNavIndex = 0;
  let readerSessionStartedAt = 0;
  let chapterSessionStartedAt = 0;
  let chapterStartFraction = 0;
  let lastChapterKey = '';
  let searchSeq = 0;
  let searchDebounce = null;
  const docIndexMap = new WeakMap();
  let activeSel = null;
  let chromeVisible = false;
  let chromeTimer = null;
  let activePanelTab = 'toc';

  /**
   * Едва слышимый зацикленный WAV (Blob URL), чтобы ОС считала вкладку «воспроизводящей медиа» —
   * помогает пережить выключение экрана (Chrome/Android; на iOS не гарантировано).
   * Важно: сэмплы НЕ должны быть полной цифровой тишиной (все нули) — Chrome/Android определяют
   * «слышимость» по реальному уровню сигнала (RMS) и не выдают вкладке медиа-сессию/foreground-статус
   * для абсолютно пустого потока, из-за чего страница всё равно замораживается при блокировке экрана.
   * Поэтому пишем очень тихий низкочастотный тон (почти не воспроизводится динамиком телефона).
   */
  function createSilentWavKeepaliveUrl() {
    const sampleRate = 8000;
    const numSamples = Math.floor(sampleRate * 1);
    const dataSize = numSamples * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const v = new DataView(buffer);
    let o = 0;
    const wstr = (s) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o++, s.charCodeAt(i));
    };
    wstr('RIFF');
    v.setUint32(o, 36 + dataSize, true);
    o += 4;
    wstr('WAVE');
    wstr('fmt ');
    v.setUint32(o, 16, true);
    o += 4;
    v.setUint16(o, 1, true);
    o += 2;
    v.setUint16(o, 1, true);
    o += 2;
    v.setUint32(o, sampleRate, true);
    o += 4;
    v.setUint32(o, sampleRate * 2, true);
    o += 4;
    v.setUint16(o, 2, true);
    o += 2;
    v.setUint16(o, 16, true);
    o += 2;
    wstr('data');
    v.setUint32(o, dataSize, true);
    o += 4;
    /** ~-36 dBFS, 30 Гц: заметно выше типичного порога «тишины» у браузера, но ниже слышимого баса большинства динамиков. */
    const amplitude = 500;
    const freqHz = 30;
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.round(amplitude * Math.sin((2 * Math.PI * freqHz * i) / sampleRate));
      v.setInt16(o, sample, true);
      o += 2;
    }
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  function ensureTtsKeepaliveEl() {
    if (ttsKeepaliveEl) return ttsKeepaliveEl;
    if (!ttsKeepaliveUrl) ttsKeepaliveUrl = createSilentWavKeepaliveUrl();
    const a = document.createElement('audio');
    a.setAttribute('playsinline', '');
    a.setAttribute('webkit-playsinline', 'true');
    a.playsInline = true;
    a.setAttribute('aria-hidden', 'true');
    a.loop = true;
    a.volume = 0.15;
    a.src = ttsKeepaliveUrl;
    a.preload = 'auto';
    document.body.appendChild(a);
    ttsKeepaliveEl = a;
    return ttsKeepaliveEl;
  }

  function pauseTtsKeepalive() {
    try {
      ttsKeepaliveEl?.pause();
    } catch { /* */ }
  }

  async function startTtsKeepalivePlayback() {
    if (!ttsChainActive || ttsPausedByUser) return;
    try {
      const a = ensureTtsKeepaliveEl();
      await a.play();
    } catch (e) {
      console.warn('[reader TTS keepalive]', e);
    }
  }

  function syncTtsKeepaliveWithSpeech() {
    if (!ttsChainActive || ttsPausedByUser) pauseTtsKeepalive();
    else void startTtsKeepalivePlayback();
  }

  function ttsMediaTitleArtist() {
    const title =
      document.querySelector('.tb-title')?.textContent?.trim()
      || String(window.__READER_BOOK_TITLE || '').trim()
      || document.title
      || 'Озвучка';
    const artist =
      document.getElementById('toc-book-author')?.textContent?.trim()
      || document.querySelector('.tb-kicker')?.textContent?.trim()
      || String(window.__READER_BOOK_AUTHOR || '').trim()
      || '';
    return { title, artist };
  }

  async function ensureTtsCoverForMedia() {
    if (ttsCoverBase64Cache) return ttsCoverBase64Cache;
    const toBase64 = async (blob) => {
      if (!blob) return '';
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    };
    try {
      const img = document.getElementById('toc-cover');
      if (img?.src) {
        const res = await fetch(img.src);
        if (res.ok) {
          const blob = await res.blob();
          ttsCoverArtworkUrl = img.src;
          ttsCoverBase64Cache = await toBase64(blob);
          if (ttsCoverBase64Cache) return ttsCoverBase64Cache;
        }
      }
    } catch { /* */ }
    try {
      const blob = await view?.book?.getCover?.();
      if (blob) {
        ttsCoverArtworkUrl = URL.createObjectURL(blob);
        ttsCoverBase64Cache = await toBase64(blob);
      }
    } catch { /* */ }
    return ttsCoverBase64Cache;
  }

  function syncTtsMediaSessionPlayback() {
    if ('mediaSession' in navigator) {
      try {
        if (!ttsChainActive) {
          navigator.mediaSession.playbackState = 'none';
        } else {
          navigator.mediaSession.playbackState = ttsPausedByUser ? 'paused' : 'playing';
        }
      } catch { /* */ }
    }
    void syncNativeTtsMediaSession();
  }

  function syncTtsMediaMetadata() {
    if (!ttsChainActive) return;
    const { title, artist } = ttsMediaTitleArtist();
    if ('mediaSession' in navigator) {
      try {
        const meta = {
          title: title || 'Озвучка',
          artist: artist || '',
        };
        if (ttsCoverArtworkUrl) {
          meta.artwork = [{ src: ttsCoverArtworkUrl, sizes: '512x512', type: 'image/jpeg' }];
        }
        navigator.mediaSession.metadata = new MediaMetadata(meta);
      } catch { /* */ }
    }
    void syncNativeTtsMediaSession();
  }

  async function syncNativeTtsMediaSession() {
    const native = window.__INPX_NATIVE;
    if (!native?.updateTtsMediaSession) return;
    const { title, artist } = ttsMediaTitleArtist();
    let coverB64 = '';
    let coverUrl = '';
    let auth = '';
    if (ttsChainActive) {
      coverB64 = await ensureTtsCoverForMedia();
      if (!coverB64) {
        coverUrl = String(window.__READER_COVER_URL || '').trim();
        auth = String(window.__READER_COVER_AUTH || '').trim();
      }
    }
    // Re-read after await — user may have stopped TTS meanwhile.
    const payload = {
      title: title || 'Озвучка',
      artist: artist || '',
      playing: ttsChainActive && !ttsPausedByUser,
      active: ttsChainActive,
    };
    if (ttsChainActive && coverB64) payload.coverBase64 = coverB64;
    if (ttsChainActive && !coverB64 && coverUrl) {
      payload.coverUrl = coverUrl;
      if (auth) payload.authHeader = auth;
    }
    try {
      await native.updateTtsMediaSession(payload);
    } catch (e) {
      console.warn('[reader TTS media session]', e);
    }
  }

  function handleNativeTtsMediaAction(action) {
    const a = String(action || '');
    // play/pause/stop уже применены в TtsPlaybackManager — здесь только UI/цепочка JS.
    if (a === 'play') {
      if (!ttsChainActive) {
        void startReaderTts();
        return;
      }
      if (!ttsPausedByUser) return;
      ttsPausedByUser = false;
      try {
        speechSynthesis.resume();
      } catch { /* */ }
      void acquireReaderWakeLock();
      syncTtsKeepaliveWithSpeech();
      updateTtsButtons();
    } else if (a === 'pause') {
      if (!ttsChainActive || ttsPausedByUser) return;
      ttsPausedByUser = true;
      try {
        speechSynthesis.pause();
      } catch { /* */ }
      releaseReaderWakeLock();
      syncTtsKeepaliveWithSpeech();
      updateTtsButtons();
    } else if (a === 'stop') {
      stopReaderTts();
    } else if (a === 'prev') {
      if (ttsChainActive) ttsNav.skipBack();
    } else if (a === 'next') {
      if (ttsChainActive) ttsNav.skipForward();
    }
  }

  function initReaderMediaSessionHandlers() {
    if (!ttsNativeMediaActionBound) {
      ttsNativeMediaActionBound = true;
      window.addEventListener('inpx-native-tts-media-action', (e) => {
        handleNativeTtsMediaAction(e.detail?.action);
      });
    }
    if (ttsMediaSessionHandlers || !('mediaSession' in navigator)) return;
    ttsMediaSessionHandlers = true;
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        if (ttsChainActive) {
          if (ttsPausedByUser) toggleReaderTts();
        } else {
          void startReaderTts();
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (ttsChainActive && !ttsPausedByUser) toggleReaderTts();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (ttsChainActive) ttsNav.skipBack();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (ttsChainActive) ttsNav.skipForward();
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        stopReaderTts();
      });
    } catch (e) {
      console.warn('[reader MediaSession]', e);
    }
  }

  /** Индекс секции → число «экранов» (pages−2 у пагинатора); точные значения после прохода. */
  const sectionPaginatorPages = new Map();
  let bookPageLayoutKeyCached = '';

  function bookPageLayoutKey() {
    return [S.font, S.fontSize, S.fontWeight, S.lineHeight, S.maxWidth, S.maxBlockSize, S.pageMargin, S.verticalMargin, S.columnGap, layoutMode(), innerWidth, innerHeight].join('|');
  }

  function invalidateBookPageCache() {
    sectionPaginatorPages.clear();
    bookPageLayoutKeyCached = '';
  }

  function ensureBookPageLayoutKey() {
    const k = bookPageLayoutKey();
    if (k !== bookPageLayoutKeyCached) {
      sectionPaginatorPages.clear();
      bookPageLayoutKeyCached = k;
    }
  }

  /* ===== Settings ===== */
  const defaults = {
    theme: 'sepia', font: 'serif', fontSize: 18, lineHeight: 1.6,
    /* verticalMargin — дыхание текста внутри view; камера/safe-area — снаружи (#reader-body). */
    pageMargin: 32, verticalMargin: 16, columnGap: 7, maxWidth: 99999, maxBlockSize: 1440,
    layout: 'paginated', textColor: '', bgColor: '', linkColor: '',
    bgImage: '', bgImageFit: 'cover', bgImagePaper: 0.35,
    justify: true, hyphenate: true,
    usePublisherFont: false, fontWeight: 400,
    letterSpacing: 0, paragraphSpacing: 0.4, textIndent: 0,
    invert: false, enableFootnotes: true,
    volumeKeys: 'normal',
    customCss: '',
    ttsRate: 1, ttsVoice: '',
    autoFlipSec: 0,
    tapZonesShort: defaultTapZonesShort(),
    tapZonesLong: defaultTapZonesLong(),
    statusMode: 'always',
    statusShowChapter: true,
    statusShowPct: true,
    statusShowPage: true,
    statusShowChapterLeft: false,
    statusShowClock: false,
    // По умолчанию выкл: при открытии книги Foliate шлёт несколько relocate подряд,
    // а на каждом листании вибрация быстро утомляет.
    pageHaptic: false,
    /** E-Ink: полная перерисовка экрана каждые N страниц (1 / 3 / 5). */
    einkFullRefreshEvery: 5,
  };
  const SYSTEM_FONTS = {
    serif: { label: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
    palatino: { label: 'Palatino', stack: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
    times: { label: 'Times New Roman', stack: '"Times New Roman", Times, "Liberation Serif", "Noto Serif", serif' },
    charter: { label: 'Charter', stack: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif' },
    sans: { label: 'System UI', stack: '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, sans-serif' },
    verdana: { label: 'Verdana', stack: 'Verdana, Geneva, "DejaVu Sans", sans-serif' },
    arial: { label: 'Arial', stack: 'Arial, Helvetica, "Helvetica Neue", sans-serif' },
    mono: { label: 'Monospace', stack: '"Cascadia Code", "Fira Code", Consolas, "Liberation Mono", monospace' },
  };
  const GOOGLE_FONTS = {
    'gf-pt-serif': { label: 'PT Serif', family: 'PT Serif', weights: '400;700', stack: '"PT Serif", Georgia, serif' },
    'gf-pt-sans': { label: 'PT Sans', family: 'PT Sans', weights: '400;700', stack: '"PT Sans", system-ui, sans-serif' },
    'gf-literata': { label: 'Literata', family: 'Literata', weights: '400;700', stack: '"Literata", Georgia, serif' },
    'gf-merriweather': { label: 'Merriweather', family: 'Merriweather', weights: '400;700', stack: '"Merriweather", Georgia, serif' },
    'gf-noto-serif': { label: 'Noto Serif', family: 'Noto Serif', weights: '400;700', stack: '"Noto Serif", Georgia, serif' },
    'gf-eb-garamond': { label: 'EB Garamond', family: 'EB Garamond', weights: '400;700', stack: '"EB Garamond", Georgia, serif' },
    'gf-spectral': { label: 'Spectral', family: 'Spectral', weights: '400;700', stack: '"Spectral", Georgia, serif' },
    'gf-ibm-plex-serif': { label: 'IBM Plex Serif', family: 'IBM Plex Serif', weights: '400;700', stack: '"IBM Plex Serif", Georgia, serif' },
    'gf-roboto': { label: 'Roboto', family: 'Roboto', weights: '400;700', stack: '"Roboto", system-ui, sans-serif' },
    'gf-fira-sans': { label: 'Fira Sans', family: 'Fira Sans', weights: '400;700', stack: '"Fira Sans", system-ui, sans-serif' },
    'gf-ibm-plex-sans': { label: 'IBM Plex Sans', family: 'IBM Plex Sans', weights: '400;700', stack: '"IBM Plex Sans", system-ui, sans-serif' },
    'gf-commissioner': { label: 'Commissioner', family: 'Commissioner', weights: '400;700', stack: '"Commissioner", system-ui, sans-serif' },
  };
  const fontMap = Object.fromEntries([
    ...Object.entries(SYSTEM_FONTS).map(([k, v]) => [k, v.stack]),
    ...Object.entries(GOOGLE_FONTS).map(([k, v]) => [k, v.stack]),
  ]);
  const loadedGoogleFonts = new Set();
  function googleFontCssUrl(def) {
    const family = def.family.trim().replace(/\s+/g, '+');
    return `https://fonts.googleapis.com/css2?family=${family}:wght@${def.weights || '400;700'}&display=swap`;
  }
  function ensureGoogleFont(key) {
    const def = GOOGLE_FONTS[key];
    if (!def || loadedGoogleFonts.has(key)) return;
    loadedGoogleFonts.add(key);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = googleFontCssUrl(def);
    document.head.appendChild(link);
  }
  function ensureGoogleFontInDoc(doc, key) {
    const def = GOOGLE_FONTS[key];
    if (!def || !doc?.head) return Promise.resolve();
    const id = `reader-gf-${key}`;
    const existing = doc.getElementById(id);
    if (existing) {
      return existing.dataset.loaded === '1'
        ? (doc.fonts?.ready ?? Promise.resolve())
        : new Promise(resolve => {
          existing.addEventListener('load', () => resolve(doc.fonts?.ready), { once: true });
          existing.addEventListener('error', () => resolve(), { once: true });
        });
    }
    return new Promise(resolve => {
      const link = doc.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = googleFontCssUrl(def);
      link.addEventListener('load', () => {
        link.dataset.loaded = '1';
        resolve(doc.fonts?.ready);
      }, { once: true });
      link.addEventListener('error', () => resolve(), { once: true });
      doc.head.appendChild(link);
    });
  }
  function syncReaderGoogleFont(doc) {
    const key = S.font;
    if (!GOOGLE_FONTS[key]) return Promise.resolve();
    ensureGoogleFont(key);
    const bookDoc = doc || view?.renderer?.getContents?.()?.[0]?.doc;
    if (!bookDoc) return Promise.resolve();
    return ensureGoogleFontInDoc(bookDoc, key);
  }
  function populateFontSelect() {
    const sel = $('rs-font-family');
    if (!sel) return;
    const cur = S.font;
    sel.replaceChildren();
    const addGroup = (label, entries) => {
      const og = document.createElement('optgroup');
      og.label = label;
      for (const [key, def] of entries) {
        const o = document.createElement('option');
        o.value = key;
        o.textContent = def.label;
        og.appendChild(o);
      }
      sel.appendChild(og);
    };
    addGroup(rt('reader.fontSystem'), Object.entries(SYSTEM_FONTS));
    addGroup(rt('reader.fontGoogle'), Object.entries(GOOGLE_FONTS));
    if (!(cur in fontMap)) S.font = defaults.font;
    sel.value = S.font;
  }
  function readerSideMarginPx() {
    return Math.max(0, Math.min(80, Number(S.pageMargin) || 0));
  }
  function readerViewportWidth() {
    if (view?.clientWidth > 0) return view.clientWidth;
    return readerBody?.clientWidth ?? innerWidth;
  }
  function readerContentWidth() {
    return Math.max(320, readerViewportWidth());
  }
  function resolveMaxInlineSizePx() {
    const w = readerContentWidth();
    if (layoutMode() === 'dual') return Math.floor(w / 2);
    if (Number(S.maxWidth) >= 9000) return w;
    return Math.max(320, Math.min(Number(S.maxWidth) || 720, w));
  }
  function layoutMode() {
    if (S.layout === 'scrolled') return 'scrolled';
    /* Телефон: всегда одна колонка — dual на узком экране ломает номера страниц при restore. */
    if (mobileMq.matches) return 'paginated';
    return S.layout;
  }

  function applyRendererLayout() {
    if (!view?.renderer) return;
    invalidateBookPageCache();
    const side = readerSideMarginPx();
    const gapPct = Math.max(0, Math.min(20, Number(S.columnGap) || 0));
    const vert = Math.max(0, Math.min(96, Number(S.verticalMargin) || 0));
    const mode = layoutMode();
    view.style.boxSizing = 'border-box';
    view.style.paddingInline = `${side}px`;
    /* На телефоне (paginated): статус и панели поверх текста, не сжимают колонки. */
    if (mobileMq.matches && mode !== 'scrolled') {
      view.renderer.setAttribute('margin', '0px');
      view.renderer.setAttribute('margin-top', `${vert}px`);
      view.renderer.setAttribute('margin-bottom', '0px');
    } else {
      view.renderer.setAttribute('margin', `${vert}px`);
      view.renderer.removeAttribute('margin-top');
      view.renderer.removeAttribute('margin-bottom');
    }
    // В одноколоночном режиме gap paginator даёт доп. боковые поля (~7% по умолчанию).
    // Горизонтальные поля — только через paddingInline (pageMargin).
    view.renderer.setAttribute('gap', mode === 'dual' ? `${gapPct}%` : '0%');
    view.renderer.setAttribute('max-inline-size', `${resolveMaxInlineSizePx()}px`);
    view.renderer.setAttribute('max-column-count', mode === 'dual' ? '2' : '1');
    view.renderer.setAttribute('flow', mode === 'scrolled' ? 'scrolled' : 'paginated');
    if (mode === 'scrolled') {
      view.renderer.setAttribute('max-block-size', `${Math.round(S.maxBlockSize || defaults.maxBlockSize)}px`);
    } else {
      view.renderer.setAttribute('max-block-size', '100%');
    }
  }

  function applyInvertFilter() {
    if (!view) return;
    view.style.filter = S.invert ? 'invert(1) hue-rotate(180deg)' : '';
  }
  function isFullWidth() {
    return Number(S.maxWidth) >= 9000;
  }
  const mobileMq = window.matchMedia('(max-width: 640px)');
  let S = {};
  /** Режим устройства из приложения (BOOX и т.п.) — не путать с цветовой темой «E-Ink». */
  function isAppEinkMode() {
    if (window.__READER_APP_EINK === 1 || window.__READER_APP_EINK === true) return true;
    try {
      return new URLSearchParams(location.search).get('eink') === '1';
    } catch {
      return false;
    }
  }

  function loadSettings() {
    try { S = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}'); } catch { S = {}; }
    for (const k of Object.keys(defaults)) if (S[k] === undefined) S[k] = defaults[k];
    if (READER_LITE) {
      S.theme = 'eink';
      S.textColor = '';
      S.bgColor = '';
      if (!localStorage.getItem(SETTINGS_STORAGE_KEY)) {
        S.fontSize = 21;
        S.lineHeight = 1.7;
        S.pageMargin = 24;
        S.font = 'serif';
        S.layout = 'paginated';
        S.textColor = '';
        S.bgColor = '';
      }
    }
    if (!['paginated', 'dual', 'scrolled'].includes(S.layout)) S.layout = defaults.layout;
    if (mobileMq.matches && S.layout === 'dual') S.layout = 'paginated';
    if (typeof S.justify !== 'boolean') S.justify = defaults.justify;
    if (typeof S.hyphenate !== 'boolean') S.hyphenate = defaults.hyphenate;
    if (typeof S.usePublisherFont !== 'boolean') S.usePublisherFont = defaults.usePublisherFont;
    if (typeof S.invert !== 'boolean') S.invert = defaults.invert;
    if (typeof S.enableFootnotes !== 'boolean') S.enableFootnotes = defaults.enableFootnotes;
    if (typeof S.customCss !== 'string') S.customCss = defaults.customCss;
    if (S.linkColor && !/^#[0-9A-Fa-f]{6}$/.test(String(S.linkColor).trim())) S.linkColor = '';
    if (S.textColor && !/^#[0-9A-Fa-f]{6}$/.test(String(S.textColor).trim())) S.textColor = '';
    if (S.bgColor && !/^#[0-9A-Fa-f]{6}$/.test(String(S.bgColor).trim())) S.bgColor = '';
    if (typeof S.bgImage !== 'string') S.bgImage = defaults.bgImage;
    if (!S.bgImage.startsWith('data:image/')) S.bgImage = '';
    else if (S.bgImage.length > 900_000) S.bgImage = '';
    if (!['cover', 'contain', 'tile'].includes(S.bgImageFit)) S.bgImageFit = defaults.bgImageFit;
    const bp = Number(S.bgImagePaper);
    S.bgImagePaper = Number.isFinite(bp) ? Math.min(1, Math.max(0, bp)) : defaults.bgImagePaper;
    if (!(S.font in fontMap)) S.font = defaults.font;
    const pm = Number(S.pageMargin);
    S.pageMargin = Number.isFinite(pm) ? Math.min(80, Math.max(0, Math.round(pm))) : defaults.pageMargin;
    const vm = Number(S.verticalMargin);
    S.verticalMargin = Number.isFinite(vm) ? Math.min(96, Math.max(0, Math.round(vm))) : defaults.verticalMargin;
    const cg = Number(S.columnGap);
    S.columnGap = Number.isFinite(cg) ? Math.min(20, Math.max(0, Math.round(cg))) : defaults.columnGap;
    const mw = Number(S.maxWidth);
    S.maxWidth = Number.isFinite(mw) ? mw : defaults.maxWidth;
    const mbs = Number(S.maxBlockSize);
    S.maxBlockSize = Number.isFinite(mbs) ? Math.min(2400, Math.max(720, Math.round(mbs))) : defaults.maxBlockSize;
    const fw = Number(S.fontWeight);
    S.fontWeight = [400, 500, 600, 700].includes(fw) ? fw : defaults.fontWeight;
    const ls = Number(S.letterSpacing);
    S.letterSpacing = Number.isFinite(ls) ? Math.min(0.2, Math.max(-0.05, ls)) : defaults.letterSpacing;
    const ps = Number(S.paragraphSpacing);
    S.paragraphSpacing = Number.isFinite(ps) ? Math.min(1.5, Math.max(0, ps)) : defaults.paragraphSpacing;
    const ti = Number(S.textIndent);
    S.textIndent = Number.isFinite(ti) ? Math.min(3, Math.max(0, ti)) : defaults.textIndent;
    const tr = Number(S.ttsRate);
    S.ttsRate = Number.isFinite(tr) ? Math.min(2, Math.max(0.5, tr)) : defaults.ttsRate;
    if (typeof S.ttsVoice !== 'string') S.ttsVoice = defaults.ttsVoice;
    if (S.volumeKeys !== 'normal' && S.volumeKeys !== 'inverted') S.volumeKeys = defaults.volumeKeys;
    const af = Number(S.autoFlipSec);
    S.autoFlipSec = Number.isFinite(af) ? Math.min(30, Math.max(0, Math.round(af))) : defaults.autoFlipSec;
    S.tapZonesShort = normalizeTapZones(S.tapZonesShort, defaultTapZonesShort());
    S.tapZonesLong = normalizeTapZones(S.tapZonesLong, defaultTapZonesLong());
    if (!['withChrome', 'always', 'hidden'].includes(S.statusMode)) S.statusMode = defaults.statusMode;
    if (typeof S.statusShowChapter !== 'boolean') S.statusShowChapter = defaults.statusShowChapter;
    if (typeof S.statusShowPct !== 'boolean') S.statusShowPct = defaults.statusShowPct;
    if (typeof S.statusShowPage !== 'boolean') S.statusShowPage = defaults.statusShowPage;
    if (typeof S.statusShowChapterLeft !== 'boolean') S.statusShowChapterLeft = defaults.statusShowChapterLeft;
    if (typeof S.statusShowClock !== 'boolean') S.statusShowClock = defaults.statusShowClock;
    if (typeof S.pageHaptic !== 'boolean') S.pageHaptic = defaults.pageHaptic;
    {
      const er = Number(S.einkFullRefreshEvery);
      S.einkFullRefreshEvery = [1, 3, 5].includes(er) ? er : defaults.einkFullRefreshEvery;
    }
    if (isAppEinkMode()) {
      S.theme = 'eink';
      S.pageHaptic = false;
      S.invert = false;
    }
  }
  function saveSettings() { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(S)); }
  loadSettings();
  const bootTitle = String(window.__READER_BOOK_TITLE || '').trim();
  if (bootTitle) {
    const tbTitle = document.querySelector('.tb-title');
    if (tbTitle) tbTitle.textContent = bootTitle;
  }
  const themeColors = {
    dark:  { bg: '#1e1a16', fg: '#e8e0d4', link: '#d4ac5c' },
    light: { bg: '#f5f1e8', fg: '#2e2418', link: '#8b5a12' },
    sepia: { bg: '#f4ecd8', fg: '#463b2f', link: '#8b5a12' },
    night: { bg: '#0d0b0a', fg: '#948b81', link: '#8a7a67' },
    eink:  { bg: '#ffffff', fg: '#000000', link: '#000000' },
  };
  const presets = {
    compact:  { fontSize: 16, lineHeight: 1.45, pageMargin: 20, maxWidth: 680, paragraphSpacing: 0.25 },
    balanced: { fontSize: 18, lineHeight: 1.6,  pageMargin: 32, maxWidth: 720, paragraphSpacing: 0.4 },
    relaxed:  { fontSize: 21, lineHeight: 1.8,  pageMargin: 48, maxWidth: 800, paragraphSpacing: 0.65 },
  };

  function getEffectiveTextColor() {
    const c = themeColors[S.theme] || themeColors.dark;
    const t = S.textColor && String(S.textColor).trim();
    if (t && /^#[0-9A-Fa-f]{6}$/.test(t)) return t;
    return c.fg;
  }

  function getEffectiveBgColor() {
    const c = themeColors[S.theme] || themeColors.dark;
    const t = S.bgColor && String(S.bgColor).trim();
    if (t && /^#[0-9A-Fa-f]{6}$/.test(t)) return t;
    return c.bg;
  }

  function hexToRgba(hex, alpha) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function getEffectiveBgImage() {
    const img = String(S.bgImage || '').trim();
    return img.startsWith('data:image/') ? img : '';
  }

  function getPageBackgroundCss() {
    if (getEffectiveBgImage()) return 'transparent';
    return getEffectiveBgColor();
  }

  function getBgImageLayerCss() {
    const img = getEffectiveBgImage();
    if (!img) return '';
    const fit = S.bgImageFit || 'cover';
    const repeat = fit === 'tile' ? 'repeat' : 'no-repeat';
    const size = fit === 'tile' ? 'auto' : fit;
    const paper = getEffectiveBgColor();
    const op = Number(S.bgImagePaper);
    const a = Number.isFinite(op) ? Math.min(1, Math.max(0, op)) : defaults.bgImagePaper;
    const imageLayer = `url("${img}") center / ${size} ${repeat}`;
    if (a <= 0.01) return imageLayer;
    const overlay = hexToRgba(paper, a);
    return `linear-gradient(${overlay}, ${overlay}), ${imageLayer}`;
  }

  function applyPaginatorWallpaper() {
    const paginator = view?.renderer;
    const root = paginator?.shadowRoot;
    if (!root) return;
    const bgEl = root.getElementById('background');
    if (!bgEl) return;
    // При картинке фон уже на html (fixed) — колонки прозрачные, без щелей
    const value = getEffectiveBgImage() ? 'transparent' : getEffectiveBgColor();
    bgEl.style.background = value;
    for (const col of bgEl.children) {
      if (col?.style) col.style.background = value;
    }
  }

  function ensureWallpaperEl() {
    let el = document.getElementById('reader-wallpaper');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'reader-wallpaper';
    el.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  function applyChromeVarsForBgImage(active) {
    const root = document.documentElement;
    if (!active) {
      root.style.removeProperty('--r-chrome-bg');
      root.style.removeProperty('--r-chrome-line');
      root.style.removeProperty('--r-chrome-hover');
      return;
    }
    const paper = getEffectiveBgColor();
    const fg = getEffectiveTextColor();
    // Явный rgba: color-mix на Android WebView часто игнорируется → остаётся непрозрачный --r-bar
    root.style.setProperty('--r-chrome-bg', hexToRgba(paper, 0.72));
    root.style.setProperty('--r-chrome-line', hexToRgba(fg, 0.14));
    root.style.setProperty('--r-chrome-hover', hexToRgba(fg, 0.1));
  }

  function applyShellBackground() {
    const color = getEffectiveBgColor();
    const layer = getBgImageLayerCss();
    const root = document.documentElement;
    const wallpaper = ensureWallpaperEl();
    const hasImg = Boolean(layer);
    root.classList.toggle('has-bg-image', hasImg);
    applyChromeVarsForBgImage(hasImg);
    // Не красим html background-attachment:fixed — на Android WebView даёт боковые щели
    root.style.background = '';
    root.style.backgroundAttachment = '';
    if (hasImg) {
      wallpaper.style.background = layer;
      document.body.style.background = 'transparent';
      if (readerBody) {
        readerBody.style.background = 'transparent';
        readerBody.style.backgroundImage = '';
      }
    } else {
      wallpaper.style.background = '';
      document.body.style.background = color;
      if (readerBody) {
        readerBody.style.background = color;
        readerBody.style.backgroundImage = '';
      }
    }
    if (view) view.style.background = hasImg ? 'transparent' : '';
    applyPaginatorWallpaper();
  }

  function getEffectiveLinkColor() {
    const c = themeColors[S.theme] || themeColors.dark;
    const t = S.linkColor && String(S.linkColor).trim();
    if (t && /^#[0-9A-Fa-f]{6}$/.test(t)) return t;
    if (READER_LITE || S.theme === 'eink') return getEffectiveTextColor();
    return c.link;
  }

  function getUserCssBlock() {
    const raw = String(S.customCss || '').trim();
    if (!raw) return '';
    return raw.length > 32768 ? raw.slice(0, 32768) : raw;
  }

  function getBookCSS() {
    const c = themeColors[S.theme] || themeColors.dark;
    const fg = getEffectiveTextColor();
    const bg = getPageBackgroundCss();
    const link = getEffectiveLinkColor();
    const ff = fontMap[S.font] || fontMap.serif;
    const mono = fontMap.mono;
    const align = S.justify !== false ? 'justify' : 'start';
    const hyph = S.hyphenate !== false ? 'auto' : 'manual';
    const pubFont = S.usePublisherFont === true;
    const weight = Number(S.fontWeight) || 400;
    const ls = Number(S.letterSpacing) || 0;
    const ps = Number(S.paragraphSpacing) || 0;
    const ti = Number(S.textIndent) || 0;
    const fontFamilyRule = pubFont ? '' : `
      body, p, div, span, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, em, strong, i, b, u, a, section, article {
        font-family: ${ff} !important;
      }`;
    const text = `
      @namespace epub "http://www.idpf.org/2007/ops";
      html { color: ${fg} !important; background: ${bg} !important; }
      ${fontFamilyRule}
      body { color: ${fg} !important; background: ${bg} !important; font-size: ${S.fontSize}px !important; font-weight: ${weight} !important; letter-spacing: ${ls}em !important; }
      pre, code, kbd, samp { font-family: ${mono} !important; }
      p,li,blockquote,dd,div { line-height: ${S.lineHeight} !important; }
      p { margin-block-start: ${ps}em !important; margin-block-end: 0 !important; text-indent: ${ti}em !important; }
      p:first-child, li p:first-child, blockquote p:first-child { margin-block-start: 0 !important; }
      p,li,blockquote,dd { text-align: ${align}; hyphens: ${hyph}; -webkit-hyphens: ${hyph}; -webkit-hyphenate-limit-before: 3; -webkit-hyphenate-limit-after: 2; -webkit-hyphenate-limit-lines: 2; hanging-punctuation: allow-end last; widows: 2; }
      [align="left"]{text-align:left} [align="right"]{text-align:right} [align="center"]{text-align:center} [align="justify"]{text-align:justify}
      pre { white-space: pre-wrap !important; }
      aside[epub|type~="endnote"],aside[epub|type~="footnote"],aside[epub|type~="note"],aside[epub|type~="rearnote"] { display: none; }
      a { color: ${link} !important; }
      /* Paper-book flow: next chapter continues on the same page. */
      body:not(.notesBodyType) h1,
      body:not(.notesBodyType) section[epub|type~="chapter"],
      body:not(.notesBodyType) div[epub|type~="chapter"],
      body:not(.notesBodyType) article[epub|type~="chapter"],
      body:not(.notesBodyType) section.chapter,
      body:not(.notesBodyType) div.chapter {
        break-before: auto !important;
        -webkit-column-break-before: auto !important;
        page-break-before: auto !important;
      }
      ${READER_LITE ? 'img,svg image { filter: grayscale(100%) contrast(115%) !important; }' : ''}
      ${S.invert ? `
      img, svg, video, canvas, image {
        filter: invert(1) hue-rotate(180deg) !important;
      }
      ` : ''}
      ${pubFont ? '' : `
      p, li, div, span, td, th, blockquote, dd, dt, a, em, strong, i, b, u, section, article {
        font-size: inherit !important;
      }
      `}
    `;
    const parts = [];
    const gf = GOOGLE_FONTS[S.font];
    if (gf && !pubFont) parts.push(`@import url("${googleFontCssUrl(gf)}");`);
    parts.push(text);
    const userCss = getUserCssBlock();
    if (userCss) parts.push(`/* user stylesheet */\n${userCss}`);
    return parts.length === 1 ? parts[0] : parts;
  }
  function applyBookStyles() {
    if (!view?.renderer) return;
    view.renderer.setStyles?.(getBookCSS());
    requestAnimationFrame(() => applyPaginatorWallpaper());
  }

  function isNightReaderTheme() {
    return S.theme === 'dark' || S.theme === 'night';
  }

  function toggleDayNightTheme() {
    S.theme = isNightReaderTheme() ? 'light' : 'dark';
    applySettings();
    refreshSettingsUI();
    toast(isNightReaderTheme() ? rt('readerJs.nightOn') : rt('readerJs.dayOn'));
  }

  const svgMoon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';
  const svgSun = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

  function updateDayNightButton() {
    const btn = $('btn-day-night');
    if (!btn) return;
    const night = isNightReaderTheme();
    btn.title = night ? rt('readerJs.dayModeBtn') : rt('readerJs.nightModeBtn');
    btn.setAttribute('aria-label', night ? rt('readerJs.enableDayMode') : rt('readerJs.enableNightMode'));
    btn.innerHTML = night ? svgSun : svgMoon;
  }

  /**
   * Номера страниц по реальным экранам пагинатора Foliate (один шаг = один «лист» в одноколоннике
   * или разворот в двухколоннике). Неоткрытые главы оцениваются по объёму текста и плотности уже известных секций.
   */
  function hideBookPageDisplay() {
    bookPagesEl?.classList.add('is-hidden');
    lastPageInfo = { ...lastPageInfo, current: 0, total: 0, chapterLeft: 0 };
    syncStatusStrip();
  }

  function updateBookPageDisplay(loc) {
    if (!bookPagesEl || !bookPageLeft || !bookPageRight) return;
    if (!view || view.isFixedLayout) {
      hideBookPageDisplay();
      return;
    }
    const r = view.renderer;
    if (!r || r.localName !== 'foliate-paginator') {
      hideBookPageDisplay();
      return;
    }
    if (r.scrolled) {
      hideBookPageDisplay();
      return;
    }

    const pages = r.pages;
    const page = r.page;
    if (pages == null || page == null || pages < 2) {
      hideBookPageDisplay();
      return;
    }

    const contents = r.getContents?.();
    const index = contents?.[0]?.index ?? loc?.section?.current;
    if (index == null || index < 0) {
      hideBookPageDisplay();
      return;
    }

    ensureBookPageLayoutKey();
    const tp = Math.max(0, pages - 2);
    const prevTp = sectionPaginatorPages.get(index) ?? 0;
    sectionPaginatorPages.set(index, Math.max(prevTp, tp));

    let screenInSection;
    if (page <= 0) screenInSection = 0;
    else if (page >= pages - 1) screenInSection = tp;
    else screenInSection = Math.min(tp, page - 1);

    const secs = view.book?.sections;
    if (!secs?.length) {
      hideBookPageDisplay();
      return;
    }

    const secAt = secs[index];
    const sizeCur = secAt?.size > 0 ? secAt.size : 0;

    function charsPerScreenGuess() {
      let sz = 0;
      let pg = 0;
      for (const [idx, tpp] of sectionPaginatorPages) {
        const s = secs[idx];
        if (!s || s.linear === 'no' || tpp <= 0) continue;
        sz += s.size || 0;
        pg += tpp;
      }
      if (pg > 0 && sz > 0) return sz / pg;
      if (tp > 0 && sizeCur > 0) return sizeCur / tp;
      return 2800;
    }

    function textPagesForSection(j) {
      const s = secs[j];
      if (!s || s.linear === 'no') return 0;
      if (sectionPaginatorPages.has(j)) return sectionPaginatorPages.get(j);
      const sz = s.size || 0;
      if (sz <= 0) return 1;
      const cps = charsPerScreenGuess();
      return Math.max(1, Math.round(sz / cps));
    }

    function sumScreensUpTo(beforeIndex) {
      let sum = 0;
      for (let j = 0; j < beforeIndex; j++) sum += textPagesForSection(j);
      return sum;
    }

    function totalScreensBook() {
      let t = 0;
      for (let j = 0; j < secs.length; j++) t += textPagesForSection(j);
      return Math.max(1, t);
    }

    const globalScreen0 = sumScreensUpTo(index) + screenInSection;
    const totalScreens = totalScreensBook();

    bookPagesEl.classList.remove('is-hidden');
    const rtl = view.language?.direction === 'rtl';
    const dual = layoutMode() === 'dual';

    let leftText;
    let rightText;
    if (dual) {
      const totalDisp = Math.max(1, totalScreens * 2);
      const leftP = 2 * globalScreen0 + 1;
      const rightP = Math.min(totalDisp, 2 * globalScreen0 + 2);
      leftText = String(leftP);
      rightText = String(rightP);
      if (rtl) [leftText, rightText] = [rightText, leftText];
    } else {
      leftText = String(globalScreen0 + 1);
      rightText = String(totalScreens);
      if (rtl) [leftText, rightText] = [rightText, leftText];
    }
    bookPageLeft.textContent = leftText;
    bookPageRight.textContent = rightText;

    const chapterScreens = textPagesForSection(index);
    lastPageInfo = {
      current: dual ? (2 * globalScreen0 + 1) : (globalScreen0 + 1),
      total: dual ? Math.max(1, totalScreens * 2) : totalScreens,
      chapterLeft: Math.max(0, chapterScreens - screenInSection),
      chapterLabel: lastPageInfo.chapterLabel || '',
    };
    syncStatusStrip();
  }

  function pinRendererTextAnchor(snap, force = false) {
    const renderer = view?.renderer;
    if (!renderer || typeof renderer.pinTextAnchor !== 'function') return;
    const loc = view?.lastLocation;
    const currentSection = Number(loc?.section?.current);
    const snapSection = Number(snap?.sectionIndex);
    if (
      !force
      && Number.isInteger(currentSection)
      && Number.isInteger(snapSection)
      && currentSection !== snapSection
    ) return;
    const pinned = Number(renderer.pinnedTextOffset);
    const offset = Number.isInteger(Number(snap?.textOffset))
      ? Number(snap.textOffset)
      : Number.isInteger(Number(loc?.textOffset))
        ? Number(loc.textOffset)
        : Number.isInteger(pinned) && pinned >= 0
          ? pinned
          : NaN;
    const quote = snap?.textQuote || loc?.textQuote || renderer.pinnedTextQuote || '';
    if (!Number.isInteger(offset) || offset < 0) return;
    const alreadyPinned = Number(renderer.pinnedTextOffset);
    if (offset === 0 && Number.isInteger(alreadyPinned) && alreadyPinned > 0 && Number(snap?.fraction) > 0.002) {
      return;
    }
    renderer.pinTextAnchor(offset, quote);
  }

  function holdRendererLayout() {
    const renderer = view?.renderer;
    if (typeof renderer?.holdLayout === 'function') renderer.holdLayout();
  }

  function releaseRendererLayout() {
    const renderer = view?.renderer;
    if (typeof renderer?.releaseLayout === 'function') renderer.releaseLayout();
  }

  function applySettings() {
    const anchorSnap = captureStickyLayoutAnchor();
    markLayoutChurn();
    beginLayoutSuppress();
    holdRendererLayout();
    pinRendererTextAnchor(anchorSnap);
    if (READER_LITE || isAppEinkMode()) {
      S.theme = 'eink';
      S.pageHaptic = false;
      S.invert = false;
    }
    document.documentElement.dataset.readerTheme = S.theme;
    // data-eink только для режима устройства; иначе тема «E-Ink» на телефоне
    // запирала выбор любой другой темы (dataset → isAppEinkMode → force theme).
    if (isAppEinkMode()) document.documentElement.dataset.eink = '1';
    else delete document.documentElement.dataset.eink;
    document.body.dataset.readerTheme = S.theme;
    applyShellBackground();
    saveSettings();
    if (view?.renderer) {
      if (typeof view.renderer.rememberSectionFrac === 'function') {
        view.renderer.rememberSectionFrac();
      }
      applyRendererLayout();
      applyBookStyles();
      applyInvertFilter();
    }
    updateDayNightButton();
    if (view?.lastLocation) updateBookPageDisplay(view.lastLocation);
    scheduleApplyAnnotations();
    if (anchorSnap) scheduleLayoutPreserve(anchorSnap);
    else {
      releaseRendererLayout();
      endLayoutSuppress();
    }
  }

  let applySettingsTimer = null;
  function requestApplySettings() {
    const snap = captureStickyLayoutAnchor();
    markLayoutChurn();
    beginLayoutSuppress();
    holdRendererLayout();
    pinRendererTextAnchor(snap);
    clearTimeout(applySettingsTimer);
    applySettingsTimer = setTimeout(() => {
      applySettingsTimer = null;
      applySettings();
    }, 140);
  }
  function flushApplySettings() {
    if (applySettingsTimer == null) return;
    clearTimeout(applySettingsTimer);
    applySettingsTimer = null;
    applySettings();
  }

  let layoutRestoreToken = 0;
  let layoutPreserveTimer = null;
  let layoutAnchorSticky = null;
  let layoutChurnUntil = 0;
  let layoutSuppressHeld = false;

  function sectionTextLength() {
    const doc = getLoadedSectionDoc();
    return String(doc?.body?.textContent ?? '').replace(/[\t\n\f\r ]+/g, ' ').trim().length;
  }

  function estimateTextOffsetFromPage() {
    const renderer = view?.renderer;
    const pinned = Number(renderer?.pinnedTextOffset);
    if (Number.isInteger(pinned) && pinned > 0) return pinned;
    const page = Number(renderer?.page);
    const pages = Number(renderer?.pages);
    const len = sectionTextLength();
    if (page > 1 && pages > 2 && len > 0) {
      return Math.round(((page - 1) / Math.max(1, pages - 2)) * len);
    }
    return NaN;
  }

  function snapshotLayoutAnchor(loc) {
    let textOffset = Number(loc?.textOffset);
    const page = Number(view?.renderer?.page);
    if (!Number.isInteger(textOffset) || (textOffset <= 0 && page > 1)) {
      const estimated = estimateTextOffsetFromPage();
      if (Number.isInteger(estimated) && estimated >= 0) textOffset = estimated;
    }
    const anchor = {
      sectionIndex: Number(loc?.section?.current),
      textOffset,
      textQuote: String(loc?.textQuote || ''),
      cfi: String(loc?.cfi || '').trim(),
      fraction: readingFractionFromLocation(loc),
      fb2Href: readerResolveFb2Href(loc),
      range: null,
    };
    try {
      if (loc?.range?.cloneRange) anchor.range = loc.range.cloneRange();
    } catch { /* */ }
    return anchor;
  }

  function layoutAnchorFromLocation(loc) {
    return snapshotLayoutAnchor(loc);
  }

  function isUsableLayoutAnchor(snap) {
    if (!snap) return false;
    if (
      Number.isInteger(snap.sectionIndex)
      && snap.sectionIndex >= 0
      && Number.isInteger(snap.textOffset)
      && snap.textOffset > 0
    ) return true;
    if (
      Number.isInteger(snap.sectionIndex)
      && snap.sectionIndex >= 0
      && snap.textOffset === 0
      && Number(snap.fraction) <= 0.002
    ) return true;
    if (snap.cfi && typeof isAppReaderPosition === 'function' && !isAppReaderPosition(snap.cfi)) return true;
    return Number(snap.fraction) > 0.002;
  }

  function isLayoutAnchorJump(prev, next) {
    if (!prev || !next) return false;
    if (
      Number.isInteger(prev.sectionIndex)
      && Number.isInteger(next.sectionIndex)
      && prev.sectionIndex !== next.sectionIndex
    ) return true;
    if (
      Number.isInteger(prev.textOffset)
      && Number.isInteger(next.textOffset)
      && Math.abs(prev.textOffset - next.textOffset) > 400
    ) return true;
    return Math.abs(Number(prev.fraction) - Number(next.fraction)) > 0.02;
  }

  function captureStickyLayoutAnchor(loc = view?.lastLocation) {
    let fromLoc = loc ? snapshotLayoutAnchor(loc) : null;
    if (!isUsableLayoutAnchor(fromLoc) && view?.renderer?.pinnedTextOffset != null) {
      const pinned = Number(view.renderer.pinnedTextOffset);
      if (Number.isInteger(pinned) && pinned >= 0) {
        fromLoc = {
          ...(fromLoc || {}),
          sectionIndex: Number.isInteger(Number(fromLoc?.sectionIndex))
            ? Number(fromLoc.sectionIndex)
            : Number(view?.lastLocation?.section?.current),
          textOffset: pinned,
          textQuote: String(view.renderer.pinnedTextQuote || fromLoc?.textQuote || ''),
        };
      }
    }
    if (!isUsableLayoutAnchor(fromLoc) && committedPosition) {
      fromLoc = {
        sectionIndex: Number(committedPosition.sectionIndex),
        textOffset: Number(committedPosition.textOffset),
        textQuote: String(committedPosition.textQuote || ''),
        cfi: String(committedPosition.position || '').trim(),
        fraction: Number(committedPosition.fraction) || 0,
        fb2Href: committedPosition.fb2Href || null,
        range: null,
      };
    }
    if (layoutAnchorSticky && Date.now() < layoutChurnUntil) {
      if (fromLoc && isLayoutAnchorJump(layoutAnchorSticky, fromLoc)) return layoutAnchorSticky;
    }
    if (isUsableLayoutAnchor(fromLoc)) {
      if (layoutAnchorSticky && isLayoutAnchorJump(layoutAnchorSticky, fromLoc) && Date.now() < layoutChurnUntil) {
        return layoutAnchorSticky;
      }
      layoutAnchorSticky = fromLoc;
      return layoutAnchorSticky;
    }
    return layoutAnchorSticky;
  }

  function noteUserLayoutAnchor(loc) {
    if (positionSaveSuppression.isSuppressed()) return;
    const snap = loc ? snapshotLayoutAnchor(loc) : null;
    if (isUsableLayoutAnchor(snap)) {
      layoutAnchorSticky = snap;
      pinRendererTextAnchor(snap);
    }
  }

  function markLayoutChurn() {
    layoutChurnUntil = Date.now() + 900;
    clearTimeout(syncTimer);
    syncTimer = null;
  }

  function beginLayoutSuppress() {
    markLayoutChurn();
    if (!layoutSuppressHeld) {
      positionSaveSuppression.begin();
      layoutSuppressHeld = true;
    }
  }

  function endLayoutSuppress() {
    if (!layoutSuppressHeld) return;
    positionSaveSuppression.end();
    layoutSuppressHeld = false;
    layoutChurnUntil = Math.max(layoutChurnUntil, Date.now() + 1800);
  }

  function layoutAnchorVerified(snap, landed) {
    if (!snap || !landed) return false;
    const sameSection = Number.isInteger(snap.sectionIndex)
      && snap.sectionIndex >= 0
      && Number(landed?.section?.current) === snap.sectionIndex;
    const pinned = Number(view?.renderer?.pinnedTextOffset);
    if (
      sameSection
      && Number.isInteger(snap.textOffset)
      && snap.textOffset > 0
      && pinned === snap.textOffset
    ) return true;
    const renderer = view?.renderer;
    if (
      sameSection
      && snap.textOffset > 0
      && renderer
      && !renderer.scrolled
      && Number(renderer.pages) > 2
    ) {
      const len = sectionTextLength();
      if (len > 0) {
        const textPages = Math.max(0, Number(renderer.pages) - 2);
        const expectedPage = Math.round((snap.textOffset / len) * Math.max(0, textPages - 1)) + 1;
        if (Math.abs(Number(renderer.page) - expectedPage) <= 1) return true;
      }
    }
    if (
      Number.isInteger(snap.sectionIndex)
      && snap.sectionIndex >= 0
      && Number.isInteger(snap.textOffset)
      && snap.textOffset >= 0
    ) {
      if (sameSection) {
        const landedOff = Number(landed?.textOffset);
        if (Number.isInteger(landedOff) && landedOff > 0 && Math.abs(landedOff - snap.textOffset) <= 2500) {
          return true;
        }
      }
      return isTextAnchorLandingVerified({
        sectionIndex: snap.sectionIndex,
        textOffset: snap.textOffset,
        textQuote: snap.textQuote,
      }, landed, 2500);
    }
    return Math.abs(readingFractionFromLocation(landed) - snap.fraction) <= 0.02;
  }

  function keepLayoutAnchor(snap) {
    if (!isUsableLayoutAnchor(snap)) return;
    layoutAnchorSticky = snap;
    pinRendererTextAnchor(snap);
    const loc = view?.lastLocation;
    const payload = loc ? readerPositionFromLocation(loc) : {};
    const fraction = Number(snap.fraction) > 0 ? Number(snap.fraction) : Number(payload.fraction) || 0;
    const merged = {
      ...payload,
      sectionIndex: snap.sectionIndex ?? payload.sectionIndex,
      textOffset: Number.isInteger(snap.textOffset) ? snap.textOffset : payload.textOffset,
      textQuote: snap.textQuote || payload.textQuote,
      fraction,
      progress: fractionToProgress(fraction),
      fb2Href: snap.fb2Href || payload.fb2Href,
      _reason: 'layout-preserve',
    };
    committedPosition = { ...merged };
    writePositionImmediate(merged);
  }

  function isLayoutChurning() {
    return layoutSuppressHeld || Date.now() < layoutChurnUntil;
  }

  function payloadAsAnchor(payload) {
    return {
      sectionIndex: Number(payload?.sectionIndex),
      textOffset: Number(payload?.textOffset),
      fraction: Number(payload?.fraction),
    };
  }

  function scheduleLayoutPreserve(anchorSnap) {
    clearTimeout(layoutPreserveTimer);
    layoutPreserveTimer = setTimeout(() => {
      void preserveLocationAfterLayoutChange(anchorSnap);
    }, 220);
  }

  async function preserveLocationAfterLayoutChange(anchorSnap, opts = {}) {
    if (!view || !anchorSnap) {
      releaseRendererLayout();
      return;
    }
    const snap = isUsableLayoutAnchor(layoutAnchorSticky) ? layoutAnchorSticky : anchorSnap;
    const applyStyles = opts.applyStyles !== false;
    const token = ++layoutRestoreToken;
    beginLayoutSuppress();
    holdRendererLayout();
    pinRendererTextAnchor(snap);
    try {
      if (applyStyles) {
        await syncReaderGoogleFont();
        applyBookStyles();
      }
      const doc = getLoadedSectionDoc();
      await waitForFontsReady(doc, applyStyles ? 3000 : 1500);
      await waitForLayoutSettled(applyStyles ? 1200 : 700);
      if (token !== layoutRestoreToken || !view) return;

      const hasTextAnchor = Number.isInteger(snap.sectionIndex)
        && snap.sectionIndex >= 0
        && Number.isInteger(snap.textOffset)
        && (
          snap.textOffset > 0
          || Number(snap.fraction) <= 0.002
        );

      if (hasTextAnchor) {
        try {
          pinRendererTextAnchor(snap);
          const renderer = view.renderer;
          const sameSection = Number(view.lastLocation?.section?.current) === snap.sectionIndex;
          if (sameSection && typeof renderer?.restoreTextAnchor === 'function') {
            await renderer.restoreTextAnchor(snap.textOffset, snap.textQuote);
          } else if (typeof view.goToTextAnchor === 'function') {
            await view.goToTextAnchor(snap.sectionIndex, snap.textOffset, snap.textQuote);
          } else {
            throw new Error('no text-anchor restore');
          }
          await waitForLayoutSettled(600);
          if (token !== layoutRestoreToken || !view) return;
          try { await ensurePaginatorContentPage(); } catch { /* */ }
          pinRendererTextAnchor(snap);
          const verified = layoutAnchorVerified(snap, view.lastLocation);
          posLog('layout-preserve', {
            method: 'textAnchor',
            sectionIndex: snap.sectionIndex,
            textOffset: snap.textOffset,
            verified,
          });
          if (verified) {
            keepLayoutAnchor(snap);
            return;
          }
        } catch {
          /* fall through */
        }
      }

      const renderer = view.renderer;
      if (typeof renderer?.restoreSectionFrac === 'function') {
        pinRendererTextAnchor(snap);
        const restored = await renderer.restoreSectionFrac('anchor');
        await waitForLayoutSettled(400);
        if (token !== layoutRestoreToken || !view) return;
        try { await ensurePaginatorContentPage(); } catch { /* */ }
        const verified = layoutAnchorVerified(snap, view.lastLocation);
        posLog('layout-preserve', {
          method: 'sectionFrac',
          restored,
          verified,
        });
        if (restored && verified) {
          keepLayoutAnchor(snap);
          return;
        }
      }

      if (!isFb2Active() && snap.cfi && !isAppReaderPosition(snap.cfi)) {
        try {
          const ok = await goToReaderTarget(snap.cfi, { retries: 3 });
          if (ok) {
            await waitForLayoutSettled(600);
            if (token !== layoutRestoreToken || !view) return;
            try { await ensurePaginatorContentPage(); } catch { /* */ }
            pinRendererTextAnchor(snap);
            const verified = layoutAnchorVerified(snap, view.lastLocation);
            posLog('layout-preserve', { method: 'cfi', verified });
            if (verified) {
              keepLayoutAnchor(snap);
              return;
            }
          }
        } catch {
          /* fall through */
        }
      }

      // Book-level fraction jumps FB2 chapters. Only use it when we have no in-section pin.
      if (!hasTextAnchor && Number(snap.fraction) > 0) {
        try {
          await seekReaderToFraction(snap.fraction);
          await waitForLayoutSettled(600);
          if (token !== layoutRestoreToken || !view) return;
          try { await ensurePaginatorContentPage(); } catch { /* */ }
          pinRendererTextAnchor(snap);
          posLog('layout-preserve', { method: 'fraction', fraction: snap.fraction });
          keepLayoutAnchor(snap);
        } catch { /* */ }
      } else if (hasTextAnchor) {
        keepLayoutAnchor(snap);
      }
    } finally {
      if (token === layoutRestoreToken) {
        endLayoutSuppress();
        releaseRendererLayout();
      }
    }
  }

  function applyPreset(name) {
    const p = presets[name]; if (!p) return;
    Object.assign(S, p);
    applySettings(); refreshSettingsUI();
  }

  function resetSettings() {
    S = {
      ...defaults,
      tapZonesShort: defaultTapZonesShort(),
      tapZonesLong: defaultTapZonesLong(),
    };
    autoFlipArmed = false;
    applySettings();
    refreshSettingsUI();
    syncStatusStrip();
    syncAutoFlipTimer();
    toast(rt('readerJs.settingsReset'));
  }

  function getActivePreset() {
    return Object.entries(presets).find(([, p]) =>
      S.fontSize === p.fontSize && Math.abs(S.lineHeight - p.lineHeight) < 0.05
    )?.[0] || '';
  }

  /* ===== Utilities ===== */
  function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const base = globalThis.apiBookPath ? globalThis.apiBookPath(bookId) : `/api/books/${encodeURIComponent(bookId)}`;
    return fetch(base + path, opts).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function esc(s) { const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }
  let toastTimer = null;
  function toast(msg) { if (!toastEl) return; toastEl.textContent = msg; toastEl.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2000); }
  const bmDateFmt = new Intl.DateTimeFormat(rLocale() === 'en' ? 'en-US' : 'ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
  function fmtDate(v) { if (!v) return ''; const d = new Date(String(v).replaceAll(' ', 'T') + (String(v).includes('Z') ? '' : 'Z')); return Number.isNaN(d.getTime()) ? String(v) : bmDateFmt.format(d); }

  /* ===== Chrome (toolbar/footer) visibility =====
   * Листание: края страницы; центр — переключить хром (тап мышью, пером или тачем).
   * Горячие клавиши и кнопки в toolbar тоже открывают панели.
   * scheduleChromeHide — продлевает автоскрытие, если chrome уже виден (и панель закрыта). */
  const CHROME_AUTOHIDE_MS = () => (isTouch.matches ? 14000 : 9000);

  function syncPanelMobileMode(tab = activePanelTab) {
    if (!panelOverlay) return;
    panelOverlay.classList.toggle('panel-mobile', mobileMq.matches);
    panelOverlay.classList.toggle('panel-settings-mode', mobileMq.matches && tab === 'settings');
  }

  function touchToPageY(clientY, doc_) {
    const iframe = doc_?.defaultView?.frameElement;
    if (!iframe) return clientY;
    return iframe.getBoundingClientRect().top + clientY;
  }

  function panelBlocksBookTap(pageY) {
    if (!panelOverlay.classList.contains('is-open')) return false;
    if (!mobileMq.matches) return false;
    const panel = panelOverlay.querySelector('.panel');
    if (!panel) return false;
    return pageY >= panel.getBoundingClientRect().top - 8;
  }

  function syncPanelChrome(tab = activePanelTab) {
    if (!panelOverlay.classList.contains('is-open')) return;
    if (mobileMq.matches) {
      setChromeVisible(false);
      return;
    }
    setChromeVisible(true);
  }

  function setChromeVisible(show) {
    chromeVisible = show;
    const panelOpen = panelOverlay.classList.contains('is-open');
    const settingsPreview = panelOpen && panelOverlay.classList.contains('panel-settings-mode');
    const hideChrome = !(show || (panelOpen && !settingsPreview));
    document.body.classList.toggle('chrome-hidden', hideChrome);
  }

  function postReaderHaptic(kind) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'inpx-reader-haptic', kind: kind || 'light' }, '*');
      }
    } catch { /* ignore */ }
  }

  /** Сбросить таймер скрытия, не показывая панели силой (если уже скрыты — ничего не делаем). */
  function scheduleChromeHide() {
    clearTimeout(chromeTimer);
    if (panelOverlay.classList.contains('is-open')) return;
    if (!chromeVisible) return;
    chromeTimer = setTimeout(() => setChromeVisible(false), CHROME_AUTOHIDE_MS());
  }
  /** Тап по центру поля: скрыто → показать и снова автоскрытие; уже видно → скрыть. */
  function toggleChromeFromCenterTap() {
    clearTimeout(chromeTimer);
    if (panelOverlay.classList.contains('is-open')) return;
    if (document.body.classList.contains('chrome-hidden')) {
      setChromeVisible(true);
      chromeTimer = setTimeout(() => setChromeVisible(false), CHROME_AUTOHIDE_MS());
    } else {
      setChromeVisible(false);
    }
  }

  /* ===== Progress ===== */
  let currentTocHref = '';
  let currentFraction = 0;
  let fb2FlatToc = [];

  function flattenTocForSeek(toc, out = []) {
    for (const item of toc ?? []) {
      if (item?.href != null && item.href !== '') out.push(item);
      if (item?.subitems?.length) flattenTocForSeek(item.subitems, out);
    }
    return out;
  }

  /** Flat TOC для подписи главы в диалоге: [{ href, label, startFraction }].
   *  startFraction — доля по объёму текста (как Foliate считает fraction), чтобы глава
   *  в диалоге совпадала с процентом. */
  function buildFlatTocForPrompt() {
    const sections = view?.book?.sections || [];
    const sizes = sections.map((s) => (s?.linear === 'no' ? 0 : Math.max(0, Number(s?.size) || 0)));
    const total = sizes.reduce((a, b) => a + b, 0) || 1;
    const cumStart = [];
    let run = 0;
    for (let i = 0; i < sizes.length; i++) { cumStart[i] = run / total; run += sizes[i]; }
    const innerCount = {};
    for (const t of fb2FlatToc) {
      const [sStr, kStr] = String(t.href).split('#');
      if (kStr != null) { const s = Number(sStr); innerCount[s] = (innerCount[s] || 0) + 1; }
    }
    const sectionDocs = new Map();
    const textOffsetFor = (sectionIndex, fragmentIndex) => {
      if (fragmentIndex == null) return 0;
      try {
        let doc = sectionDocs.get(sectionIndex);
        if (!doc) {
          doc = sections[sectionIndex]?.createDocument?.();
          if (!doc) return null;
          sectionDocs.set(sectionIndex, doc);
        }
        const marker = [...doc.querySelectorAll('[data-foliate-id]')]
          .find((el) => Number(el.getAttribute('data-foliate-id')) === fragmentIndex);
        if (!marker || !doc.body) return null;
        const prefix = doc.createRange();
        prefix.setStart(doc.body, 0);
        prefix.setEndBefore(marker);
        return String(prefix.toString() || '').replace(/[\t\n\f\r ]+/g, ' ').trim().length;
      } catch {
        return null;
      }
    };
    return fb2FlatToc.map((t) => {
      let label = '';
      try { label = t?.label ? formatLanguageMap(t.label) : ''; } catch { label = ''; }
      const [sStr, kStr] = String(t.href).split('#');
      const s = Number(sStr);
      const k = kStr != null ? Number(kStr) : null;
      let startFraction = Number.isFinite(cumStart[s]) ? cumStart[s] : null;
      if (startFraction != null && k != null) {
        const secFrac = (sizes[s] || 0) / total;
        const n = innerCount[s] || 1;
        startFraction = cumStart[s] + secFrac * (Math.max(0, k) / n);
      }
      return {
        href: t.href,
        label: String(label || '').trim(),
        startFraction,
        sectionIndex: Number.isFinite(s) ? s : null,
        textOffset: Number.isFinite(s) ? textOffsetFor(s, k) : null,
        sectionStartFraction: Number.isFinite(cumStart[s]) ? cumStart[s] : null,
        sectionFraction: Number.isFinite(sizes[s]) ? sizes[s] / total : null,
        sectionTextLength: Number.isFinite(sizes[s]) ? sizes[s] : null,
      };
    });
  }

  function isFb2Active() {
    // Формат книги известен серверу (__READER_BOOK_EXT) — доверяем расширению.
    // Раньше приоритет был у view.book.isFB2; если foliate его не выставлял,
    // FB2 сохранялась как EPUB-CFI (fb2_href=null) и ломался кросс-девайс restore.
    const ext = String(effectiveBookExt || bookExt || '').toLowerCase().replace(/^\./, '').replace(/\.zip$/, '');
    if (ext === 'fb2' || ext === 'fbz') return true;
    return Boolean(view?.book?.isFB2);
  }

  function fractionFromFb2TocHref(href) {
    if (!href || fb2FlatToc.length < 2) return null;
    const idx = fb2FlatToc.findIndex((t) => t.href === href);
    if (idx < 0) return null;
    return normalizeFraction(idx / fb2FlatToc.length);
  }

  /** Доля книги для отображения и сохранения — только Foliate loc.fraction (не TOC). */
  function readingFractionFromLocation(loc) {
    return normalizeFraction(loc?.fraction ?? 0);
  }

  function displayFractionFromLocation(loc) {
    return readingFractionFromLocation(loc);
  }

  async function seekReaderToFraction(f) {
    if (!view) return;
    const frac = normalizeFraction(f);
    // Size-based (по объёму текста, как считается сам fraction). Индексный пересчёт
    // по TOC (floor(frac × N)) промахивается на неравных главах — 95% попадало бы
    // в «Приложение» вместо Части VI.
    await view.goToFraction(frac);
  }

  function updateSeekbar() {
    if (!seekBar) return;
    seekBar.style.setProperty('--seek-pct', (currentFraction * 100).toFixed(4) + '%');
  }

  function setProgress(pct, tocItem) {
    setProgressFromFraction(pct / 100, tocItem);
  }
  /** «Глава 3Всякому…» → «Глава 3 Всякому…» */
  function formatChapterLabel(raw) {
    let s = '';
    try {
      s = typeof raw === 'string' ? raw : formatLanguageMap(raw);
    } catch {
      s = String(raw || '');
    }
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) return '';
    s = s.replace(
      /^(Глава|Гл\.?|Chapter|Ch\.?|Часть|Part)\s*(\d+)\s*/iu,
      '$1 $2 ',
    );
    return s.replace(/\s+/g, ' ').trim();
  }

  function setProgressFromFraction(fraction, tocItem) {
    const f = normalizeFraction(fraction);
    if (!seekBarUserActive) {
      currentFraction = f;
      const pctDisplay = fractionToProgress(f).toFixed(1);
      if (seekBar) seekBar.value = f;
      updateSeekbar();
      if (pctLabel) pctLabel.textContent = pctDisplay + '%';
      if (progressText) progressText.textContent = pctDisplay + '%';
    }
    if (tocItem?.label) {
      const label = formatChapterLabel(tocItem.label);
      if (ftChapter) ftChapter.textContent = label;
      if (toolbarChapter) toolbarChapter.textContent = label;
      lastPageInfo.chapterLabel = label;
    }
    currentTocHref = tocItem?.href || currentTocHref;
    updateTocHighlight();
    updateTocBtnState();
    updateSeekbar();
    syncStatusStrip();
    if (activePanelTab === 'bookmarks' && panelOverlay.classList.contains('is-open')) updateBmCard();
  }

  function formatStatusClock(d = new Date()) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /** % справа; generate-reader-html раньше клал его в mid — чиним в runtime. */
  function ensureStatusPctOnRight() {
    if (!rssPct || !statusStripEl) return;
    let right = statusStripEl.querySelector('.rss-right');
    if (!right) {
      right = document.createElement('div');
      right.className = 'rss-side rss-right';
      statusStripEl.appendChild(right);
    }
    if (rssPct.parentElement !== right) right.appendChild(rssPct);
  }

  /** Высота статус-полосы для тостов/дока. Колонки книги не трогаем. */
  function applyStatusStripReserve(show) {
    const root = document.documentElement;
    root.classList.toggle('status-strip-on', Boolean(show));
    const prev = root.style.getPropertyValue('--r-status-h').trim();
    if (!show || !statusStripEl) {
      root.style.setProperty('--r-status-h', '0px');
      return prev !== '0px';
    }
    const measured = statusStripEl.getBoundingClientRect().height;
    const cs = getComputedStyle(root);
    const bodyTok = parseFloat(cs.getPropertyValue('--r-status-body')) || 28;
    const safeBottom = parseFloat(cs.getPropertyValue('--r-safe-bottom')) || 0;
    const fallback = bodyTok + safeBottom;
    const h = Math.max(1, Math.ceil(measured > 0 ? measured : fallback));
    const next = `${h}px`;
    root.style.setProperty('--r-status-h', next);
    return prev !== next;
  }

  function syncStatusStrip() {
    if (!statusStripEl) return;
    ensureStatusPctOnRight();
    const mode = S.statusMode || 'withChrome';
    statusStripEl.dataset.mode = mode;
    const show = mode !== 'hidden';
    statusStripEl.classList.toggle('is-visible', show);
    statusStripEl.setAttribute('aria-hidden', show ? 'false' : 'true');

    const chapterText = formatChapterLabel(lastPageInfo.chapterLabel || ftChapter?.textContent || '');
    if (rssChapter) {
      rssChapter.hidden = !(S.statusShowChapter && chapterText);
      rssChapter.textContent = chapterText;
      rssChapter.title = chapterText;
    }
    if (rssPct) {
      const pct = fractionToProgress(currentFraction).toFixed(1) + '%';
      rssPct.hidden = !S.statusShowPct;
      rssPct.textContent = pct;
    }
    if (rssPage) {
      const ok = S.statusShowPage && lastPageInfo.total > 0;
      rssPage.hidden = !ok;
      if (ok) rssPage.textContent = `${lastPageInfo.current} / ${lastPageInfo.total}`;
    }
    if (rssChapterLeft) {
      const ok = S.statusShowChapterLeft && lastPageInfo.total > 0;
      rssChapterLeft.hidden = !ok;
      if (ok) rssChapterLeft.textContent = `−${lastPageInfo.chapterLeft}`;
    }
    if (rssClock) {
      rssClock.hidden = !S.statusShowClock;
      if (S.statusShowClock) rssClock.textContent = formatStatusClock();
    }

    /* Дубли «67» / «714» по краям не нужны, пока strip уже показывает страницу */
    const stripOwnsPages = show && S.statusShowPage && lastPageInfo.total > 0;
    if (bookPagesEl) {
      if (stripOwnsPages) {
        bookPagesEl.classList.add('is-hidden');
        bookPagesEl.setAttribute('aria-hidden', 'true');
      } else if (lastPageInfo.total > 0 && !bookPagesEl.classList.contains('is-hidden')) {
        bookPagesEl.setAttribute('aria-hidden', 'false');
      }
    }

    clearInterval(statusClockTimer);
    statusClockTimer = null;
    if (show && S.statusShowClock) {
      statusClockTimer = setInterval(() => {
        if (rssClock && !rssClock.hidden) rssClock.textContent = formatStatusClock();
      }, 30_000);
    }

    applyStatusStripReserve(show);
  }
  window.__READER_SYNC_STATUS_STRIP__ = syncStatusStrip;

  function autoFlipBlocked() {
    if (!autoFlipArmed || !(S.autoFlipSec > 0)) return true;
    if (S.layout === 'scrolled') return true;
    if (ttsChainActive) return true;
    if (panelOverlay?.classList.contains('is-open')) return true;
    if (gotoOverlay?.classList.contains('is-open')) return true;
    if ($('reader-note-editor')?.classList.contains('is-open')) return true;
    if ($('reader-sel-menu')?.classList.contains('is-open')) return true;
    if (document.visibilityState !== 'visible') return true;
    return false;
  }

  function syncAutoFlipHud() {
    if (!autoFlipHud) return;
    const on = autoFlipArmed && S.autoFlipSec > 0;
    autoFlipHud.hidden = !on;
    autoFlipHud.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on) autoFlipHud.textContent = `Авто · ${S.autoFlipSec}с`;
  }

  function syncAutoFlipTimer() {
    clearInterval(autoFlipTimer);
    autoFlipTimer = null;
    if (!(S.autoFlipSec > 0)) autoFlipArmed = false;
    syncAutoFlipHud();
    if (!autoFlipArmed || !(S.autoFlipSec > 0)) return;
    autoFlipTimer = setInterval(() => {
      if (autoFlipBlocked()) return;
      view?.goRight?.();
      void acquireReaderWakeLock();
    }, S.autoFlipSec * 1000);
  }

  function toggleAutoFlip() {
    if (!(S.autoFlipSec > 0)) {
      S.autoFlipSec = 8;
      saveSettings();
      refreshSettingsUI();
    }
    autoFlipArmed = !autoFlipArmed;
    syncAutoFlipTimer();
    toast(autoFlipArmed ? `Автолист · ${S.autoFlipSec} с` : 'Автолист выкл');
  }

  function runTapAction(action) {
    if (!action || action === 'none') return;
    // Taps during open/restore used to next()/prev() onto page 1 and then
    // persist that as progress (readest#1983).
    if (document.documentElement.classList.contains('is-restoring-position')) return;
    void acquireReaderWakeLock();
    switch (action) {
      case 'prevPage': view?.goLeft?.(); break;
      case 'nextPage': view?.goRight?.(); break;
      case 'toggleChrome': toggleChromeFromCenterTap(); break;
      case 'toc': openPanel('toc'); break;
      case 'search': openPanel('search'); break;
      case 'settings': openPanel('settings'); break;
      case 'bookmark': addBookmark(); break;
      case 'dayNight': toggleDayNightTheme(); break;
      case 'tts': toggleReaderTts(); break;
      case 'prevChapter': {
        const i = getTocIdx();
        if (i > 0) goTocIdx(i - 1);
        break;
      }
      case 'nextChapter': {
        const i = getTocIdx();
        if (i >= 0 && i < tocData.length - 1) goTocIdx(i + 1);
        break;
      }
      case 'goto': openGotoDialog(); break;
      case 'autoFlip': toggleAutoFlip(); break;
      default: break;
    }
  }

  async function seekReaderToPage(page1) {
    const total = lastPageInfo.total;
    if (!(total > 0)) return;
    const p = Math.min(total, Math.max(1, Math.round(Number(page1) || 1)));
    const frac = total <= 1 ? 0 : (p - 1) / (total - 1);
    await seekReaderToFraction(frac);
  }

  function openGotoDialog() {
    if (!gotoOverlay) return;
    hideSelMenu();
    const pct = fractionToProgress(currentFraction);
    const pctSl = $('rg-pct');
    const pctNum = $('rg-pct-num');
    const pageEl = $('rg-page');
    const pageTotal = $('rg-page-total');
    if (pctSl) pctSl.value = String(pct);
    if (pctNum) pctNum.value = String(Number(pct.toFixed(1)));
    if (pageEl) {
      pageEl.value = String(Math.max(1, lastPageInfo.current || 1));
      pageEl.max = String(Math.max(1, lastPageInfo.total || 1));
      pageEl.disabled = !(lastPageInfo.total > 0);
    }
    if (pageTotal) pageTotal.textContent = lastPageInfo.total > 0 ? `из ${lastPageInfo.total}` : 'из —';
    gotoOverlay.classList.add('is-open');
    gotoOverlay.setAttribute('aria-hidden', 'false');
    syncAutoFlipTimer();
  }

  function closeGotoDialog() {
    if (!gotoOverlay) return;
    gotoOverlay.classList.remove('is-open');
    gotoOverlay.setAttribute('aria-hidden', 'true');
    syncAutoFlipTimer();
  }

  function initGotoDialog() {
    if (!gotoOverlay || gotoOverlay.dataset.wired === '1') return;
    gotoOverlay.dataset.wired = '1';
    let gotoLastField = 'pct';
    const pctSl = $('rg-pct');
    const pctNum = $('rg-pct-num');
    const pageEl = $('rg-page');
    const syncPageFromPct = (pct) => {
      if (!pageEl || !(lastPageInfo.total > 0)) return;
      const total = lastPageInfo.total;
      const p = total <= 1 ? 1 : Math.round(1 + (pct / 100) * (total - 1));
      pageEl.value = String(Math.min(total, Math.max(1, p)));
    };
    const syncPctFromPage = (page) => {
      if (!(lastPageInfo.total > 0)) return;
      const total = lastPageInfo.total;
      const pct = total <= 1 ? 0 : ((page - 1) / (total - 1)) * 100;
      if (pctSl) pctSl.value = String(pct);
      if (pctNum) pctNum.value = String(Number(pct.toFixed(1)));
    };
    pctSl?.addEventListener('input', () => {
      gotoLastField = 'pct';
      const v = Number(pctSl.value);
      if (pctNum) pctNum.value = String(Number(v.toFixed(1)));
      syncPageFromPct(v);
    });
    pctNum?.addEventListener('input', () => {
      gotoLastField = 'pct';
      const v = Math.min(100, Math.max(0, Number(pctNum.value) || 0));
      if (pctSl) pctSl.value = String(v);
      syncPageFromPct(v);
    });
    pageEl?.addEventListener('input', () => {
      gotoLastField = 'page';
      syncPctFromPage(Number(pageEl.value) || 1);
    });
    $('rg-cancel')?.addEventListener('click', closeGotoDialog);
    $('rg-go')?.addEventListener('click', () => {
      const pageVal = Number(pageEl?.value);
      const usePage = gotoLastField === 'page' && Number.isFinite(pageVal) && lastPageInfo.total > 0;
      closeGotoDialog();
      if (usePage) {
        void seekReaderToPage(pageVal);
        return;
      }
      const pct = Number(pctNum?.value ?? pctSl?.value);
      if (Number.isFinite(pct)) void seekReaderToFraction(progressToFraction(pct));
    });
    gotoOverlay.addEventListener('click', (e) => {
      if (e.target === gotoOverlay) closeGotoDialog();
    });
    $('ft-goto')?.addEventListener('click', openGotoDialog);
    pctLabel?.addEventListener('click', openGotoDialog);
  }

  function shortActionLabel(action) {
    const full = TAP_ACTION_LABELS[action] || action;
    if (full.length <= 10) return full;
    return full.slice(0, 9) + '…';
  }

  function refreshTapZonesUi() {
    const grid = $('rs-tap-grid');
    const sel = $('rs-tap-action');
    const hint = $('rs-tap-hint');
    if (!grid) return;
    const map = tapEditMode === 'long' ? S.tapZonesLong : S.tapZonesShort;
    if (!grid.dataset.built) {
      grid.dataset.built = '1';
      grid.innerHTML = TAP_ZONE_IDS.map((id) =>
        `<button type="button" class="rs-tap-cell" data-tap-zone="${id}">` +
        `<span class="rs-tap-cell-id">${id}</span>` +
        `<span class="rs-tap-cell-label"></span></button>`
      ).join('');
      grid.addEventListener('click', (e) => {
        const cell = e.target.closest?.('[data-tap-zone]');
        if (!cell) return;
        tapEditSelected = cell.dataset.tapZone;
        refreshTapZonesUi();
        sel?.focus();
      });
    }
    grid.querySelectorAll('[data-tap-zone]').forEach((cell) => {
      const id = cell.dataset.tapZone;
      const action = map?.[id] || 'none';
      cell.classList.toggle('is-selected', id === tapEditSelected);
      const label = cell.querySelector('.rs-tap-cell-label');
      if (label) label.textContent = shortActionLabel(action);
    });
    if (sel) {
      if (!sel.dataset.built) {
        sel.dataset.built = '1';
        sel.hidden = false;
        sel.innerHTML = Object.entries(TAP_ACTION_LABELS)
          .map(([k, lab]) => `<option value="${k}">${lab}</option>`)
          .join('');
        sel.addEventListener('change', () => {
          const mapKey = tapEditMode === 'long' ? 'tapZonesLong' : 'tapZonesShort';
          S[mapKey] = { ...S[mapKey], [tapEditSelected]: sel.value };
          saveSettings();
          refreshTapZonesUi();
        });
      }
      sel.value = map?.[tapEditSelected] || 'none';
    }
    if (hint) {
      hint.textContent = tapEditMode === 'long'
        ? `Долгий тап · зона ${tapEditSelected.toUpperCase()}`
        : `Короткий тап · зона ${tapEditSelected.toUpperCase()}`;
    }
    document.querySelectorAll('[data-tap-edit]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tapEdit === tapEditMode);
    });
  }

  function initControlsAndStatusSettings() {
    document.querySelectorAll('[data-tap-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        tapEditMode = btn.dataset.tapEdit === 'long' ? 'long' : 'short';
        refreshTapZonesUi();
      });
    });
    $('rs-tap-reset')?.addEventListener('click', () => {
      S.tapZonesShort = defaultTapZonesShort();
      S.tapZonesLong = defaultTapZonesLong();
      saveSettings();
      refreshTapZonesUi();
      toast('Зоны сброшены');
    });
    const autoSl = $('rs-auto-flip');
    const autoVal = $('rs-auto-flip-val');
    autoSl?.addEventListener('input', () => {
      S.autoFlipSec = Math.round(Number(autoSl.value) || 0);
      if (autoVal) autoVal.textContent = S.autoFlipSec > 0 ? `${S.autoFlipSec} с` : 'Выкл';
      if (S.autoFlipSec > 0) autoFlipArmed = true;
      else autoFlipArmed = false;
      saveSettings();
      syncAutoFlipTimer();
    });
    const bindStatusCheck = (id, key) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', () => {
        S[key] = el.checked;
        saveSettings();
        syncStatusStrip();
      });
    };
    bindStatusCheck('rs-status-chapter', 'statusShowChapter');
    bindStatusCheck('rs-status-pct', 'statusShowPct');
    bindStatusCheck('rs-status-page', 'statusShowPage');
    bindStatusCheck('rs-status-chapter-left', 'statusShowChapterLeft');
    bindStatusCheck('rs-status-clock', 'statusShowClock');
    const pageHapticEl = $('rs-page-haptic');
    pageHapticEl?.addEventListener('change', () => {
      S.pageHaptic = pageHapticEl.checked;
      saveSettings();
    });
    refreshTapZonesUi();
  }

  function estimateRemainingChapterMinutes(fraction) {
    if (!chapterSessionStartedAt) return null;
    const readInChapter = Math.max(0, fraction - chapterStartFraction);
    if (readInChapter < 0.005) return null;
    const elapsedMs = Date.now() - chapterSessionStartedAt;
    if (elapsedMs < 15_000) return null;
    const assumedChapterSpan = 0.08;
    const chapterProgress = Math.min(1, readInChapter / assumedChapterSpan);
    if (chapterProgress >= 0.98) return null;
    const totalMs = elapsedMs / chapterProgress;
    return Math.max(1, Math.round((totalMs * (1 - chapterProgress)) / 60_000));
  }

  function estimateRemainingBookMinutes(fraction) {
    const f = normalizeFraction(fraction);
    if (f < 0.02 || f >= 0.995 || !readerSessionStartedAt) return null;
    const elapsedMs = Date.now() - readerSessionStartedAt;
    if (elapsedMs < 30_000) return null;
    const totalMs = elapsedMs / f;
    const remainingMs = totalMs * (1 - f);
    return Math.max(1, Math.round(remainingMs / 60_000));
  }

  /* ===== Seekbar ===== */
  let seekTimer = null;
  let seekBarUserActive = false;
  let seekNavToken = 0;

  seekBar?.addEventListener('pointerdown', () => { seekBarUserActive = true; });
  seekBar?.addEventListener('pointercancel', () => { seekBarUserActive = false; });

  seekBar?.addEventListener('input', () => {
    const f = parseFloat(seekBar.value);
    if (pctLabel) pctLabel.textContent = fractionToProgress(f).toFixed(1) + '%';
    seekBar.style.setProperty('--seek-pct', (f * 100).toFixed(4) + '%');
    scheduleChromeHide();
    clearTimeout(seekTimer);
    const token = ++seekNavToken;
    seekTimer = setTimeout(() => {
      seekTimer = null;
      void (async () => {
        if (!view || isNaN(f)) {
          seekBarUserActive = false;
          return;
        }
        try {
          await seekReaderToFraction(f);
          await waitForLayoutSettled(800);
        } catch { /* */ }
        if (token !== seekNavToken) return;
        seekBarUserActive = false;
        const loc = view?.lastLocation;
        if (loc) {
          setProgressFromFraction(readingFractionFromLocation(loc), loc.tocItem);
        }
      })();
    }, 150);
  });

  seekBar?.addEventListener('pointerup', () => {
    window.setTimeout(() => {
      if (!seekTimer) seekBarUserActive = false;
    }, 250);
  });

  /* ===== Position sync ===== */
  let syncTimer = null;
  let autoReadToastShown = false;
  const positionSaveSuppression = createSuppressionCounter();
  const pendingStyleDocs = new Set();

  async function applySectionStyles(doc) {
    if (!doc) return;
    await syncReaderGoogleFont(doc);
    applyBookStyles();
    await waitForLayoutSettled(3000);
  }

  async function flushPendingSectionStyles() {
    const docs = pendingStyleDocs.size
      ? [...pendingStyleDocs]
      : (getLoadedSectionDoc() ? [getLoadedSectionDoc()] : []);
    pendingStyleDocs.clear();
    for (const doc of docs) {
      await applySectionStyles(doc);
    }
  }

  function isFb2Href(href) {
    const h = String(href || '').trim();
    if (!h) return false;
    const hashPos = h.indexOf('#');
    const section = hashPos === -1 ? h : h.slice(0, hashPos);
    const id = hashPos === -1 ? '' : h.slice(hashPos + 1);
    if (!section || Number.isNaN(Number(section))) return false;
    if (id !== '' && Number.isNaN(Number(id))) return false;
    return true;
  }

  function isFb2Book() {
    const ext = String(effectiveBookExt || bookExt || '').toLowerCase();
    if (ext.includes('fb2') || ext === 'fbz') return true;
    return Boolean(view?.book && !view.book.resolveCFI);
  }

  function readerResolveFb2Href(loc) {
    return resolveFb2Href(loc, isFb2Book());
  }

  function readerPositionFromLocation(loc) {
    const payload = sharedPositionFromLocation(loc, isFb2Active());
    if (payload.position && isMalformedLocationCfi(payload.position)) {
      payload.position = '';
    }
    return enrichAndroidPositionPayload(payload, loc, view?.renderer, layoutMode());
  }

  window.__READER_GET_CURRENT_POSITION__ = () => (
    view?.lastLocation ? readerPositionFromLocation(view.lastLocation) : null
  );

  function posLog(phase, data) {
    try {
      window.__DEBUG_LOG__?.('P1', `reader:pos:${phase}`, phase, {
        bookId,
        ...data,
      });
    } catch { /* */ }
  }

  function savedFraction(saved) {
    if (
      saved
      && saved.fraction != null
      && saved.fraction !== ''
      && Number.isFinite(Number(saved.fraction))
    ) {
      return normalizeFraction(saved.fraction);
    }
    const progress = Number(saved?.progress);
    if (Number.isFinite(progress)) return progressToFraction(progress);
    return 0;
  }

  function writePositionImmediate(payload) {
    const reason = payload._reason || '';
    const f = normalizeFraction(payload.fraction ?? 0);
    const body = {
      position: String(payload.position || ''),
      progress: fractionToProgress(f),
      fraction: f,
      positionSaveReason: payload._reason || payload.positionSaveReason || '',
    };
    if (payload.fb2Href) body.fb2Href = payload.fb2Href;
    if (Number.isFinite(Number(payload.sectionIndex))) body.sectionIndex = Number(payload.sectionIndex);
    if (Number.isInteger(Number(payload.textOffset)) && Number(payload.textOffset) >= 0) {
      body.textOffset = Number(payload.textOffset);
    }
    if (typeof payload.textQuote === 'string') body.textQuote = payload.textQuote.slice(0, 256);
    if (Number.isInteger(Number(payload.textSectionLength)) && Number(payload.textSectionLength) >= 0) {
      body.textSectionLength = Number(payload.textSectionLength);
    }
    if (Number.isFinite(Number(payload.sectionPageFraction))) {
      body.sectionPageFraction = Number(payload.sectionPageFraction);
    }
    if (Number.isFinite(Number(payload.paginatorPage))) body.paginatorPage = Number(payload.paginatorPage);
    if (Number.isFinite(Number(payload.paginatorPages))) body.paginatorPages = Number(payload.paginatorPages);
    if (typeof payload.layoutMode === 'string' && payload.layoutMode) body.layoutMode = payload.layoutMode;
    posLog('save', {
      reason,
      fraction: body.fraction,
      fb2Href: body.fb2Href ? String(body.fb2Href).slice(0, 40) : null,
      hasCfi: Boolean(body.position),
    });
    if (typeof window.__READER_WRITE_POSITION__ === 'function') {
      window.__READER_WRITE_POSITION__(body);
      return;
    }
    void api('POST', '/position', body).catch(() => {});
  }

  /** Last position the user intentionally reached (or a verified restore). */
  let committedPosition = null;
  /** Bookmark/annotation deep-link: do not persist as reading progress until a user page turn. */
  let previewPositionUntilUserTurn = false;

  function isBackwardPageDrift(prev, next) {
    if (!prev || !next) return false;
    if (Number(prev.sectionIndex) !== Number(next.sectionIndex)) return false;
    const prevPage = Number(prev.paginatorPage);
    const nextPage = Number(next.paginatorPage);
    if (
      Number.isFinite(prevPage)
      && Number.isFinite(nextPage)
      && Number(prev.paginatorPages) === Number(next.paginatorPages)
      && nextPage < prevPage
      && prevPage - nextPage <= 2
    ) {
      return true;
    }
    const prevOff = Number(prev.textOffset);
    const nextOff = Number(next.textOffset);
    return Number.isInteger(prevOff)
      && Number.isInteger(nextOff)
      && nextOff < prevOff
      && prevOff - nextOff <= 2500;
  }

  function commitReadingPosition(payload, reason) {
    if (!payload) return;
    committedPosition = { ...payload };
    writePositionImmediate({ ...payload, _reason: reason });
  }

  function savePosition(payload, reason) {
    if (positionSaveSuppression.isSuppressed()) return;
    const userTurn = reason === 'page' || reason === 'snap' || reason === 'scroll';
    if (previewPositionUntilUserTurn) {
      if (!userTurn) return;
      previewPositionUntilUserTurn = false;
    }
    if (
      !userTurn
      && isLayoutChurning()
      && (layoutAnchorSticky || committedPosition)
      && isLayoutAnchorJump(layoutAnchorSticky || payloadAsAnchor(committedPosition), payloadAsAnchor(payload))
    ) {
      posLog('save-skip-layout-churn', { reason, fraction: payload?.fraction });
      return;
    }
    clearTimeout(syncTimer);
    const withReason = { ...payload, _reason: reason };
    if (
      committedPosition
      && reason !== 'page'
      && reason !== 'snap'
      && reason !== 'scroll'
      && isBackwardPageDrift(committedPosition, payload)
    ) {
      posLog('save-skip-drift', {
        reason,
        committedPage: committedPosition.paginatorPage,
        nextPage: payload.paginatorPage,
        committedOffset: committedPosition.textOffset,
        nextOffset: payload.textOffset,
      });
      return;
    }
    if (reason === 'page' || reason === 'snap' || reason === 'scroll' || reason === 'navigation') {
      committedPosition = { ...payload };
      writePositionImmediate(withReason);
      return;
    }
    syncTimer = setTimeout(() => {
      if (
        committedPosition
        && isBackwardPageDrift(committedPosition, withReason)
      ) {
        posLog('save-skip-drift', { reason: reason || 'debounced' });
        return;
      }
      committedPosition = { ...withReason };
      writePositionImmediate(withReason);
    }, 3000);
  }
  function ackParentFlush() {
    try {
      window.__READER_ACK_FLUSH__?.();
    } catch {
      /* ignore */
    }
  }

  function flushSavePosition() {
    clearTimeout(syncTimer);
    syncTimer = null;
    // Always ack parent flush waiters — early return without notify left close stuck for 2s.
    if (positionSaveSuppression.isSuppressed()) {
      ackParentFlush();
      return;
    }
    if (previewPositionUntilUserTurn) {
      ackParentFlush();
      return;
    }
    if (isLayoutChurning() && committedPosition) {
      posLog('flush-keep-committed', { reason: 'layout-churn' });
      writePositionImmediate({ ...committedPosition, _reason: 'flush' });
      return;
    }
    const loc = view?.lastLocation;
    if (!loc) {
      ackParentFlush();
      return;
    }
    const payload = readerPositionFromLocation(loc);
    if (!payload.position && payload.fraction <= 0) {
      ackParentFlush();
      return;
    }
    if (committedPosition && isBackwardPageDrift(committedPosition, payload)) {
      posLog('flush-keep-committed', {
        committedPage: committedPosition.paginatorPage,
        currentPage: payload.paginatorPage,
      });
      writePositionImmediate({ ...committedPosition, _reason: 'flush' });
      return;
    }
    posLog('flush', { fraction: payload.fraction });
    committedPosition = { ...payload };
    writePositionImmediate({ ...payload, _reason: 'flush' });
  }
  window.__READER_FLUSH_POSITION__ = flushSavePosition;
  window.addEventListener('pagehide', flushSavePosition);
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    if (e.data?.type === 'inpx-reader-flush-position') flushSavePosition();
  });
  async function loadSavedPosition() {
    try {
      const d = await api('GET', '/position');
      if (
        d?.sectionIndex != null
        && d?.textOffset != null
        && Number.isInteger(Number(d.sectionIndex))
        && Number(d.sectionIndex) >= 0
        && Number.isInteger(Number(d?.textOffset))
        && Number(d.textOffset) >= 0
      ) {
        posLog('load', {
          source: 'textAnchor',
          sectionIndex: Number(d.sectionIndex),
          textOffset: Number(d.textOffset),
        });
        return d;
      }
      const fb2Href = String(d?.fb2Href || '').trim();
      if (fb2Href && isFb2Href(fb2Href)) {
        posLog('load', { source: 'fb2Href', fraction: savedFraction(d), fb2Href: fb2Href.slice(0, 40) });
        return d;
      }
      const frac = savedFraction(d);
      if (frac > 0) {
        posLog('load', { source: 'fraction', fraction: frac });
        return d;
      }
      const pos = String(d?.position || '').trim();
      if (pos && !isAppReaderPosition(pos)) {
        posLog('load', { source: 'cfi', fraction: frac });
        return d;
      }
      posLog('load', { source: 'none' });
      return null;
    } catch { return null; }
  }

  function isAppReaderPosition(pos) {
    return /^(?:app:)?ch\d+:p\d+$/.test(String(pos || '').trim());
  }

  /** view.goTo(target) с повтором — WebView иногда не готов с первого раза. */
  async function goToReaderTarget(target, opts = {}) {
    if (!view || target == null) return false;
    const retries = Math.max(1, Number(opts.retries) || 5);
    for (let attempt = 0; attempt < retries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 100 * attempt));
      }
      try {
        const resolved = await view.goTo(target);
        if (resolved) return true;
      } catch {
        /* retry */
      }
    }
    return false;
  }

  /** Переход к заметке: Foliate showAnnotation (меню + range), иначе goTo. */
  async function revealAnnotationAt(cfi, opts = {}) {
    if (!view || !cfi) return false;
    const retries = Math.max(1, Number(opts.retries) || 8);
    if (typeof view.showAnnotation === 'function') {
      for (let attempt = 0; attempt < retries; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * attempt));
        try {
          await view.showAnnotation({ value: cfi });
          document.documentElement.classList.add('annotation-goto-flash');
          clearTimeout(revealAnnFlashTimer);
          revealAnnFlashTimer = setTimeout(() => {
            document.documentElement.classList.remove('annotation-goto-flash');
          }, 1200);
          return true;
        } catch {
          /* retry / fall through */
        }
      }
    }
    return goToReaderTarget(cfi, { retries });
  }
  let revealAnnFlashTimer = null;

  function getLoadedSectionDoc() {
    const contents = view?.renderer?.getContents?.() || [];
    return contents[0]?.doc || null;
  }

  function waitForRelocateQuiet(quietMs = 400, maxMs = 3000) {
    return new Promise((resolve) => {
      let quietTimer = null;
      const deadline = setTimeout(finish, maxMs);
      function finish() {
        clearTimeout(deadline);
        clearTimeout(quietTimer);
        view?.removeEventListener('relocate', onRelocate);
        resolve();
      }
      function onRelocate() {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      }
      view?.addEventListener('relocate', onRelocate);
      quietTimer = setTimeout(finish, quietMs);
    });
  }

  async function waitForFontsReady(doc, timeoutMs = 2000) {
    if (!doc?.fonts?.ready) return;
    try {
      await Promise.race([
        doc.fonts.ready,
        new Promise((r) => setTimeout(r, timeoutMs)),
      ]);
    } catch { /* */ }
  }

  async function waitForLayoutSettled(timeoutMs = 3000) {
    const doc = getLoadedSectionDoc();
    await waitForFontsReady(doc, Math.min(2000, timeoutMs));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await waitForRelocateQuiet(Math.min(450, Math.max(200, timeoutMs / 5)), timeoutMs);
  }

  async function navigateToReaderPosition(pos, opts = {}) {
    const { closePanelAfter = true, showToast = true, retries = 3 } = opts;
    if (showToast) toast(rt('readerJs.navigating'));
    const ok = await goToReaderTarget(pos, { retries });
    if (ok && closePanelAfter) closePanel();
    return ok;
  }

  /**
   * Same-layout reopen: textAnchor/scrollToRect often lands one page early.
   * When paginator page count matches the save, snap to the exact saved page.
   */
  async function tryRestorePaginatorPage(saved) {
    const renderer = view?.renderer;
    if (!renderer || renderer.scrolled || typeof renderer.scrollToPageIndex !== 'function') return false;
    const savedPage = Number(saved?.paginatorPage);
    const savedPages = Number(saved?.paginatorPages);
    const sectionIndex = Number(saved?.sectionIndex);
    if (!Number.isFinite(savedPage) || !Number.isFinite(savedPages)) return false;
    if (savedPages < 3 || savedPage < 1 || savedPage > savedPages - 2) return false;
    if (Number(renderer.pages) !== savedPages) return false;
    if (
      Number.isInteger(sectionIndex)
      && sectionIndex >= 0
      && Number(view?.lastLocation?.section?.current) !== sectionIndex
    ) {
      return false;
    }
    await renderer.scrollToPageIndex(savedPage);
    await waitForLayoutSettled(600);
    return Number(renderer.page) === savedPage;
  }

  /** If text-anchor restore sat one page early, nudge forward once. */
  async function nudgeIfLandedOnePageEarly(saved) {
    const renderer = view?.renderer;
    if (!renderer) return false;
    const savedPage = Number(saved?.paginatorPage);
    const savedPages = Number(saved?.paginatorPages);
    const curPage = Number(renderer.page);
    const curPages = Number(renderer.pages);
    if (
      Number.isFinite(savedPage)
      && Number.isFinite(savedPages)
      && savedPages === curPages
      && curPage === savedPage - 1
      && typeof renderer.next === 'function'
    ) {
      await renderer.next();
      await waitForLayoutSettled(400);
      return Number(renderer.page) === savedPage;
    }
    const savedOff = Number(saved?.textOffset);
    const landedOff = Number(view?.lastLocation?.textOffset);
    const sectionIndex = Number(saved?.sectionIndex);
    if (
      !Number.isInteger(savedOff)
      || !Number.isInteger(landedOff)
      || landedOff >= savedOff - 40
      || Number(view?.lastLocation?.section?.current) !== sectionIndex
      || typeof renderer.next !== 'function'
    ) {
      return false;
    }
    await renderer.next();
    await waitForLayoutSettled(400);
    const after = Number(view?.lastLocation?.textOffset);
    if (Number.isInteger(after) && after > savedOff + 120 && typeof renderer.prev === 'function') {
      await renderer.prev();
      await waitForLayoutSettled(400);
      return false;
    }
    return true;
  }

  async function restoreFb2ReadingPosition(saved) {
    const fb2Href = String(saved?.fb2Href || '').trim();
    const frac = savedFraction(saved);
    const sectionIndex = Number(saved?.sectionIndex);
    const textOffset = Number(saved?.textOffset);
    const linearCount = (view?.book?.sections || []).filter((s) => s?.linear !== 'no').length;
    const currentTextLength = Number(
      view?.renderer?.sectionTextLength ?? view?.lastLocation?.textSectionLength,
    );
    const staleExplodedSection = isStaleExplodedFb2Anchor(saved, {
      linearCount,
      currentTextLength,
    });
    if (
      saved?.sectionIndex != null
      && saved?.textOffset != null
      && Number.isInteger(sectionIndex)
      && sectionIndex >= 0
      && Number.isInteger(textOffset)
      && textOffset >= 0
      && !staleExplodedSection
      && typeof view?.goToTextAnchor === 'function'
    ) {
      try {
        await view.goToTextAnchor(sectionIndex, textOffset, String(saved?.textQuote || ''));
        await waitForLayoutSettled(1200);
        if (await tryRestorePaginatorPage(saved)) return 'paginatorPage';
        if (await nudgeIfLandedOnePageEarly(saved)) return 'textAnchor-nudge';
        if (isTextAnchorLandingVerified(saved, view?.lastLocation)) return 'textAnchor';
      } catch {
        /* continue with coarse fallbacks */
      }
    }
    // Fraction is the first coarse fallback; fb2Href only identifies a section/block.
    if (frac > 0) {
      await seekReaderToFraction(frac);
      await waitForLayoutSettled(1000);
      if (await tryRestorePaginatorPage(saved)) return 'paginatorPage';
      return 'fraction';
    }
    if (fb2Href && isFb2Href(fb2Href)) {
      const ok = await goToReaderTarget(fb2Href, { retries: 8 });
      if (ok) {
        await waitForLayoutSettled(1000);
        if (await tryRestorePaginatorPage(saved)) return 'paginatorPage';
        return 'fb2Href';
      }
    }
    return null;
  }

  /**
   * Restore reading position.
   * @returns {Promise<boolean>} true — после restore нужна доводка saved (paginator/nudge).
   *   false — явный переход (?pos= закладка/заметка): saved settle запрещён.
   */
  async function restoreReadingPosition(saved, urlPos) {
    const urlFracRaw = new URLSearchParams(location.search).get('frac');
    const urlFb2 = new URLSearchParams(location.search).get('fb2');
    const urlFrac = urlFracRaw != null ? normalizeFraction(Number(urlFracRaw)) : 0;

    if (urlPos) {
      const isAnnotationTarget = annotationsData.some((a) => a?.cfi && a.cfi === urlPos);
      const ok = isAnnotationTarget
        ? await revealAnnotationAt(urlPos, { retries: 8 })
        : await goToReaderTarget(urlPos, { retries: 8 });
      posLog('restore', { method: isAnnotationTarget ? 'urlPos-annotation' : 'urlPos', ok });
      if (ok) {
        previewPositionUntilUserTurn = true;
        await waitForLayoutSettled(800);
        return false;
      }
      // CFI/href не сработал — откат к сохранённой позиции чтения.
      if (saved) return restoreReadingPosition(saved, null);
      return false;
    }

    let effectiveSaved = saved ? { ...saved } : null;
    if (effectiveSaved) {
      const savedFrac = savedFraction(effectiveSaved);
      if (urlFrac > savedFrac + 1e-5) {
        effectiveSaved.fraction = urlFrac;
        effectiveSaved.progress = fractionToProgress(urlFrac);
      }
      if (urlFb2 && isFb2Href(urlFb2)) {
        effectiveSaved.fb2Href = urlFb2;
      }
    } else if (urlFrac > 0 || (urlFb2 && isFb2Href(urlFb2))) {
      effectiveSaved = {
        position: '',
        progress: fractionToProgress(urlFrac),
        fraction: urlFrac,
        fb2Href: urlFb2 && isFb2Href(urlFb2) ? urlFb2 : null,
      };
    }

    if (!effectiveSaved) {
      await view.renderer.next();
      posLog('restore', { method: 'next', ok: true });
      return false;
    }
    const cfi = String(effectiveSaved.position || '').trim();
    const fb2Href = String(effectiveSaved.fb2Href || '').trim();
    const frac = savedFraction(effectiveSaved);
    let method = 'none';
    try {
      if (isFb2Active()) {
        method = await restoreFb2ReadingPosition(effectiveSaved) || 'none';
        if (!method || method === 'none') {
          if (cfi && !isAppReaderPosition(cfi) && !isMalformedLocationCfi(cfi)) {
            const ok = await goToReaderTarget(cfi, { retries: 5 });
            method = ok ? 'cfi-fallback' : 'next';
            if (!ok) await view.renderer.next();
          } else {
            await view.renderer.next();
            method = 'next';
          }
        }
      } else if (cfi && !isAppReaderPosition(cfi) && !isMalformedLocationCfi(cfi)) {
        await view.init({ lastLocation: cfi });
        method = 'cfi';
      } else if (cfi && isMalformedLocationCfi(cfi)) {
        posLog('restore', { method: 'cfi-malformed-skip', cfi: cfi.slice(0, 48) });
        if (frac > 0) {
          await view.init({ lastLocation: { fraction: frac } });
          method = 'fraction';
        } else {
          await view.renderer.next();
          method = 'next';
        }
      } else if (fb2Href && isFb2Href(fb2Href)) {
        await view.goTo(fb2Href);
        method = 'fb2Href';
      } else if (frac > 0 && fb2FlatToc.length >= 2) {
        const idx = Math.min(
          fb2FlatToc.length - 1,
          Math.max(0, Math.floor(frac * fb2FlatToc.length)),
        );
        const href = fb2FlatToc[idx]?.href;
        if (href) {
          await view.goTo(href);
          method = 'fb2FlatToc';
        } else {
          await view.init({ lastLocation: { fraction: frac } });
          method = 'fraction';
        }
      } else if (frac > 0) {
        await view.init({ lastLocation: { fraction: frac } });
        method = 'fraction';
      } else {
        await view.renderer.next();
        method = 'next';
      }
      if (!isFb2Active()) {
        if (await tryRestorePaginatorPage(effectiveSaved)) method = 'paginatorPage';
        else if (await nudgeIfLandedOnePageEarly(effectiveSaved)) method = `${method}-nudge`;
      }
      let landed = readingFractionFromLocation(view?.lastLocation);
      const exactMethod = method === 'textAnchor'
        || method === 'paginatorPage'
        || method === 'textAnchor-nudge';
      if (!exactMethod && frac > 0 && Math.abs(landed - frac) > 0.03) {
        if (isFb2Active()) {
          const retry = await restoreFb2ReadingPosition(effectiveSaved);
          if (retry) method = `${retry}-retry`;
        } else if (fb2Href && isFb2Href(fb2Href)) {
          await view.goTo(fb2Href);
          method = 'fb2Href-retry';
        } else if (fb2FlatToc.length >= 2) {
          await seekReaderToFraction(frac);
          method = 'fb2FlatToc-retry';
        } else {
          await view.goToFraction(frac);
          method = 'fraction-retry';
        }
        landed = readingFractionFromLocation(view?.lastLocation);
      }
      posLog('restore-done', {
        method,
        restored: true,
        targetFraction: frac,
        landedFraction: landed,
        landedPage: Number(view?.renderer?.page),
        targetPage: Number(effectiveSaved?.paginatorPage),
      });
      if (landed > 0) {
        setProgressFromFraction(landed, view?.lastLocation?.tocItem);
        updateBookPageDisplay(view.lastLocation);
      }
    } catch (e) {
      try {
        if (isFb2Active()) {
          await restoreFb2ReadingPosition(effectiveSaved);
        } else if (fb2Href && isFb2Href(fb2Href)) {
          await view.goTo(fb2Href);
        } else if (frac > 0) {
          await view.goToFraction(frac);
        } else {
          await view.renderer.next();
        }
        const landed = readingFractionFromLocation(view?.lastLocation);
        if (landed > 0) {
          setProgressFromFraction(landed, view?.lastLocation?.tocItem);
          updateBookPageDisplay(view.lastLocation);
        }
        posLog('restore', { method: 'fallback-goto', ok: landed > 0, landedFraction: landed });
      } catch {
        await view.renderer.next();
        posLog('restore', { method: 'fallback-next', ok: false, msg: e instanceof Error ? e.message : String(e) });
      }
    }
    return true;
  }

  /* ===== Auto-mark as read when finished ===== */
  // Handled server-side in position save endpoint when progress >= 95%

  /* ===== Bookmarks ===== */
  async function loadBookmarks() {
    try { const d = await api('GET', '/bookmarks'); bookmarksData = Array.isArray(d) ? d : []; } catch { bookmarksData = []; }
  }

  function addBookmark() {
    if (!view?.lastLocation) return;
    const loc = view.lastLocation;
    const pos = loc.cfi || '';
    const title = loc.tocItem?.label || rtp('readerJs.positionPct', { n: Math.round((loc.fraction ?? 0) * 100) });
    api('POST', '/bookmarks', { position: pos, title }).then(r => {
      if (r.ok) {
        postReaderHaptic('medium');
        toast(rt('readerJs.bookmarkAdded'));
        loadBookmarks().then(renderBmTab);
      }
    }).catch(() => {});
  }

  async function removeBookmark(id) {
    const removed = bookmarksData.find(b => b.id === id);
    bookmarksData = bookmarksData.filter(b => b.id !== id);
    renderBmTab();
    try {
      await api('DELETE', '/bookmarks/' + id);
    } catch {
      if (removed) {
        bookmarksData = [...bookmarksData, removed].sort((a, b) => (a.id || 0) - (b.id || 0));
        renderBmTab();
      }
    }
  }

  function goToBookmark(bm) {
    if (!view || !bm?.position) return;
    void goToReaderTarget(bm.position);
    closePanel();
  }

  function getSnapshot() {
    const ch = (ftChapter?.textContent || toolbarChapter?.textContent || '').trim() || rt('readerJs.currentPos');
    return { chapter: ch, percent: Math.round(fractionToProgress(currentFraction)) };
  }

  function updateBmCard() {
    const c = $('bookmarks-content'); if (!c) return;
    const s = getSnapshot();
    const t = c.querySelector('.bm-current-title');
    const m = c.querySelector('.bm-current-meta');
    if (t) t.textContent = s.chapter;
    if (m) m.textContent = rtp('readerJs.pctOfBook', { n: s.percent });
  }

  function renderBmTab() {
    const c = $('bookmarks-content'); if (!c) return;
    const s = getSnapshot();
    let h = '<div class="bm-current-card"><div class="bm-current-kicker">' + esc(rt('readerJs.readingNow')) + '</div>' +
      '<div class="bm-current-title">' + esc(s.chapter) + '</div>' +
      '<div class="bm-current-meta">' + esc(rtp('readerJs.pctOfBook', { n: s.percent })) + '</div>' +
      '<button class="bm-primary-btn" id="bm-add-btn" type="button">' + esc(rt('readerJs.addBmBtn')) + '</button></div>';
    if (!bookmarksData.length) { h += '<div class="bm-empty">' + esc(rt('readerJs.noBookmarks')) + '</div>'; }
    else {
      const n = bookmarksData.length;
      h += '<div class="bm-section-title">' + esc(rtp('readerJs.savedBookmarks', { n, word: rPlural('bookmark', n) })) + '</div>';
      bookmarksData.forEach(bm => {
        h += '<div class="bm-item"><button class="bm-item-body" type="button" data-bm-go="' + bm.id + '">' +
          '<div class="bm-item-title">' + esc(bm.title || rt('readerJs.bookmarkFallback')) + '</div>' +
          '<div class="bm-item-date">' + esc(fmtDate(bm.createdAt || bm.created_at)) + '</div></button>' +
          '<button class="bm-item-del" type="button" data-bm-del="' + bm.id + '" title="' + esc(rt('readerJs.delete')) + '">&times;</button></div>';
      });
    }
    c.innerHTML = h;
    c.querySelectorAll('[data-bm-go]').forEach(el => el.addEventListener('click', () => { const bm = bookmarksData.find(b => b.id === Number(el.dataset.bmGo)); if (bm) goToBookmark(bm); }));
    c.querySelectorAll('[data-bm-del]').forEach(el => el.addEventListener('click', () => removeBookmark(Number(el.dataset.bmDel))));
    $('bm-add-btn')?.addEventListener('click', addBookmark);
  }

  /* ===== Book search (full-text) ===== */
  function runBookSearch(query) {
    const c = $('search-content');
    if (!c) return;
    const q = String(query || '').trim();
    if (!view?.book) return;
    if (q.length < 2) {
      try { view.clearSearch?.(); } catch { /* */ }
      c.innerHTML = '<div class="bm-empty">' + esc(q ? rt('readerJs.searchMinChars') : rt('readerJs.searchHint')) + '</div>';
      return;
    }
    const seq = ++searchSeq;
    c.innerHTML = '<div class="bm-empty">' + esc(rt('readerJs.searching')) + '</div>';
    (async () => {
      const groups = [];
      let total = 0;
      try {
        for await (const r of view.search({ query: q })) {
          if (seq !== searchSeq) return;
          if (r === 'done') break;
          if (r && r.subitems) {
            groups.push(r);
            total += r.subitems.length;
            renderSearchResults(c, groups, total, seq, false);
          }
        }
      } catch (e) {
        console.error(e);
      }
      if (seq !== searchSeq) return;
      renderSearchResults(c, groups, total, seq, true);
    })();
  }

  function renderExcerpt(ex) {
    if (!ex) return '';
    if (typeof ex === 'string') return esc(ex);
    return '<span class="search-ctx">' + esc(ex.pre || '') + '</span>' +
      '<mark>' + esc(ex.match || '') + '</mark>' +
      '<span class="search-ctx">' + esc(ex.post || '') + '</span>';
  }

  function renderSearchResults(c, groups, total, seq, done) {
    if (seq !== searchSeq || !c) return;
    if (!total) {
      c.innerHTML = '<div class="bm-empty">' + esc(done ? rt('readerJs.searchNoResults') : rt('readerJs.searching')) + '</div>';
      return;
    }
    let h = '<div class="bm-section-title">' + esc(rtp('readerJs.searchResults', { n: total, word: rPlural('result', total) })) + '</div>';
    groups.forEach(g => {
      if (g.label) h += '<div class="search-group">' + esc(g.label) + '</div>';
      (g.subitems || []).forEach(it => {
        h += '<button class="search-item" type="button" data-search-cfi="' + esc(it.cfi) + '">' + renderExcerpt(it.excerpt) + '</button>';
      });
    });
    c.innerHTML = h;
    c.querySelectorAll('[data-search-cfi]').forEach(el => el.addEventListener('click', () => {
      const cfi = el.dataset.searchCfi;
      if (cfi) void navigateToReaderPosition(cfi);
    }));
  }

  /* ===== Annotations (highlights & notes) ===== */
  const HL_FILL = {
    yellow: 'rgba(255,214,10,.45)',
    green: 'rgba(52,211,153,.45)',
    blue: 'rgba(96,165,250,.45)',
    pink: 'rgba(244,114,182,.5)'
  };
  function hlFill(color) { return HL_FILL[color] || HL_FILL.yellow; }
  let pendingNote = null;

  async function loadAnnotations() {
    try { const d = await api('GET', '/annotations'); annotationsData = Array.isArray(d) ? d : []; } catch { annotationsData = []; }
  }

  function drawAnnotation(a) {
    if (!view || !a?.cfi) return;
    try { view.addAnnotation({ value: a.cfi, color: a.color }); } catch { /* */ }
  }
  function applyAllAnnotations() { annotationsData.forEach(drawAnnotation); }
  let overlayAnnTimer = null;
  function scheduleApplyAnnotations() {
    clearTimeout(overlayAnnTimer);
    overlayAnnTimer = setTimeout(() => applyAllAnnotations(), 80);
  }
  window.__READER_RELOAD_ANNOTATIONS__ = async function reloadReaderAnnotations() {
    await loadAnnotations();
    applyAllAnnotations();
  };

  function hideSelMenu() {
    const m = $('reader-sel-menu');
    if (m) { m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true'); }
  }
  function rectToPage(rect, doc) {
    const win = doc?.defaultView;
    const iframe = win?.frameElement;
    if (!iframe || !rect) return { left: rect?.left || 0, top: rect?.top || 0, right: rect?.right || 0, bottom: rect?.bottom || 0, cx: (rect?.left || 0) + (rect?.width || 0) / 2 };
    const fr = iframe.getBoundingClientRect();
    return {
      left: fr.left + rect.left, top: fr.top + rect.top,
      right: fr.left + rect.right, bottom: fr.top + rect.bottom,
      cx: fr.left + rect.left + rect.width / 2
    };
  }
  function showSelMenuAt(pageRect, isExisting) {
    const m = $('reader-sel-menu');
    if (!m) return;
    const rem = m.querySelector('#rsm-remove');
    if (rem) rem.hidden = !isExisting;
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
    const mw = m.offsetWidth || 240;
    const mh = m.offsetHeight || 44;
    const host = readerBody?.getBoundingClientRect?.();
    const minX = (host?.left ?? 0) + 8;
    const maxX = (host?.right ?? innerWidth) - mw - 8;
    const minY = (host?.top ?? 0) + 8;
    const maxY = (host?.bottom ?? innerHeight) - mh - 8;
    let left = pageRect.cx - mw / 2;
    left = Math.max(minX, Math.min(maxX, left));
    let top = pageRect.bottom + 10;
    if (top + mh > maxY) top = pageRect.top - mh - 10;
    if (top < minY) top = Math.min(maxY, pageRect.bottom + 10);
    m.style.left = left + 'px';
    m.style.top = top + 'px';
  }
  function maybeShowSelMenu(doc) {
    // Во время TTS фразы раньше выделялись через Selection — меню заметок всплывало само.
    if (ttsChainActive) { hideSelMenu(); return; }
    if (panelOverlay.classList.contains('is-open') || isFootnoteOverlayOpen()) { hideSelMenu(); return; }
    const sel = doc.getSelection?.();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      if (!activeSel?.existing) { hideSelMenu(); activeSel = null; }
      return;
    }
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (!text) { hideSelMenu(); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { hideSelMenu(); return; }
    const index = docIndexMap.get(doc);
    if (index == null) { hideSelMenu(); return; }
    activeSel = { doc, index, range: range.cloneRange(), text, existing: null };
    showSelMenuAt(rectToPage(rect, doc), false);
  }
  function openSelMenuForExisting(a, range) {
    if (ttsChainActive) return;
    if (panelOverlay.classList.contains('is-open')) return;
    const doc = range?.startContainer?.ownerDocument || range?.commonAncestorContainer?.ownerDocument;
    activeSel = { doc, index: doc ? docIndexMap.get(doc) : null, range, text: a.text, existing: a };
    const rect = range?.getBoundingClientRect?.();
    if (rect) showSelMenuAt(rectToPage(rect, doc), true);
  }

  async function createHighlightFromSel(color) {
    if (!activeSel || !view) { hideSelMenu(); return; }
    if (activeSel.existing) { recolorAnnotation(activeSel.existing, color); return; }
    if (activeSel.index == null) { hideSelMenu(); return; }
    const cfi = view.getCFI(activeSel.index, activeSel.range);
    const text = activeSel.text;
    if (!cfi) { hideSelMenu(); return; }
    drawAnnotation({ cfi, color });
    hideSelMenu();
    try { view.deselect?.(); } catch { /* */ }
    try {
      const r = await api('POST', '/annotations', { cfi, text, color, note: '' });
      annotationsData.push({ id: r.id, cfi, text, color, note: '', createdAt: new Date().toISOString() });
      toast(rt('readerJs.highlightAdded'));
      if (activePanelTab === 'notes') renderNotesTab();
    } catch (e) { console.error(e); }
    activeSel = null;
  }
  async function recolorAnnotation(a, color) {
    a.color = color;
    drawAnnotation(a);
    hideSelMenu();
    activeSel = null;
    try { await api('PATCH', '/annotations/' + a.id, { color }); if (activePanelTab === 'notes') renderNotesTab(); } catch (e) { console.error(e); }
  }
  async function copySelText() {
    const text = activeSel?.text || activeSel?.existing?.text || '';
    hideSelMenu();
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast(rt('readerJs.copied')); }
    catch { toast(rt('readerJs.copyFailed')); }
  }
  async function shareSelText() {
    const quote = String(activeSel?.text || activeSel?.existing?.text || '').trim();
    hideSelMenu();
    if (!quote) return;
    const title = String(window.__READER_BOOK_TITLE || '').trim();
    const author = String(window.__READER_BOOK_AUTHOR || '').trim();
    const parts = [`«${quote}»`];
    if (author || title) {
      parts.push('— ' + [author, title].filter(Boolean).join(', '));
    }
    const text = parts.join('\n');
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'inpx-reader-share', text, title: title || 'Цитата' }, '*');
        return;
      }
    } catch { /* fall through */ }
    try {
      if (navigator.share) {
        await navigator.share({ title: title || 'Цитата', text });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(rt('readerJs.copied'));
    } catch {
      toast(rt('readerJs.copyFailed'));
    }
  }
  async function removeActiveAnnotation() {
    const a = activeSel?.existing;
    hideSelMenu();
    activeSel = null;
    if (!a) return;
    try { view.deleteAnnotation?.({ value: a.cfi }); } catch { /* */ }
    annotationsData = annotationsData.filter(x => x.id !== a.id);
    if (activePanelTab === 'notes') renderNotesTab();
    try { await api('DELETE', '/annotations/' + a.id); } catch (e) { console.error(e); }
    toast(rt('readerJs.annotationRemoved'));
  }

  function openNoteEditor() {
    const ed = $('reader-note-editor');
    if (!ed || !activeSel) return;
    if (activeSel.existing) {
      pendingNote = { mode: 'existing', a: activeSel.existing };
      $('rne-quote').textContent = activeSel.existing.text || '';
      $('rne-text').value = activeSel.existing.note || '';
    } else {
      if (activeSel.index == null || !view) return;
      const cfi = view.getCFI(activeSel.index, activeSel.range);
      if (!cfi) return;
      pendingNote = { mode: 'new', cfi, text: activeSel.text, color: 'yellow' };
      $('rne-quote').textContent = activeSel.text || '';
      $('rne-text').value = '';
    }
    hideSelMenu();
    ed.classList.add('is-open');
    ed.setAttribute('aria-hidden', 'false');
    setTimeout(() => { try { $('rne-text').focus(); } catch { /* */ } }, 60);
  }
  function closeNoteEditor() {
    const ed = $('reader-note-editor');
    ed?.classList.remove('is-open');
    ed?.setAttribute('aria-hidden', 'true');
    pendingNote = null;
    requestEinkPanelRefresh();
  }
  async function saveNoteEditor() {
    if (!pendingNote) { closeNoteEditor(); return; }
    const note = ($('rne-text')?.value || '').trim();
    if (pendingNote.mode === 'new') {
      const { cfi, text, color } = pendingNote;
      drawAnnotation({ cfi, color });
      try { view.deselect?.(); } catch { /* */ }
      try {
        const r = await api('POST', '/annotations', { cfi, text, color, note });
        annotationsData.push({ id: r.id, cfi, text, color, note, createdAt: new Date().toISOString() });
        toast(rt('readerJs.noteSaved'));
      } catch (e) { console.error(e); }
    } else {
      const a = pendingNote.a;
      a.note = note;
      try { await api('PATCH', '/annotations/' + a.id, { note }); toast(rt('readerJs.noteSaved')); } catch (e) { console.error(e); }
    }
    activeSel = null;
    closeNoteEditor();
    if (activePanelTab === 'notes') renderNotesTab();
  }

  function renderNotesTab() {
    const c = $('notes-content');
    if (!c) return;
    let h = '<div class="notes-io-bar">' +
      '<button type="button" class="notes-io-btn" id="notes-export-btn">' + esc(rt('readerJs.notesExport')) + '</button>' +
      '<button type="button" class="notes-io-btn" id="notes-import-btn">' + esc(rt('readerJs.notesImport')) + '</button>' +
      '<input type="file" id="notes-import-file" accept="application/json,.json" hidden></div>';
    if (!annotationsData.length) {
      h += '<div class="bm-empty">' + esc(rt('readerJs.noNotes')) + '<div class="bm-empty-hint">' + esc(rt('readerJs.notesHint')) + '</div></div>';
      c.innerHTML = h;
      initNotesImportExport();
      return;
    }
    const n = annotationsData.length;
    h += '<div class="bm-section-title">' + esc(rtp('readerJs.savedNotes', { n, word: rPlural('note', n) })) + '</div>';
    annotationsData.forEach(a => {
      h += '<div class="note-item note-color-' + esc(a.color) + '">' +
        '<button class="note-item-body" type="button" data-note-go="' + a.id + '">' +
        '<div class="note-quote">' + esc(a.text || '') + '</div>' +
        (a.note ? '<div class="note-text">' + esc(a.note) + '</div>' : '') +
        '<div class="bm-item-date">' + esc(fmtDate(a.createdAt || a.created_at)) + '</div></button>' +
        '<button class="bm-item-del" type="button" data-note-del="' + a.id + '" title="' + esc(rt('readerJs.delete')) + '">&times;</button></div>';
    });
    c.innerHTML = h;
    c.querySelectorAll('[data-note-go]').forEach(el => el.addEventListener('click', () => {
      const a = annotationsData.find(x => x.id === Number(el.dataset.noteGo));
      if (a?.cfi && view) {
        void revealAnnotationAt(a.cfi);
        closePanel();
      }
    }));
    c.querySelectorAll('[data-note-del]').forEach(el => el.addEventListener('click', () => removeAnnotationById(Number(el.dataset.noteDel))));
    initNotesImportExport();
  }
  async function removeAnnotationById(id) {
    const a = annotationsData.find(x => x.id === id);
    if (!a) return;
    try { view.deleteAnnotation?.({ value: a.cfi }); } catch { /* */ }
    annotationsData = annotationsData.filter(x => x.id !== id);
    renderNotesTab();
    try { await api('DELETE', '/annotations/' + id); } catch (e) { console.error(e); }
  }

  function initAnnotations() {
    const m = $('reader-sel-menu');
    m?.querySelectorAll('.rsm-color').forEach(b => b.addEventListener('click', () => createHighlightFromSel(b.dataset.color)));
    $('rsm-note')?.addEventListener('click', openNoteEditor);
    $('rsm-copy')?.addEventListener('click', copySelText);
    $('rsm-share')?.addEventListener('click', () => { void shareSelText(); });
    $('rsm-remove')?.addEventListener('click', removeActiveAnnotation);
    $('rne-cancel')?.addEventListener('click', closeNoteEditor);
    $('rne-save')?.addEventListener('click', saveNoteEditor);
    $('reader-note-editor')?.addEventListener('click', e => { if (e.target?.id === 'reader-note-editor') closeNoteEditor(); });
    document.addEventListener('pointerdown', e => {
      const sm = $('reader-sel-menu');
      if (sm && sm.classList.contains('is-open') && !sm.contains(e.target)) { hideSelMenu(); if (!activeSel?.existing) activeSel = null; }
    }, true);
  }

  let readerDictUiWired = false;
  function initDictionaryUi() {
    if (readerDictUiWired) return;
    readerDictUiWired = true;
    $('reader-dict-close')?.addEventListener('click', hideDictPopup);
    document.addEventListener('pointerdown', (e) => {
      const dp = $('reader-dict-popup');
      if (dp?.classList.contains('is-open') && !dp.contains(e.target)) hideDictPopup();
    }, true);
  }

  function wireViewAnnotations() {
    if (!view) return;
    view.addEventListener('draw-annotation', ({ detail }) => {
      const color = detail?.annotation?.color;
      if (color === 'underline') detail.draw(Overlayer.underline, { color: '#f43f5e' });
      else detail.draw(Overlayer.highlight, { color: hlFill(color) });
    });
    view.addEventListener('show-annotation', ({ detail }) => {
      const a = annotationsData.find(x => x.cfi === detail.value);
      if (a) openSelMenuForExisting(a, detail.range);
      else {
        const calibreAnn = calibreAnnotationsByValue.get(detail.value);
        if (calibreAnn?.note) toast(calibreAnn.note);
      }
    });
    view.addEventListener('create-overlay', () => scheduleApplyAnnotations());
  }

  function wireSelection(doc) {
    let selTimer = null;
    doc.addEventListener('selectionchange', () => {
      clearTimeout(selTimer);
      selTimer = setTimeout(() => maybeShowSelMenu(doc), 250);
    });
  }

  /* ===== TOC ===== */
  function updateTocHighlight() {
    const q = (tocSearchInput?.value || '').trim();
    if (tocView?.setCurrentHref && currentTocHref && !q) {
      try { tocView.setCurrentHref(currentTocHref); } catch { /* */ }
    }
    document.querySelectorAll('.toc-item').forEach(el => el.classList.toggle('is-active', !!currentTocHref && el.dataset.tocHref === currentTocHref));
  }
  function getTocIdx() { return tocData.findIndex(i => i.href === currentTocHref); }
  function updateTocBtnState() { const i = getTocIdx(); if (tocPrevBtn) tocPrevBtn.disabled = i <= 0; if (tocNextBtn) tocNextBtn.disabled = i === -1 || i >= tocData.length - 1; }
  function goTocIdx(i) { const item = tocData[i]; if (!item || !view) return; view.goTo(item.href).catch(console.error); if (panelOverlay.classList.contains('is-open') && activePanelTab === 'toc') closePanel(); }

  function renderTocTab() {
    const c = $('toc-content'); if (!c) return;
    if (!rawToc?.length && !tocData.length) { c.innerHTML = '<div class="bm-empty">' + esc(rt('readerJs.tocNotFound')) + '</div>'; updateTocBtnState(); return; }
    const q = (tocSearchInput?.value || '').trim().toLowerCase();
    if (q) {
      tocView = null;
      const items = tocData.filter(i => (i.label || '').toLowerCase().includes(q));
      if (!items.length) { c.innerHTML = '<div class="bm-empty">' + esc(rt('readerJs.tocEmpty')) + '</div>'; updateTocBtnState(); return; }
      let h = '<ul class="toc-list">';
      items.forEach(i => { h += '<li class="toc-item toc-item-depth-' + (i.depth || 1) + '" data-toc-href="' + esc(i.href) + '" tabindex="0" role="button">' + esc(i.label) + '</li>'; });
      h += '</ul>';
      c.innerHTML = h;
      c.querySelectorAll('.toc-item').forEach(el => {
        const go = () => { if (view) view.goTo(el.dataset.tocHref).catch(console.error); closePanel(); };
        el.addEventListener('click', go);
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      });
    } else if (rawToc?.length) {
      c.replaceChildren();
      tocView = createTOCView(rawToc, href => {
        if (view) view.goTo(href).catch(console.error);
        closePanel();
      });
      tocView.element.classList.add('toc-tree');
      c.append(tocView.element);
      if (currentTocHref) {
        try { tocView.setCurrentHref(currentTocHref); } catch { /* */ }
      }
    }
    updateTocHighlight(); updateTocBtnState();
  }

  /* ===== Panel ===== */
  function getPanelMeta(tab) {
    return {
      settings: { kicker: rt('readerJs.panelSettings'), title: rt('readerJs.panelSettingsTitle') },
      toc: { kicker: rt('readerJs.panelTocKicker'), title: rt('readerJs.panelTocTitle') },
      bookmarks: { kicker: rt('readerJs.panelBmKicker'), title: rt('readerJs.panelBmTitle') },
      search: { kicker: rt('readerJs.panelSearchKicker'), title: rt('readerJs.panelSearchTitle') },
      notes: { kicker: rt('readerJs.panelNotesKicker'), title: rt('readerJs.panelNotesTitle') }
    }[tab] || { kicker: '', title: '' };
  }
  const triggerMap = { settings: $('btn-settings'), toc: $('btn-toc'), search: $('btn-search') };

  function refreshTriggers() {
    Object.entries(triggerMap).forEach(([k, el]) => {
      if (!el) return;
      const on = panelOverlay.classList.contains('is-open') && activePanelTab === k;
      el.classList.toggle('is-active', on);
    });
  }
  let panelHistoryPushed = false;
  function openPanel(tab, { toggle = true } = {}) {
    const t = tab || 'toc';
    hideSelMenu();
    if (toggle && panelOverlay.classList.contains('is-open') && activePanelTab === t) { closePanel(); return; }
    const wasOpen = panelOverlay.classList.contains('is-open');
    panelOverlay.classList.add('is-open');
    switchTab(t);
    syncPanelChrome(t);
    refreshTriggers();
    if (!wasOpen && !panelHistoryPushed) { history.pushState({ readerPanel: true }, ''); panelHistoryPushed = true; }
  }
  function closePanelDirect() {
    panelOverlay.classList.remove('is-open', 'panel-mobile', 'panel-settings-mode');
    refreshTriggers();
    clearTimeout(chromeTimer);
    setChromeVisible(false);
    if (activePanelTab === 'search') { try { view?.clearSearch?.(); } catch { /* */ } }
    requestEinkPanelRefresh();
  }
  function closePanel() {
    if (!panelOverlay.classList.contains('is-open')) return;
    closePanelDirect();
    if (panelHistoryPushed) { panelHistoryPushed = false; history.back(); }
  }
  function switchTab(tab) {
    activePanelTab = tab;
    syncPanelMobileMode(tab);
    panelTabs.forEach(t => t.classList.toggle('is-active', t.dataset.tab === tab));
    panelBodies.forEach(b => { b.hidden = b.dataset.panelTab !== tab; });
    const pm = getPanelMeta(tab);
    if (panelKickerEl) panelKickerEl.textContent = pm.kicker;
    if (panelTitleEl) panelTitleEl.textContent = pm.title;
    refreshTriggers();
    syncPanelChrome(tab);
    if (tab === 'settings') {
      document.querySelectorAll('.panel-body input[type="range"]').forEach(guardRangeSliderTouchScroll);
      void ensureTtsVoices().then(() => {
        try {
          populateTtsVoiceList();
        } catch (e) {
          console.warn(e);
        }
      });
    }
    if (tab === 'notes') renderNotesTab();
    if (tab === 'search') {
      const inp = $('book-search-input');
      if (inp) setTimeout(() => { try { inp.focus(); } catch { /* */ } }, 60);
    }
  }
  panelOverlay.addEventListener('click', e => {
    if (!mobileMq.matches && e.target === panelOverlay) closePanel();
  });
  $('panel-backdrop')?.addEventListener('click', closePanel);
  $('panel-close')?.addEventListener('click', closePanel);
  panelTabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  mobileMq.addEventListener('change', () => {
    if (!panelOverlay.classList.contains('is-open')) return;
    syncPanelMobileMode();
    syncPanelChrome();
  });

  /* Back gesture / back button closes panel instead of leaving */
  window.addEventListener('popstate', () => {
    if (panelOverlay.classList.contains('is-open')) {
      panelHistoryPushed = false;
      closePanelDirect();
    }
  });

  /**
   * Capacitor/Android Back: peel UI layers before exiting the book.
   * @param {{ fromToolbar?: boolean }} [opts]
   *   fromToolbar — ← in chrome: dismiss overlays then exit (do not only hide chrome).
   *   system/gesture Back — peel one layer at a time, including chrome.
   * @returns {boolean} true if consumed (stay in book)
   */
  window.__READER_HANDLE_BACK__ = function handleReaderBack(opts) {
    const fromToolbar = Boolean(opts && opts.fromToolbar);

    const hintEl = $('reader-gesture-hint');
    if (hintEl && !hintEl.hidden) {
      hintEl.hidden = true;
      hintEl.setAttribute('aria-hidden', 'true');
      try { localStorage.setItem('inpx_reader_gesture_hint_v1', '1'); } catch { /* ignore */ }
      // Toolbar ← means leave; system Back only dismisses the coachmark.
      if (!fromToolbar) return true;
    }

    if (typeof isFootnoteOverlayOpen === 'function' && isFootnoteOverlayOpen()) {
      closeReaderFootnote();
      return true;
    }
    if (panelOverlay.classList.contains('is-open')) {
      closePanel();
      return true;
    }
    const noteEd = $('reader-note-editor');
    if (noteEd?.classList.contains('is-open')) {
      closeNoteEditor();
      return true;
    }
    if (gotoOverlay?.classList.contains('is-open')) {
      closeGotoDialog();
      return true;
    }
    const selMenu = $('reader-sel-menu');
    if (selMenu?.classList.contains('is-open')) {
      hideSelMenu();
      return true;
    }

    // System Back: hide chrome first. Toolbar ← always exits past this point.
    if (!fromToolbar && chromeVisible) {
      setChromeVisible(false);
      return true;
    }
    return false;
  };

  /* ===== Settings controls ===== */
  function setRangeFromClientX(slider, clientX) {
    const rect = slider.getBoundingClientRect();
    if (!rect.width) return;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const min = Number(slider.min);
    const max = Number(slider.max);
    const step = Number(slider.step) || 1;
    let val = min + pct * (max - min);
    val = min + Math.round((val - min) / step) * step;
    val = Math.max(min, Math.min(max, val));
    const stepText = String(step);
    const decimals = stepText.includes('.') ? (stepText.split('.')[1]?.length || 0) : 0;
    const str = decimals ? val.toFixed(decimals) : String(Math.round(val));
    if (slider.value !== str) {
      slider.value = str;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * На таче вертикальный свайп по ползунку = прокрутка панели, не смена значения.
   * Важно: откат value в capture ДО bubble-слушателей applySettings — иначе
   * «ползунок визуально на месте», а настройка уже записана с чужим значением.
   * Меняем значение только после явного горизонтального drag (не тапом по треку).
   */
  function guardRangeSliderTouchScroll(slider) {
    if (!isTouch.matches || slider.dataset.scrollGuardWired) return;
    slider.dataset.scrollGuardWired = '1';
    let startX = 0;
    let startY = 0;
    let startVal = '';
    let mode = 'idle'; // idle | pending | scroll | slide

    const restore = () => {
      if (slider.value !== startVal) slider.value = startVal;
    };

    slider.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startVal = slider.value;
      mode = 'pending';
      // WebView иногда прыгает value в том же кадре — вернём до bubble applySettings.
      queueMicrotask(() => {
        if (mode === 'pending' || mode === 'scroll') restore();
      });
    }, { capture: true, passive: true });

    slider.addEventListener('input', () => {
      if (mode === 'pending' || mode === 'scroll') restore();
    }, { capture: true });

    slider.addEventListener('change', () => {
      if (mode === 'pending' || mode === 'scroll') restore();
    }, { capture: true });

    slider.addEventListener('touchmove', (e) => {
      if (mode !== 'pending' && mode !== 'slide') return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const adx = Math.abs(t.clientX - startX);
      const ady = Math.abs(t.clientY - startY);
      if (mode === 'pending') {
        if (ady > 6 && ady >= adx) {
          mode = 'scroll';
          restore();
          slider.style.pointerEvents = 'none';
          return;
        }
        if (adx > 12 && adx > ady * 1.25) {
          mode = 'slide';
        } else {
          return;
        }
      }
      if (mode === 'slide') setRangeFromClientX(slider, t.clientX);
    }, { passive: true });

    const end = () => {
      if (mode !== 'slide') restore();
      mode = 'idle';
      slider.style.pointerEvents = '';
    };
    slider.addEventListener('touchend', end, { capture: true, passive: true });
    slider.addEventListener('touchcancel', end, { capture: true, passive: true });
  }

  window.__INPX_GUARD_RANGE_SLIDER = guardRangeSliderTouchScroll;

  function bindSeg(sel, prop) {
    document.querySelectorAll(sel).forEach(btn => btn.addEventListener('click', () => {
      const dsKey = 'set' + prop[0].toUpperCase() + prop.slice(1);
      S[prop] = btn.dataset[dsKey];
      if (prop === 'layout' && S.layout === 'scrolled') autoFlipArmed = false;
      if (prop === 'statusMode') {
        saveSettings();
        refreshSettingsUI();
        syncStatusStrip();
        return;
      }
      applySettings();
      refreshSettingsUI();
      if (prop === 'layout') syncAutoFlipTimer();
    }));
  }

  function ensureExtendedReadingSettingsUi() {
    const settingsPanel = document.querySelector('.panel-body[data-panel-tab="settings"]');
    if (settingsPanel?.dataset.settingsLayout === 'v2') return;
    if (document.getElementById('rs-justify')) return;
    if (!settingsPanel) return;

    const nightTheme = settingsPanel.querySelector('[data-set-theme="night"]');
    if (nightTheme && !settingsPanel.querySelector('[data-set-theme="eink"]')) {
      const eink = document.createElement('button');
      eink.className = 'rs-theme-dot';
      eink.type = 'button';
      eink.dataset.setTheme = 'eink';
      eink.innerHTML = '<span class="rs-dot-label">E-Ink</span>';
      nightTheme.parentElement?.appendChild(eink);
    }

    const fontGroup = $('rs-font-family')?.closest('.rs-group');
    if (fontGroup && !$('rs-publisher-font')) {
      fontGroup.insertAdjacentHTML('beforeend',
        '<label class="rs-check"><input type="checkbox" id="rs-publisher-font" name="readerPublisherFont"><span>Шрифт из книги</span></label>');
      fontGroup.insertAdjacentHTML('afterend',
        '<div class="rs-group"><div class="rs-label">Начертание</div>' +
        '<select id="rs-font-weight" name="readerFontWeight" class="rs-select" aria-label="Начертание">' +
        '<option value="400">Обычный</option><option value="500">Средний</option>' +
        '<option value="600">Полужирный</option><option value="700">Жирный</option></select></div>');
    }

    const colorStack = settingsPanel.querySelector('.rs-color-stack');
    if (colorStack && !$('rs-link-color')) {
      colorStack.insertAdjacentHTML('beforeend',
        '<div class="rs-color-line"><div class="rs-color-sub">Ссылки</div><div class="rs-color-row">' +
        '<input type="color" id="rs-link-color" name="readerLinkColor" value="#8b5a12" aria-label="Ссылки" title="Цвет ссылок">' +
        '<button type="button" class="rs-color-default" id="rs-link-color-default" title="Из темы">Из темы</button></div></div>');
    }

    const pageMarginGroup = $('rs-page-margin')?.closest('.rs-group');
    if (pageMarginGroup && !$('rs-vertical-margin')) {
      const label = pageMarginGroup.querySelector('.rs-label');
      if (label) label.textContent = 'Боковые поля';
      pageMarginGroup.insertAdjacentHTML('afterend',
        '<div class="rs-group"><div class="rs-label">Верхнее поле</div><div class="rs-slider">' +
        '<span class="rs-icon" aria-hidden="true">—</span>' +
        '<input type="range" id="rs-vertical-margin" name="readerVerticalMargin" min="0" max="96" step="4" aria-label="Верхнее поле">' +
        '<span class="rs-val" id="rs-vertical-margin-val">16 px</span><span class="rs-icon" aria-hidden="true">≡</span></div></div>' +
        '<div class="rs-group"><div class="rs-label">Типографика</div>' +
        '<label class="rs-check"><input type="checkbox" id="rs-justify" name="readerJustify" checked><span>Выравнивание по ширине</span></label>' +
        '<label class="rs-check"><input type="checkbox" id="rs-hyphenate" name="readerHyphenate" checked><span>Переносы (дефисы)</span></label>' +
        '<div class="rs-sublabel">Межбуквенный интервал</div><div class="rs-slider">' +
        '<input type="range" id="rs-letter-spacing" name="readerLetterSpacing" min="-0.05" max="0.2" step="0.01" aria-label="Межбуквенный интервал">' +
        '<span class="rs-val" id="rs-letter-spacing-val">0.00</span></div>' +
        '<div class="rs-sublabel">Межабзацный интервал</div><div class="rs-slider">' +
        '<input type="range" id="rs-paragraph-spacing" name="readerParagraphSpacing" min="0" max="1.5" step="0.05" aria-label="Межабзацный интервал">' +
        '<span class="rs-val" id="rs-paragraph-spacing-val">0.40</span></div>' +
        '<div class="rs-sublabel">Красная строка</div><div class="rs-slider">' +
        '<input type="range" id="rs-text-indent" name="readerTextIndent" min="0" max="3" step="0.1" aria-label="Красная строка">' +
        '<span class="rs-val" id="rs-text-indent-val">0.0 em</span></div></div>');
    }

    const layoutSeg = settingsPanel.querySelector('[data-set-layout="paginated"]')?.parentElement;
    if (layoutSeg && !settingsPanel.querySelector('[data-set-layout="scrolled"]')) {
      layoutSeg.insertAdjacentHTML('beforeend',
        '<button type="button" data-set-layout="scrolled">Прокрутка</button>');
    }

    const dualGroup = $('rs-layout-dual');
    if (dualGroup && !$('rs-layout-scrolled')) {
      dualGroup.insertAdjacentHTML('afterend',
        '<div class="rs-group" id="rs-layout-scrolled" hidden><div class="rs-label">Высота блока</div><div class="rs-slider">' +
        '<input type="range" id="rs-max-block-size" name="readerMaxBlockSize" min="720" max="2400" step="40" aria-label="Высота блока">' +
        '<span class="rs-val" id="rs-max-block-size-val">1440 px</span></div>' +
        '<div class="rs-hint">Максимальная высота текста в режиме прокрутки</div></div>' +
        '<div class="rs-group"><div class="rs-label">Отображение</div>' +
        '<label class="rs-check"><input type="checkbox" id="rs-invert" name="readerInvert"><span>Инверсия цветов</span></label>' +
        '<label class="rs-check"><input type="checkbox" id="rs-footnotes" name="readerFootnotes" checked><span>Всплывающие сноски</span></label></div>' +
        '<div class="rs-group"><div class="rs-label">Свой CSS</div>' +
        '<textarea id="rs-custom-css" class="rs-custom-css" name="readerCustomCss" rows="6" spellcheck="false" placeholder="/* Дополнительные стили для текста книги */"></textarea>' +
        '<button type="button" class="rs-custom-css-clear" id="rs-custom-css-clear">Очистить CSS</button></div>');
    }
  }

  function ensureAppVolumeKeysSettingsUi() {
    if (document.documentElement.dataset.inpxApp !== '1') return;
    if (document.getElementById('rs-volume-keys-group')) return;
    const settingsPanel = document.querySelector('.panel-body[data-panel-tab="settings"]');
    const slot = settingsPanel?.querySelector('#rs-volume-keys-slot');
    const actions = settingsPanel?.querySelector('.rs-actions');
    if (!settingsPanel || (!slot && !actions)) return;

    const group = document.createElement('div');
    group.className = 'rs-group';
    group.id = 'rs-volume-keys-group';
    group.innerHTML =
      '<div class="rs-label">Кнопки громкости</div>' +
      '<div class="rs-seg">' +
      '<button type="button" data-set-volume-keys="normal">Vol+ вперёд</button>' +
      '<button type="button" data-set-volume-keys="inverted">Vol+ назад</button>' +
      '</div>' +
      '<div class="rs-hint">Листание кнопками громкости (Android). Яркость — свайп у левого края.</div>';
    if (slot) slot.appendChild(group);
    else settingsPanel.insertBefore(group, actions);
  }

  function handleVolumePageTurn(direction) {
    let mapped = direction === 'next' ? 'next' : 'prev';
    if (S.volumeKeys === 'inverted') {
      mapped = mapped === 'next' ? 'prev' : 'next';
    }
    if (mapped === 'next') view?.goRight();
    else view?.goLeft();
    scheduleChromeHide();
  }

  let einkPageTurnsSinceRefresh = 0;
  let lastEinkFullRefreshAt = 0;

  function requestEinkPanelRefresh() {
    if (!isAppEinkMode()) return;
    const api = window.__INPX_NATIVE?.refreshEinkScreen;
    if (typeof api !== 'function') return;
    const now = Date.now();
    if (now - lastEinkFullRefreshAt < 450) return;
    lastEinkFullRefreshAt = now;
    einkPageTurnsSinceRefresh = 0;
    api.call(window.__INPX_NATIVE).catch(() => {});
  }

  function maybeEinkFullRefresh(why) {
    if (!isAppEinkMode()) return;
    if (why !== 'snap' && why !== 'page' && why !== 'navigation') return;
    const every = Number(S.einkFullRefreshEvery);
    if (![1, 3, 5].includes(every)) return;
    const api = window.__INPX_NATIVE?.refreshEinkScreen;
    if (typeof api !== 'function') return;
    einkPageTurnsSinceRefresh += 1;
    if (einkPageTurnsSinceRefresh < every) return;
    einkPageTurnsSinceRefresh = 0;
    const now = Date.now();
    if (now - lastEinkFullRefreshAt < 450) return;
    lastEinkFullRefreshAt = now;
    api.call(window.__INPX_NATIVE).catch(() => {});
  }

  function bindEinkRefreshSeg() {
    document.querySelectorAll('[data-set-eink-refresh]').forEach((btn) => {
      if (btn.dataset.boundEinkRefresh === '1') return;
      btn.dataset.boundEinkRefresh = '1';
      btn.addEventListener('click', () => {
        const n = Number(btn.dataset.setEinkRefresh);
        if (![1, 3, 5].includes(n)) return;
        S.einkFullRefreshEvery = n;
        einkPageTurnsSinceRefresh = 0;
        saveSettings();
        refreshSettingsUI();
      });
    });
  }

  function initSettings() {
    ensureExtendedReadingSettingsUi();
    ensureAppVolumeKeysSettingsUi();
    initControlsAndStatusSettings();
    initGotoDialog();
    bindSeg('[data-set-theme]', 'theme');
    bindSeg('[data-set-layout]', 'layout');
    bindSeg('[data-set-volume-keys]', 'volumeKeys');
    bindSeg('[data-set-status-mode]', 'statusMode');
    bindEinkRefreshSeg();
    populateFontSelect();
    const justifyEl = $('rs-justify');
    const hyphenateEl = $('rs-hyphenate');
    if (justifyEl) {
      justifyEl.addEventListener('change', () => {
        S.justify = justifyEl.checked;
        applySettings();
      });
    }
    if (hyphenateEl) {
      hyphenateEl.addEventListener('change', () => {
        S.hyphenate = hyphenateEl.checked;
        applySettings();
      });
    }
    const publisherFontEl = $('rs-publisher-font');
    if (publisherFontEl) {
      publisherFontEl.addEventListener('change', () => {
        S.usePublisherFont = publisherFontEl.checked;
        applySettings();
      });
    }
    const invertEl = $('rs-invert');
    if (invertEl) {
      invertEl.addEventListener('change', () => {
        S.invert = invertEl.checked;
        applySettings();
      });
    }
    const footnotesEl = $('rs-footnotes');
    if (footnotesEl) {
      footnotesEl.addEventListener('change', () => {
        S.enableFootnotes = footnotesEl.checked;
        saveSettings();
      });
    }
    const customCssEl = $('rs-custom-css');
    let customCssTimer = null;
    if (customCssEl) {
      customCssEl.addEventListener('input', () => {
        S.customCss = customCssEl.value;
        clearTimeout(customCssTimer);
        customCssTimer = setTimeout(() => {
          const snap = captureStickyLayoutAnchor();
          holdRendererLayout();
          pinRendererTextAnchor(snap);
          beginLayoutSuppress();
          saveSettings();
          applyBookStyles();
          if (snap) scheduleLayoutPreserve(snap);
          else {
            releaseRendererLayout();
            endLayoutSuppress();
          }
        }, 400);
      });
    }
    $('rs-custom-css-clear')?.addEventListener('click', () => {
      S.customCss = '';
      if (customCssEl) customCssEl.value = '';
      saveSettings();
      const snap = captureStickyLayoutAnchor();
      holdRendererLayout();
      pinRendererTextAnchor(snap);
      beginLayoutSuppress();
      applyBookStyles();
      if (snap) scheduleLayoutPreserve(snap);
      else {
        releaseRendererLayout();
        endLayoutSuppress();
      }
      toast('CSS очищен');
    });
    const fontWeightEl = $('rs-font-weight');
    if (fontWeightEl) {
      fontWeightEl.addEventListener('change', () => {
        S.fontWeight = Number(fontWeightEl.value) || defaults.fontWeight;
        applySettings();
      });
    }
    const fontSel = $('rs-font-family');
    if (fontSel) {
      fontSel.addEventListener('change', () => {
        S.font = fontSel.value;
        if (!(S.font in fontMap)) S.font = defaults.font;
        applySettings();
        refreshSettingsUI();
      });
    }
    document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
    const paneOrder = ['text', 'look', 'controls', 'more'];
    function showSettingsPane(name) {
      const pane = paneOrder.includes(name) ? name : 'text';
      document.querySelectorAll('.rs-nav-btn').forEach((b) => {
        const on = b.dataset.rsPane === pane;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      document.querySelectorAll('.rs-pane').forEach((p) => {
        p.hidden = p.dataset.rsPane !== pane;
      });
    }
    document.querySelectorAll('.rs-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => showSettingsPane(btn.dataset.rsPane));
    });
    $('rs-subtabs')?.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const buttons = [...document.querySelectorAll('.rs-nav-btn')];
      const i = buttons.findIndex((b) => b.classList.contains('is-active'));
      if (i < 0) return;
      const next = e.key === 'ArrowRight'
        ? buttons[(i + 1) % buttons.length]
        : buttons[(i - 1 + buttons.length) % buttons.length];
      showSettingsPane(next.dataset.rsPane);
      next.focus();
      e.preventDefault();
    });
    $('reader-reset-settings')?.addEventListener('click', resetSettings);

    const textColorInput = $('rs-text-color');
    const textColorDefaultBtn = $('rs-text-color-default');
    if (textColorInput) {
      textColorInput.addEventListener('input', () => {
        S.textColor = textColorInput.value;
        saveSettings();
        applyBookStyles();
      });
    }
    textColorDefaultBtn?.addEventListener('click', () => {
      S.textColor = '';
      applySettings();
      refreshSettingsUI();
    });

    const bgColorInput = $('rs-bg-color');
    const bgColorDefaultBtn = $('rs-bg-color-default');
    if (bgColorInput) {
      bgColorInput.addEventListener('input', () => {
        S.bgColor = bgColorInput.value;
        saveSettings();
        applyShellBackground();
        applyBookStyles();
      });
    }
    bgColorDefaultBtn?.addEventListener('click', () => {
      S.bgColor = '';
      applySettings();
      refreshSettingsUI();
    });

    const linkColorInput = $('rs-link-color');
    const linkColorDefaultBtn = $('rs-link-color-default');
    if (linkColorInput) {
      linkColorInput.addEventListener('input', () => {
        S.linkColor = linkColorInput.value;
        saveSettings();
        applyBookStyles();
      });
    }
    linkColorDefaultBtn?.addEventListener('click', () => {
      S.linkColor = '';
      applySettings();
      refreshSettingsUI();
    });

    initBgImageSettings();

    const wire = (id, valId, prop, fmt) => {
      const sl = $(id), vl = $(valId); if (!sl) return;
      sl.value = S[prop]; if (vl) vl.textContent = fmt ? fmt(S[prop]) : S[prop];
      sl.addEventListener('input', () => { S[prop] = Number(fmt ? Number(sl.value).toFixed(1) : sl.value); if (vl) vl.textContent = fmt ? fmt(S[prop]) : S[prop]; requestApplySettings(); });
    };
    wire('rs-font-size', 'rs-font-size-val', 'fontSize');
    wire('rs-line-height', 'rs-line-height-val', 'lineHeight', v => Number(v).toFixed(1));
    wire('rs-page-margin', 'rs-page-margin-val', 'pageMargin', v => `${Math.round(v)} px`);
    wire('rs-vertical-margin', 'rs-vertical-margin-val', 'verticalMargin', v => `${Math.round(v)} px`);
    wire('rs-column-gap', 'rs-column-gap-val', 'columnGap', v => `${Math.round(v)}%`);
    wire('rs-column-width', 'rs-column-width-val', 'maxWidth', v => `${Math.round(v)} px`);
    wire('rs-max-block-size', 'rs-max-block-size-val', 'maxBlockSize', v => `${Math.round(v)} px`);
    wire('rs-letter-spacing', 'rs-letter-spacing-val', 'letterSpacing', v => Number(v).toFixed(2));
    wire('rs-paragraph-spacing', 'rs-paragraph-spacing-val', 'paragraphSpacing', v => Number(v).toFixed(2));
    wire('rs-text-indent', 'rs-text-indent-val', 'textIndent', v => `${Number(v).toFixed(1)} em`);

    const fullWidthEl = $('rs-full-width');
    if (fullWidthEl) {
      fullWidthEl.addEventListener('change', () => {
        if (fullWidthEl.checked) {
          S.maxWidth = 99999;
        } else if (isFullWidth()) {
          S.maxWidth = 720;
        }
        applySettings();
        refreshSettingsUI();
      });
    }

    const ttsRateEl = $('rs-tts-rate');
    const ttsRateVal = $('rs-tts-rate-val');
    if (ttsRateEl) {
      ttsRateEl.addEventListener('input', () => {
        setTtsRate(Number(ttsRateEl.value), { persist: true, fromSlider: true });
      });
    }
    const ttsVoiceEl = $('rs-tts-voice');
    if (ttsVoiceEl) {
      ttsVoiceEl.addEventListener('change', () => {
        S.ttsVoice = ttsVoiceEl.value || '';
        saveSettings();
      });
    }
    if (window.speechSynthesis) {
      speechSynthesis.addEventListener('voiceschanged', () => {
        if (activePanelTab === 'settings') {
          try {
            populateTtsVoiceList();
          } catch { /* */ }
        }
      });
    }

    document.querySelectorAll('.panel-body input[type="range"]').forEach(guardRangeSliderTouchScroll);
  }

  async function compressBgImageFile(file) {
    if (!file || !String(file.type || '').startsWith('image/')) throw new Error('not-image');
    if (file.size > 15 * 1024 * 1024) throw new Error('too-large');
    const bmp = await createImageBitmap(file);
    const maxDim = 1600;
    const maxBytes = 700_000;
    let w = bmp.width;
    let h = bmp.height;
    if (w > maxDim || h > maxDim) {
      if (w >= h) {
        h = Math.round(h * maxDim / w);
        w = maxDim;
      } else {
        w = Math.round(w * maxDim / h);
        h = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    let quality = 0.88;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > maxBytes && quality > 0.45) {
      quality -= 0.07;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    if (dataUrl.length > maxBytes) throw new Error('too-large');
    return dataUrl;
  }

  function refreshBgImageUi() {
    const img = getEffectiveBgImage();
    const preview = $('rs-bg-image-preview');
    const clearBtn = $('rs-bg-image-clear');
    const paperWrap = $('rs-bg-image-paper-wrap');
    const fit = S.bgImageFit || defaults.bgImageFit;
    document.querySelectorAll('[data-bg-image-fit]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.bgImageFit === fit);
    });
    if (preview) {
      preview.style.backgroundImage = img ? `url("${img}")` : '';
      preview.classList.toggle('has-image', Boolean(img));
    }
    if (clearBtn) clearBtn.hidden = !img;
    if (paperWrap) paperWrap.hidden = !img;
    const paper = Number(S.bgImagePaper);
    const paperVal = Number.isFinite(paper) ? paper : defaults.bgImagePaper;
    const paperSl = $('rs-bg-image-paper');
    const paperVl = $('rs-bg-image-paper-val');
    if (paperSl) paperSl.value = String(paperVal);
    if (paperVl) paperVl.textContent = `${Math.round(paperVal * 100)}%`;
  }

  function initBgImageSettings() {
    if (!$('rs-bg-image-file')) return;
    const fileInput = $('rs-bg-image-file');
    const clearBtn = $('rs-bg-image-clear');
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        S.bgImage = await compressBgImageFile(file);
        applySettings();
        refreshSettingsUI();
        toast('Фоновое изображение установлено');
      } catch {
        toast('Не удалось загрузить изображение');
      }
    });
    clearBtn?.addEventListener('click', () => {
      S.bgImage = '';
      applySettings();
      refreshSettingsUI();
    });
    document.querySelectorAll('[data-bg-image-fit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        S.bgImageFit = btn.dataset.bgImageFit || defaults.bgImageFit;
        applySettings();
        refreshSettingsUI();
      });
    });
    const paperSl = $('rs-bg-image-paper');
    const paperVl = $('rs-bg-image-paper-val');
    if (paperSl) {
      paperSl.addEventListener('input', () => {
        S.bgImagePaper = Number(paperSl.value);
        if (paperVl) paperVl.textContent = `${Math.round(S.bgImagePaper * 100)}%`;
        applySettings();
      });
    }
    refreshBgImageUi();
  }

  function refreshSettingsUI() {
    const toggle = (sel, attr, val) => document.querySelectorAll(sel).forEach(b => b.classList.toggle('is-active', b.dataset[attr] === val));
    toggle('[data-set-theme]', 'setTheme', S.theme);
    toggle('[data-set-layout]', 'setLayout', S.layout);
    toggle('[data-set-volume-keys]', 'setVolumeKeys', S.volumeKeys);
    populateFontSelect();
    const fs = $('rs-font-family');
    if (fs) {
      if (!(S.font in fontMap)) S.font = defaults.font;
      fs.value = S.font;
      fs.disabled = S.usePublisherFont === true;
    }
    const sync = (id, v) => { const el = $(id); if (el) el.value !== undefined ? el.value = v : el.textContent = v; };
    sync('rs-font-size', S.fontSize); sync('rs-font-size-val', S.fontSize);
    sync('rs-line-height', S.lineHeight); sync('rs-line-height-val', Number(S.lineHeight).toFixed(1));
    sync('rs-page-margin', S.pageMargin);
    sync('rs-page-margin-val', `${S.pageMargin} px`);
    sync('rs-column-gap', S.columnGap);
    sync('rs-column-gap-val', `${S.columnGap}%`);
    const cwSlider = $('rs-column-width');
    const cwVal = $('rs-column-width-val');
    const fullW = isFullWidth();
    if (cwSlider) {
      cwSlider.disabled = fullW;
      cwSlider.value = fullW ? 720 : Math.min(920, Math.max(480, Number(S.maxWidth) || 720));
    }
    if (cwVal) cwVal.textContent = fullW ? rt('reader.fullWidth') : `${Math.round(S.maxWidth)} px`;
    const fullWidthEl = $('rs-full-width');
    if (fullWidthEl) fullWidthEl.checked = fullW;
    const pagGroup = $('rs-layout-paginated');
    const dualGroup = $('rs-layout-dual');
    const scrollGroup = $('rs-layout-scrolled');
    const scrolled = S.layout === 'scrolled';
    if (pagGroup) pagGroup.hidden = S.layout === 'dual' || scrolled;
    if (dualGroup) dualGroup.hidden = S.layout !== 'dual';
    if (scrollGroup) scrollGroup.hidden = !scrolled;
    const justifyEl = $('rs-justify');
    const hyphenateEl = $('rs-hyphenate');
    if (justifyEl) justifyEl.checked = S.justify !== false;
    if (hyphenateEl) hyphenateEl.checked = S.hyphenate !== false;
    const publisherFontEl = $('rs-publisher-font');
    if (publisherFontEl) publisherFontEl.checked = S.usePublisherFont === true;
    const invertEl = $('rs-invert');
    if (invertEl) {
      invertEl.checked = isAppEinkMode() ? false : S.invert === true;
      const invertLabel = invertEl.closest('.rs-check');
      if (invertLabel) invertLabel.hidden = isAppEinkMode();
    }
    const footnotesEl = $('rs-footnotes');
    if (footnotesEl) footnotesEl.checked = S.enableFootnotes !== false;
    const fontWeightEl = $('rs-font-weight');
    if (fontWeightEl) fontWeightEl.value = String(S.fontWeight || 400);
    const customCssEl = $('rs-custom-css');
    if (customCssEl && customCssEl.value !== (S.customCss || '')) customCssEl.value = S.customCss || '';
    sync('rs-vertical-margin', S.verticalMargin);
    sync('rs-vertical-margin-val', `${S.verticalMargin} px`);
    sync('rs-max-block-size', S.maxBlockSize);
    sync('rs-max-block-size-val', `${Math.round(S.maxBlockSize)} px`);
    sync('rs-letter-spacing', S.letterSpacing);
    sync('rs-letter-spacing-val', Number(S.letterSpacing).toFixed(2));
    sync('rs-paragraph-spacing', S.paragraphSpacing);
    sync('rs-paragraph-spacing-val', Number(S.paragraphSpacing).toFixed(2));
    sync('rs-text-indent', S.textIndent);
    sync('rs-text-indent-val', `${Number(S.textIndent).toFixed(1)} em`);
    const ap = getActivePreset();
    document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('is-active', b.dataset.preset === ap));
    const tcEl = $('rs-text-color');
    if (tcEl) {
      const c = themeColors[S.theme] || themeColors.dark;
      const v = (S.textColor && /^#[0-9A-Fa-f]{6}$/.test(String(S.textColor).trim())) ? S.textColor.trim() : c.fg;
      if (tcEl.value !== v) tcEl.value = v;
    }
    const bgEl = $('rs-bg-color');
    if (bgEl) {
      const c = themeColors[S.theme] || themeColors.dark;
      const v = (S.bgColor && /^#[0-9A-Fa-f]{6}$/.test(String(S.bgColor).trim())) ? S.bgColor.trim() : c.bg;
      if (bgEl.value !== v) bgEl.value = v;
    }
    const linkEl = $('rs-link-color');
    if (linkEl) {
      const v = (S.linkColor && /^#[0-9A-Fa-f]{6}$/.test(String(S.linkColor).trim()))
        ? S.linkColor.trim()
        : getEffectiveLinkColor();
      if (linkEl.value !== v) linkEl.value = v;
    }
    updateSeekbar();
    updateDayNightButton();
    const ttsR = $('rs-tts-rate');
    const ttsRV = $('rs-tts-rate-val');
    if (ttsR) {
      const r = Number(S.ttsRate);
      ttsR.value = String(Number.isFinite(r) ? Math.min(2, Math.max(0.5, r)) : 1);
      if (ttsRV) ttsRV.textContent = Number(ttsR.value).toFixed(2);
    }
    updateTtsDockRateUi();
    const ttsV = $('rs-tts-voice');
    if (ttsV && S.ttsVoice && [...ttsV.options].some(o => o.value === S.ttsVoice)) ttsV.value = S.ttsVoice;
    else if (ttsV) ttsV.value = '';
    refreshBgImageUi();
    toggle('[data-set-status-mode]', 'setStatusMode', S.statusMode);
    const autoSl = $('rs-auto-flip');
    const autoVal = $('rs-auto-flip-val');
    if (autoSl) {
      autoSl.value = String(S.autoFlipSec || 0);
      if (autoVal) autoVal.textContent = S.autoFlipSec > 0 ? `${S.autoFlipSec} с` : 'Выкл';
    }
    const stChapter = $('rs-status-chapter');
    if (stChapter) stChapter.checked = S.statusShowChapter !== false;
    const stPct = $('rs-status-pct');
    if (stPct) stPct.checked = S.statusShowPct !== false;
    const stPage = $('rs-status-page');
    if (stPage) stPage.checked = S.statusShowPage !== false;
    const stLeft = $('rs-status-chapter-left');
    if (stLeft) stLeft.checked = S.statusShowChapterLeft === true;
    const stClock = $('rs-status-clock');
    if (stClock) stClock.checked = S.statusShowClock === true;
    const pageHapticEl = $('rs-page-haptic');
    if (pageHapticEl) pageHapticEl.checked = S.pageHaptic === true;
    const einkVolHint = $('rs-eink-volume-hint');
    if (einkVolHint) einkVolHint.hidden = !isAppEinkMode();
    const einkRefreshGroup = $('rs-eink-refresh-group');
    if (einkRefreshGroup) einkRefreshGroup.hidden = !isAppEinkMode();
    document.querySelectorAll('[data-set-eink-refresh]').forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.setEinkRefresh) === Number(S.einkFullRefreshEvery));
    });
    refreshTapZonesUi();
    syncStatusStrip();
    syncAutoFlipHud();
  }

  /* ===== TTS (read aloud) ===== */
  function ssmlToPlain(ssmlStr) {
    if (!ssmlStr || typeof ssmlStr !== 'string') return '';
    try {
      const d = new DOMParser().parseFromString(ssmlStr, 'application/xml');
      if (d.querySelector('parsererror')) throw new Error('parse');
      return (d.documentElement.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {
      return String(ssmlStr).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  /** Сегменты с mark → view.tts.setMark для подсветки (смысловые единицы из foliate). */
  function parseTtsSsmlSegments(ssmlStr) {
    if (!ssmlStr || typeof ssmlStr !== 'string') return [];
    const d = new DOMParser().parseFromString(ssmlStr, 'application/xml');
    if (d.querySelector('parsererror')) {
      const plain = ssmlToPlain(ssmlStr);
      return plain ? [{ mark: null, text: plain }] : [];
    }
    const root = d.documentElement;
    if (!root) return [];
    const parts = [];
    let buf = '';
    function markName(el) {
      return el.getAttribute('name') || el.getAttributeNS('http://www.w3.org/2001/10/synthesis', 'name') || '';
    }
    function walk(node) {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) buf += child.textContent;
        else if (child.nodeType === 1) {
          if (child.localName === 'mark') {
            const name = markName(child);
            const t = buf.replace(/\s+/g, ' ').trim();
            buf = '';
            if (t) parts.push({ mark: name || null, text: t });
          } else walk(child);
        }
      }
    }
    walk(root);
    const tail = buf.replace(/\s+/g, ' ').trim();
    if (tail) parts.push({ mark: null, text: tail });
    if (!parts.length) {
      const plain = ssmlToPlain(ssmlStr);
      if (plain) return [{ mark: null, text: plain }];
    }
    return parts;
  }

  function getReaderTtsLang() {
    const c = view?.renderer?.getContents?.()?.[0];
    const fromDoc = c?.doc?.documentElement?.lang;
    const fromMeta = view?.language?.canonical;
    const raw = (fromDoc || fromMeta || (rLocale() === 'en' ? 'en' : 'ru')).trim();
    if (!raw) return rLocale() === 'en' ? 'en-US' : 'ru-RU';
    if (raw.length === 2) return raw === 'en' ? 'en-US' : raw === 'ru' ? 'ru-RU' : raw;
    return raw;
  }

  function populateTtsVoiceList() {
    const sel = $('rs-tts-voice');
    if (!sel || !window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices().slice();
    const pref = getReaderTtsLang().toLowerCase().split(/[-_]/)[0] || '';
    voices.sort((a, b) => {
      const la = (a.lang || '').toLowerCase();
      const lb = (b.lang || '').toLowerCase();
      const as = la.startsWith(pref) ? 0 : 1;
      const bs = lb.startsWith(pref) ? 0 : 1;
      if (as !== bs) return as - bs;
      if (a.localService !== b.localService) return a.localService ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });
    const keep = S.ttsVoice || '';
    sel.innerHTML = '';
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = rt('reader.ttsVoiceDefault');
    sel.appendChild(o0);
    for (const v of voices) {
      const o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = `${v.name} (${v.lang || ''})`;
      sel.appendChild(o);
    }
    if (keep && [...sel.options].some((x) => x.value === keep)) sel.value = keep;
    else sel.value = '';
  }

  const TTS_RATE_MIN = 0.5;
  const TTS_RATE_MAX = 2;
  const TTS_RATE_STEP = 0.1;

  function clampTtsRate(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.min(TTS_RATE_MAX, Math.max(TTS_RATE_MIN, Math.round(n * 100) / 100));
  }

  function updateTtsDockRateUi() {
    const rate = clampTtsRate(S.ttsRate);
    const label = $('tts-dock-rate');
    if (label) label.textContent = `${rate.toFixed(2)}×`;
    const slower = $('btn-tts-dock-slower');
    const faster = $('btn-tts-dock-faster');
    if (slower) slower.disabled = rate <= TTS_RATE_MIN + 1e-9;
    if (faster) faster.disabled = rate >= TTS_RATE_MAX - 1e-9;
  }

  function setTtsRate(next, opts = {}) {
    const rate = clampTtsRate(next);
    S.ttsRate = rate;
    if (!opts.fromSlider) {
      const ttsR = $('rs-tts-rate');
      const ttsRV = $('rs-tts-rate-val');
      if (ttsR) ttsR.value = String(rate);
      if (ttsRV) ttsRV.textContent = rate.toFixed(2);
    } else {
      const ttsRV = $('rs-tts-rate-val');
      if (ttsRV) ttsRV.textContent = rate.toFixed(2);
    }
    updateTtsDockRateUi();
    if (opts.persist !== false) saveSettings();
  }

  function applyTtsUtteranceSettings(u) {
    u.rate = clampTtsRate(S.ttsRate);
    const uri = S.ttsVoice && String(S.ttsVoice).trim();
    if (uri && window.speechSynthesis) {
      const v = speechSynthesis.getVoices().find((x) => x.voiceURI === uri);
      if (v) u.voice = v;
    }
  }

  function ensureTtsVoices() {
    return new Promise((resolve) => {
      try {
        // На Android — всегда перезапросить голоса: системный TTS могли сменить
        // в настройках телефона, а кэш speechSynthesis остаётся от старого движка.
        if (window.__INPX_USE_NATIVE_TTS && typeof window.__INPX_RELOAD_TTS_VOICES === 'function') {
          window.__INPX_RELOAD_TTS_VOICES().then(() => resolve()).catch(() => resolve());
          return;
        }
        if (!window.speechSynthesis) {
          resolve();
          return;
        }
        if (speechSynthesis.getVoices().length) {
          resolve();
          return;
        }
        speechSynthesis.addEventListener('voiceschanged', () => resolve(), { once: true });
        setTimeout(resolve, 400);
      } catch {
        resolve();
      }
    });
  }

  const TTS_PATH_PLAY = 'M8 5v14l11-7z';
  const TTS_PATH_PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';

  /** Одна иконка в кнопке: только смена path (плей ↔ пауза). */
  function syncTtsMainIcon(host, playing) {
    if (!host) return;
    const path = host.querySelector('.tts-main-path');
    if (!path) return;
    path.setAttribute('d', playing ? TTS_PATH_PAUSE : TTS_PATH_PLAY);
  }

  function updateTtsButtons() {
    const playing = ttsChainActive && !ttsPausedByUser;
    const mainLabel = playing ? rt('reader.ttsPause') : rt('reader.tts');
    const mainTitle = playing ? rt('reader.ttsPause') : rt('reader.ttsPlay');
    if (btnTts) {
      btnTts.classList.toggle('is-active', playing);
      btnTts.title = mainTitle;
      btnTts.setAttribute('aria-label', mainLabel);
      syncTtsMainIcon(btnTts, playing);
    }
    if (btnTtsDock) {
      btnTtsDock.classList.toggle('is-active', playing);
      btnTtsDock.title = mainTitle;
      btnTtsDock.setAttribute('aria-label', mainLabel);
      syncTtsMainIcon(btnTtsDock, playing);
    }
    document.querySelectorAll('.js-tts-prev, .js-tts-next').forEach((b) => {
      b.disabled = !ttsChainActive;
    });
    [btnTtsStop, btnTtsDockStop].forEach((btn) => {
      if (!btn) return;
      btn.hidden = !ttsChainActive;
    });
    if (ttsDockEl) {
      ttsDockEl.classList.toggle('is-visible', ttsChainActive);
      ttsDockEl.setAttribute('aria-hidden', ttsChainActive ? 'false' : 'true');
    }
    updateTtsDockRateUi();
    document.body.classList.toggle('reader-tts-active', ttsChainActive);
    if (!ttsChainActive) pauseTtsKeepalive();
    syncTtsMediaSessionPlayback();
    if (ttsChainActive) syncTtsMediaMetadata();
    notifyParentTtsState();
  }

  function notifyParentTtsState() {
    try {
      window.parent.postMessage({
        type: 'inpx-reader-tts-state',
        active: ttsChainActive,
        playing: ttsChainActive && !ttsPausedByUser,
      }, '*');
    } catch { /* cross-origin */ }
  }

  function stopReaderTts() {
    ttsSpeakToken++;
    clearTtsBackgroundMaintain();
    ttsKickSpeak = null;
    ttsNav.skipBack = () => {};
    ttsNav.skipForward = () => {};
    if (ttsStopLongPressTimer != null) {
      clearTimeout(ttsStopLongPressTimer);
      ttsStopLongPressTimer = null;
    }
    ttsStopLongPressPt = null;
    try {
      window.speechSynthesis?.cancel();
    } catch { /* */ }
    try { view?.tts?.clearHighlight?.(); } catch { /* */ }
    try { view?.deselect?.(); } catch { /* */ }
    hideSelMenu();
    activeSel = null;
    ttsChainActive = false;
    ttsPausedByUser = false;
    ttsAdvancingSection = false;
    releaseReaderWakeLock();
    updateTtsButtons();
  }

  /**
   * После окончания текста в секции — перелистнуть и продолжить озвучку.
   * @returns {Promise<boolean>} true если цепочка продолжена
   */
  async function advanceTtsToNextSection(depth) {
    if (!ttsChainActive || !view || depth > 14) return false;
    const prevCfi = view.lastLocation?.cfi;
    ttsAdvancingSection = true;
    try {
      await view.goRight();
    } catch (e) {
      console.warn(e);
      ttsAdvancingSection = false;
      return false;
    }
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(tid);
        view.removeEventListener('load', onLoad);
        resolve();
      };
      const onLoad = () => finish();
      const tid = setTimeout(finish, 650);
      view.addEventListener('load', onLoad, { once: true });
    });
    ttsAdvancingSection = false;
    if (!ttsChainActive) return false;
    if (!view.lastLocation || view.lastLocation.cfi === prevCfi) return false;
    if (!view.renderer?.getContents?.()?.[0]?.doc?.body) return false;
    try {
      await view.initTTS('sentence', true);
    } catch (e) {
      console.warn(e);
      return advanceTtsToNextSection(depth + 1);
    }
    if (!view.tts) return false;
    let first;
    try {
      first = view.tts.start();
    } catch (e) {
      console.warn(e);
      first = null;
    }
    if (!first) {
      return advanceTtsToNextSection(depth + 1);
    }
    runTtsUtteranceChain(first);
    return true;
  }

  function runTtsUtteranceChain(initialSsml) {
    let parts = [];
    let idx = 0;
    let useInitialSsml = true;

    function finishTtsChain() {
      ttsChainActive = false;
      ttsPausedByUser = false;
      ttsKickSpeak = null;
      if (window.__INPX_USE_NATIVE_TTS) window.__INPX_ttsKickSpeak = null;
      clearTtsBackgroundMaintain();
      ttsNav.skipBack = () => {};
      ttsNav.skipForward = () => {};
      releaseReaderWakeLock();
      updateTtsButtons();
    }

    function ensureParts() {
      if (idx < parts.length) return true;
      const ssml = useInitialSsml ? (useInitialSsml = false, initialSsml) : view.tts.next();
      if (!ssml) return false;
      parts = parseTtsSsmlSegments(ssml);
      idx = 0;
      return true;
    }

    function speakStep() {
      if (!ttsChainActive || !view?.tts) {
        finishTtsChain();
        return;
      }
      if (!ensureParts()) {
        if (ttsChainActive) {
          void advanceTtsToNextSection(0).then((cont) => {
            if (!cont) finishTtsChain();
          });
        } else finishTtsChain();
        return;
      }
      while (idx < parts.length && !(parts[idx].text && String(parts[idx].text).trim())) idx++;
      if (idx >= parts.length) {
        requestAnimationFrame(speakStep);
        return;
      }
      const seg = parts[idx];
      if (seg.mark != null && String(seg.mark).length) {
        try {
          view.tts.setMark(String(seg.mark));
        } catch (e) {
          console.warn(e);
        }
      }
      const u = new SpeechSynthesisUtterance(seg.text);
      u.lang = getReaderTtsLang();
      applyTtsUtteranceSettings(u);
      const token = ttsSpeakToken;
      u.onstart = () => {
        lastTtsSpeechAt = Date.now();
        void startTtsKeepalivePlayback();
      };
      /**
       * Пока страница скрыта, Chrome/Android отменяет фразу без реального произнесения, и
       * onend/onerror всё равно срабатывают — если в этот момент продвинуть idx, цепочка
       * молча проматывается вперёд (иногда на главы) пока не вернётся видимость. Поэтому в
       * скрытом состоянии просто выходим без advance; resumeTtsAfterHidden() повторит этот
       * же сегмент, когда страница снова станет видимой.
       */
      u.onend = () => {
        lastTtsSpeechAt = Date.now();
        if (!ttsChainActive || token !== ttsSpeakToken) return;
        if (!ttsCanAdvanceAfterUtterance()) return;
        idx++;
        speakStep();
      };
      u.onerror = () => {
        lastTtsSpeechAt = Date.now();
        if (!ttsChainActive || token !== ttsSpeakToken) return;
        if (!ttsCanAdvanceAfterUtterance()) return;
        idx++;
        speakStep();
      };
      try {
        speechSynthesis.speak(u);
      } catch (e) {
        console.warn(e);
        idx++;
        speakStep();
      }
      updateTtsButtons();
    }

    ttsNav.skipForward = () => {
      if (!ttsChainActive) return;
      ttsSpeakToken++;
      try {
        speechSynthesis.cancel();
      } catch { /* */ }
      idx++;
      requestAnimationFrame(speakStep);
    };

    ttsNav.skipBack = () => {
      if (!ttsChainActive) return;
      ttsSpeakToken++;
      try {
        speechSynthesis.cancel();
      } catch { /* */ }
      if (idx > 0) {
        idx--;
      } else {
        let prevSsml;
        try {
          prevSsml = view.tts.prev(true);
        } catch (e) {
          console.warn(e);
          prevSsml = null;
        }
        if (!prevSsml) {
          toast(rt('reader.ttsNoPrev'));
          requestAnimationFrame(speakStep);
          return;
        }
        parts = parseTtsSsmlSegments(prevSsml);
        idx = Math.max(0, parts.length - 1);
        while (idx > 0 && !(parts[idx].text && String(parts[idx].text).trim())) idx--;
      }
      requestAnimationFrame(speakStep);
    };

    ttsKickSpeak = speakStep;
    if (window.__INPX_USE_NATIVE_TTS) {
      window.__INPX_ttsKickSpeak = speakStep;
    }
    speakStep();
  }

  async function startReaderTts() {
    if (!view || view.isFixedLayout) {
      toast(rt('reader.ttsFixedLayout'));
      return;
    }
    if (!window.speechSynthesis) {
      toast(rt('reader.ttsUnavailable'));
      return;
    }
    const contents = view.renderer.getContents();
    if (!contents?.length || !contents[0]?.doc?.body) {
      toast(rt('reader.ttsNoText'));
      return;
    }
    stopReaderTts();
    await ensureTtsVoices();
    try {
      await view.initTTS('sentence', true);
    } catch (e) {
      console.warn(e);
      toast(rt('reader.ttsNoText'));
      return;
    }
    if (!view.tts) {
      toast(rt('reader.ttsNoText'));
      return;
    }
    let firstSsml;
    try {
      const loc = view.lastLocation;
      if (loc?.range?.cloneRange) {
        firstSsml = view.tts.from(loc.range.cloneRange());
      } else {
        firstSsml = view.tts.start();
      }
    } catch (e) {
      console.warn(e);
      try {
        firstSsml = view.tts.start();
      } catch (e2) {
        console.warn(e2);
        firstSsml = null;
      }
    }
    if (!firstSsml) {
      toast(rt('reader.ttsNoText'));
      return;
    }
    initReaderMediaSessionHandlers();
    ttsChainActive = true;
    ttsPausedByUser = false;
    lastTtsSpeechAt = Date.now();
    try { view?.deselect?.(); } catch { /* */ }
    hideSelMenu();
    activeSel = null;
    void acquireReaderWakeLock();
    setChromeVisible(true);
    updateTtsButtons();
    void startTtsKeepalivePlayback();
    if (document.visibilityState === 'hidden') maintainTtsInBackground();
    runTtsUtteranceChain(firstSsml);
  }

  function toggleReaderTts() {
    if (!ttsChainActive) {
      void startReaderTts();
      return;
    }
    if (ttsPausedByUser) {
      try {
        speechSynthesis.resume();
      } catch { /* */ }
      ttsPausedByUser = false;
      void acquireReaderWakeLock();
    } else {
      try {
        speechSynthesis.pause();
      } catch { /* */ }
      ttsPausedByUser = true;
      releaseReaderWakeLock();
    }
    syncTtsKeepaliveWithSpeech();
    updateTtsButtons();
  }

  function clearTtsStopLongPressTimer() {
    if (ttsStopLongPressTimer != null) {
      clearTimeout(ttsStopLongPressTimer);
      ttsStopLongPressTimer = null;
    }
    ttsStopLongPressPt = null;
  }

  function wireTtsPrimaryControl(el) {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      if (!ttsChainActive || e.shiftKey) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearTtsStopLongPressTimer();
      ttsStopLongPressPt = { x: e.clientX, y: e.clientY };
      ttsStopLongPressTimer = window.setTimeout(() => {
        ttsStopLongPressTimer = null;
        ttsStopLongPressPt = null;
        ttsStopLongPressConsumeClick = true;
        stopReaderTts();
        scheduleChromeHide();
      }, TTS_STOP_LONG_PRESS_MS);
    });
    el.addEventListener('pointermove', (e) => {
      if (ttsStopLongPressPt == null || ttsStopLongPressTimer == null) return;
      const dx = e.clientX - ttsStopLongPressPt.x;
      const dy = e.clientY - ttsStopLongPressPt.y;
      if (dx * dx + dy * dy > TTS_STOP_LONG_PRESS_SLOP_PX * TTS_STOP_LONG_PRESS_SLOP_PX) {
        clearTtsStopLongPressTimer();
      }
    });
    el.addEventListener('pointerup', () => clearTtsStopLongPressTimer());
    el.addEventListener('pointercancel', () => clearTtsStopLongPressTimer());
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') clearTtsStopLongPressTimer();
    });
    el.addEventListener('contextmenu', (e) => {
      if (ttsChainActive) e.preventDefault();
    });
    el.addEventListener('click', (ev) => {
      if (ttsStopLongPressConsumeClick) {
        ttsStopLongPressConsumeClick = false;
        ev.preventDefault();
        return;
      }
      if (ev.shiftKey && ttsChainActive) {
        stopReaderTts();
        scheduleChromeHide();
        return;
      }
      toggleReaderTts();
      scheduleChromeHide();
    });
  }
  wireTtsPrimaryControl(btnTts);
  wireTtsPrimaryControl(btnTtsDock);

  document.querySelectorAll('.js-tts-stop').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopReaderTts();
      scheduleChromeHide();
    });
  });

  document.querySelectorAll('.js-tts-prev').forEach((btn) => {
    btn.addEventListener('click', () => {
      ttsNav.skipBack();
      scheduleChromeHide();
    });
  });
  document.querySelectorAll('.js-tts-next').forEach((btn) => {
    btn.addEventListener('click', () => {
      ttsNav.skipForward();
      scheduleChromeHide();
    });
  });

  const btnTtsDockSlower = $('btn-tts-dock-slower');
  const btnTtsDockFaster = $('btn-tts-dock-faster');
  if (btnTtsDockSlower) {
    btnTtsDockSlower.title = rt('reader.ttsSlower');
    btnTtsDockSlower.setAttribute('aria-label', rt('reader.ttsSlower'));
    btnTtsDockSlower.addEventListener('click', () => {
      setTtsRate(clampTtsRate(S.ttsRate) - TTS_RATE_STEP);
    });
  }
  if (btnTtsDockFaster) {
    btnTtsDockFaster.title = rt('reader.ttsFaster');
    btnTtsDockFaster.setAttribute('aria-label', rt('reader.ttsFaster'));
    btnTtsDockFaster.addEventListener('click', () => {
      setTtsRate(clampTtsRate(S.ttsRate) + TTS_RATE_STEP);
    });
  }
  updateTtsDockRateUi();

  /* ===== Toolbar buttons ===== */
  const btnFullscreen = $('btn-fullscreen');
  /** В APK Fullscreen API в iframe не работает — immersive через host (StatusBar). */
  let appImmersive = false;
  function isFullscreenActive() {
    if (document.documentElement.dataset.inpxApp === '1' || window.__READER_APP) {
      return appImmersive;
    }
    return !!document.fullscreenElement;
  }
  function toggleFullscreen() {
    if (document.documentElement.dataset.inpxApp === '1' || window.__READER_APP) {
      appImmersive = !appImmersive;
      try {
        window.parent?.postMessage({ type: 'inpx-reader-immersive', enabled: appImmersive }, '*');
      } catch { /* */ }
      document.body.classList.toggle('is-immersive', appImmersive);
      if (appImmersive) setChromeVisible(false);
      updateFullscreenIcon();
      return;
    }
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
  function updateFullscreenIcon() {
    if (!btnFullscreen) return;
    const isFs = isFullscreenActive();
    btnFullscreen.innerHTML = isFs
      ? '<svg viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>';
    btnFullscreen.title = isFs ? rt('readerJs.fullscreenExit') : rt('readerJs.fullscreenEnter');
    btnFullscreen.setAttribute('aria-pressed', isFs ? 'true' : 'false');
    btnFullscreen.classList.toggle('is-active', isFs);
  }
  btnFullscreen?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenIcon);

  $('btn-day-night')?.addEventListener('click', () => {
    toggleDayNightTheme();
    scheduleChromeHide();
  });

  $('btn-settings')?.addEventListener('click', () => openPanel('settings'));
  $('btn-toc')?.addEventListener('click', () => openPanel('toc'));
  $('btn-search')?.addEventListener('click', () => openPanel('search'));
  $('btn-bookmark-add')?.addEventListener('click', addBookmark);
  applyNextSeriesMeta(window.__READER_NEXT_SERIES);
  {
    const hintKey = 'inpx_reader_gesture_hint_v1';
    const hintEl = $('reader-gesture-hint');
    const okBtn = $('rgh-ok');
    let dismissed = false;
    try { dismissed = localStorage.getItem(hintKey) === '1'; } catch { /* ignore */ }
    if (hintEl && !dismissed) {
      const show = () => {
        hintEl.hidden = false;
        hintEl.setAttribute('aria-hidden', 'false');
      };
      const hide = () => {
        hintEl.hidden = true;
        hintEl.setAttribute('aria-hidden', 'true');
        try { localStorage.setItem(hintKey, '1'); } catch { /* ignore */ }
      };
      okBtn?.addEventListener('click', hide);
      // After first paint of book chrome
      setTimeout(show, 700);
    }
  }
  tocSearchInput?.addEventListener('input', renderTocTab);
  tocPrevBtn?.addEventListener('click', () => goTocIdx(getTocIdx() - 1));
  tocNextBtn?.addEventListener('click', () => goTocIdx(getTocIdx() + 1));
  const bookSearchInput = $('book-search-input');
  if (bookSearchInput) {
    bookSearchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => runBookSearch(bookSearchInput.value), 350);
    });
    bookSearchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchDebounce); runBookSearch(bookSearchInput.value); }
    });
  }
  initAnnotations();
  initDictionaryUi();
  initSettings();
  refreshSettingsUI();
  syncStatusStrip();
  syncAutoFlipTimer();
  refreshTriggers();
  initReaderMediaSessionHandlers();

  function applyNextSeriesMeta(meta) {
    window.__READER_NEXT_SERIES = meta?.bookId
      ? { bookId: String(meta.bookId), title: String(meta.title || '') }
      : null;
    const nextBtn = $('btn-next-series');
    if (!nextBtn) return;
    if (window.__READER_NEXT_SERIES?.bookId) {
      nextBtn.hidden = false;
      nextBtn.title = window.__READER_NEXT_SERIES.title
        ? 'Следующая в серии: ' + window.__READER_NEXT_SERIES.title
        : 'Следующая в серии';
      if (!nextBtn.dataset.wired) {
        nextBtn.dataset.wired = '1';
        nextBtn.addEventListener('click', () => {
          const id = window.__READER_NEXT_SERIES?.bookId;
          if (!id) return;
          try {
            window.parent?.postMessage({ type: 'inpx-reader-open-next-series', bookId: id }, '*');
          } catch { /* ignore */ }
        });
      }
    } else {
      nextBtn.hidden = true;
    }
  }

  window.addEventListener('message', (e) => {
    // Только родительское окно приложения — sandboxed контент книги не должен
    // дёргать настройки/TTS/панели читалки.
    if (e.source !== window.parent) return;
    if (e.data?.type === 'inpx-reader-next-series') {
      applyNextSeriesMeta(e.data.nextInSeries);
      return;
    }
    if (e.data?.type === 'reader-volume-key') {
      handleVolumePageTurn(e.data.direction);
      return;
    }
    if (e.data?.type === 'inpx-set-font-size' && Number.isFinite(Number(e.data.size))) {
      S.fontSize = Math.min(28, Math.max(14, Number(e.data.size)));
      applySettings();
      refreshSettingsUI();
      return;
    }
    if (e.data?.type === 'inpx-set-font' && typeof e.data.font === 'string') {
      const f = e.data.font;
      if (fontMap[f] || GOOGLE_FONTS[f]) {
        S.font = f;
        applySettings();
        refreshSettingsUI();
      }
      return;
    }
    if (e.data?.type === 'inpx-set-line-height' && Number.isFinite(Number(e.data.lineHeight))) {
      S.lineHeight = Math.min(2.2, Math.max(1.2, Number(e.data.lineHeight)));
      applySettings();
      refreshSettingsUI();
      return;
    }
    if (e.data?.type === 'inpx-set-theme' && typeof e.data.theme === 'string') {
      const t = e.data.theme;
      if (['light', 'dark', 'sepia', 'night', 'eink'].includes(t)) {
        S.theme = t;
        applySettings();
        refreshSettingsUI();
      }
      return;
    }
    if (e.data?.type === 'inpx-toggle-theme') {
      toggleDayNightTheme();
      return;
    }
    if (e.data?.type === 'inpx-set-layout' && typeof e.data.layout === 'string') {
      const l = e.data.layout;
      if (['paginated', 'scrolled', 'dual'].includes(l)) {
        S.layout = l;
        applySettings();
        refreshSettingsUI();
      }
      return;
    }
    if (e.data?.type === 'inpx-show-settings') {
      openPanel('settings');
      return;
    }
    if (e.data?.type === 'inpx-show-toc') {
      openPanel('toc');
      return;
    }
    if (e.data?.type === 'inpx-show-bookmarks') {
      openPanel('bookmarks');
      return;
    }
    if (e.data?.type === 'inpx-show-search') {
      openPanel('search');
      return;
    }
    if (e.data?.type === 'inpx-show-notes') {
      openPanel('notes');
      return;
    }
    if (e.data?.type === 'inpx-set-page-margin' && Number.isFinite(Number(e.data.margin))) {
      S.pageMargin = Math.min(80, Math.max(0, Math.round(Number(e.data.margin))));
      applySettings();
      refreshSettingsUI();
      return;
    }
    if (e.data?.type === 'inpx-tts-toggle') {
      toggleReaderTts();
      return;
    }
    if (e.data?.type === 'inpx-tts-stop') {
      stopReaderTts();
      return;
    }
    if (e.data?.type === 'inpx-goto-annotation') {
      const dir = e.data.direction === 'next' ? 1 : -1;
      if (!annotationsData.length) return;
      annotationNavIndex = (annotationNavIndex + dir + annotationsData.length) % annotationsData.length;
      const a = annotationsData[annotationNavIndex];
      if (a?.cfi) void revealAnnotationAt(a.cfi, { retries: 8 });
    }
  });

  /* ===== Keyboard ===== */
  function handleKeydown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (isFootnoteOverlayOpen()) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeReaderFootnote();
      }
      return;
    }
    if (e.key === 'Escape') {
      const ed = $('reader-note-editor');
      if (ed && ed.classList.contains('is-open')) { closeNoteEditor(); return; }
      const sm = $('reader-sel-menu');
      if (sm && sm.classList.contains('is-open')) { hideSelMenu(); activeSel = null; return; }
      closePanel();
      return;
    }
    if (panelOverlay.classList.contains('is-open')) return;
    const k = e.key;
    if (k === 'd' || k === 'D') { toggleDayNightTheme(); return; }
    if (k === 'b' || k === 'B') { addBookmark(); return; }
    if (k === 'f' || k === 'F') { toggleFullscreen(); return; }
    if (k === 's' || k === 'S') { openPanel('settings'); return; }
    if (k === 't' || k === 'T') { openPanel('toc'); return; }
    if (k === '/') { e.preventDefault(); openPanel('search'); return; }
    if (k === 'v' || k === 'V') {
      e.preventDefault();
      if (e.shiftKey && ttsChainActive) {
        stopReaderTts();
        scheduleChromeHide();
        return;
      }
      toggleReaderTts();
      scheduleChromeHide();
      return;
    }
    if (k === '[') {
      e.preventDefault();
      ttsNav.skipBack();
      scheduleChromeHide();
      return;
    }
    if (k === ']') {
      e.preventDefault();
      ttsNav.skipForward();
      scheduleChromeHide();
      return;
    }
    if (k === 'ArrowLeft' || k === 'h') { e.preventDefault(); view?.goLeft(); }
    if (k === 'ArrowRight' || k === 'l' || k === ' ') { e.preventDefault(); view?.goRight(); }
  }
  document.addEventListener('keydown', handleKeydown);

  /* ===== Iframe event wiring (foliate Shadow DOM) ===== */
  /* ===== Сноски / примечания (как в Foliate: foliate-js FootnoteHandler) ===== */
  let footnoteHandler = null;

  function ensureFootnoteShell() {
    let el = $('reader-footnote-overlay');
    if (el) {
      return {
        overlay: el,
        body: el.querySelector('.reader-footnote-body'),
        closeBtn: el.querySelector('.reader-footnote-close'),
      };
    }
    el = document.createElement('div');
    el.id = 'reader-footnote-overlay';
    el.className = 'reader-footnote-overlay';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', rt('readerJs.footnote'));
    el.innerHTML =
      '<div class="reader-footnote-backdrop" tabindex="-1"></div>' +
      '<div class="reader-footnote-panel">' +
      '<button type="button" class="reader-footnote-close" aria-label="' + esc(rt('readerJs.close')) + '">&times;</button>' +
      '<div class="reader-footnote-body"></div>' +
      '</div>';
    document.body.appendChild(el);
    const body = el.querySelector('.reader-footnote-body');
    const closeBtn = el.querySelector('.reader-footnote-close');
    const backdrop = el.querySelector('.reader-footnote-backdrop');
    const close = () => closeReaderFootnote();
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    return { overlay: el, body, closeBtn };
  }

  function closeReaderFootnote() {
    const el = $('reader-footnote-overlay');
    if (!el || el.hidden) return;
    const body = el.querySelector('.reader-footnote-body');
    if (body) body.replaceChildren();
    el.hidden = true;
    document.body.classList.remove('reader-footnote-open');
  }

  function isFootnoteOverlayOpen() {
    const el = $('reader-footnote-overlay');
    return el && !el.hidden;
  }

  function findFootnoteTargetEl(doc, id) {
    if (!doc || !id) return null;
    let el = doc.getElementById(id);
    if (el) return el;
    try {
      el = doc.querySelector(`[name="${CSS.escape(id)}"]`);
    } catch { /* */ }
    if (el) return el;
    try {
      el = doc.querySelector(`[xml\\:id="${CSS.escape(id)}"]`);
    } catch { /* */ }
    return el || null;
  }

  function showFootnoteClonePopup(clonedNode) {
    const shell = ensureFootnoteShell();
    shell.body.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'reader-footnote-clone';
    const fg = getEffectiveTextColor();
    const ff = fontMap[S.font] || fontMap.serif;
    wrap.style.cssText =
      `color:${fg};background:transparent;font-family:${ff};font-size:${S.fontSize}px;line-height:${S.lineHeight};word-break:break-word;`;
    wrap.appendChild(clonedNode);
    shell.body.appendChild(wrap);
    shell.overlay.hidden = false;
    document.body.classList.add('reader-footnote-open');
  }

  /**
   * Сноска в том же XHTML, что и ссылка: не трогаем spine/второй foliate-view.
   * Срабатывает на href="#id" и на href="тот_же_файл.xhtml#id" в blob-документе.
   */
  function tryOpenSameDocumentFootnote(e) {
    const book = view?.book;
    const { a, href } = e.detail || {};
    if (!book || !a?.ownerDocument) return false;
    if (book.isExternal?.(href)) return false;
    const raw = (a.getAttribute('href') || '').trim();
    if (!raw) return false;

    const doc = a.ownerDocument;
    const docUrl = doc.documentURI || '';
    let fragId = '';

    if (raw.startsWith('#')) {
      try {
        fragId = decodeURIComponent(raw.slice(1));
      } catch {
        return false;
      }
    } else if (docUrl.startsWith('blob:')) {
      try {
        const abs = new URL(raw, docUrl);
        const base = new URL(docUrl);
        if (abs.origin !== base.origin || abs.pathname !== base.pathname || !abs.hash) return false;
        fragId = decodeURIComponent(abs.hash.slice(1));
      } catch {
        return false;
      }
    } else {
      return false;
    }

    if (!fragId) return false;
    const footEl = findFootnoteTargetEl(doc, fragId);
    if (!footEl || footEl === a || footEl.contains(a)) return false;

    e.preventDefault();
    showFootnoteClonePopup(footEl.cloneNode(true));
    return true;
  }

  /**
   * FB2 / EPUB: сноска в другой секции (другой blob). Второй foliate-view часто не в DOM
   * до load — клонируем из createDocument() целевой секции (как Foliate-попап).
   */
  function tryOpenSpineFootnoteClone(e) {
    const book = view?.book;
    const { a, href } = e.detail || {};
    if (!book?.resolveHref || !book.sections?.length || book.isExternal?.(href)) return false;
    const frag = footnoteTargetFragmentFromHref(href || '');
    if (!frag || !shouldTrySpineFootnoteClone(a, href)) return false;
    const resolved = book.resolveHref(`#${frag}`);
    if (!resolved) return false;
    let doc;
    try {
      doc = book.sections[resolved.index]?.createDocument?.();
    } catch {
      return false;
    }
    if (!doc) return false;
    let el = typeof resolved.anchor === 'function' ? resolved.anchor(doc) : null;
    if (!el) el = findFootnoteTargetEl(doc, frag);
    if (!el || el === a || el.contains?.(a)) return false;
    e.preventDefault();
    showFootnoteClonePopup(el.cloneNode(true));
    return true;
  }

  function wireFootnotes() {
    if (!view?.book) return;
    footnoteHandler = new FootnoteHandler();
    footnoteHandler.addEventListener('render', ({ detail }) => {
      const fnView = detail.view;
      if (!fnView) return;
      const shell = ensureFootnoteShell();
      shell.body.replaceChildren(fnView);
      try {
        fnView.renderer?.setAttribute?.('flow', 'scrolled');
        syncReaderGoogleFont(fnView.renderer?.getContents?.()?.[0]?.doc).then(() => {
          fnView.renderer?.setStyles?.(getBookCSS());
        });
      } catch (err) {
        console.warn('[reader] footnote styles', err);
      }
      shell.overlay.hidden = false;
      document.body.classList.add('reader-footnote-open');
    });
    view.addEventListener('link', (e) => {
      if (S.enableFootnotes === false) return;
      if (tryOpenSameDocumentFootnote(e)) return;
      if (tryOpenSpineFootnoteClone(e)) return;
      footnoteHandler.handle(view.book, e);
    });
  }

  const readerWiredDocs = new WeakSet();

  /* ===== Dictionary (long press) ===== */
  let mediaOverlayPlaying = false;

  function hideDictPopup() {
    const el = $('reader-dict-popup');
    if (el) {
      el.classList.remove('is-open');
      el.setAttribute('aria-hidden', 'true');
    }
  }

  function showDictPopup(word, html) {
    const el = $('reader-dict-popup');
    if (!el) return;
    const title = el.querySelector('.reader-dict-word');
    const body = el.querySelector('.reader-dict-body');
    if (title) title.textContent = word;
    if (body) body.innerHTML = html;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
  }

  async function lookupWordDefinition(word) {
    const w = word.trim().replace(/^[^a-zA-Z\u0400-\u04FF0-9]+|[^a-zA-Z\u0400-\u04FF0-9]+$/g, '');
    if (w.length < 2) return null;
    const isCyrillic = /[\u0400-\u04FF]/.test(w);
    try {
      if (!isCyrillic && /^[a-zA-Z'-]+$/.test(w)) {
        const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
        if (r.ok) {
          const data = await r.json();
          const meanings = (data[0]?.meanings || []).slice(0, 3);
          if (meanings.length) {
            return meanings.map(m =>
              `<div class="reader-dict-pos">${esc(m.partOfSpeech || '')}</div>` +
              (m.definitions || []).slice(0, 2).map(d => `<div class="reader-dict-def">${esc(d.definition || '')}</div>`).join('')
            ).join('');
          }
        }
      }
      const wiki = isCyrillic ? 'ru.wiktionary.org' : 'en.wiktionary.org';
      const wr = await fetch(`https://${wiki}/w/api.php?action=query&titles=${encodeURIComponent(w)}&prop=extracts&exintro=1&explaintext=1&format=json&origin=*`);
      if (wr.ok) {
        const wd = await wr.json();
        const pages = wd.query?.pages || {};
        const page = Object.values(pages)[0];
        const extract = page?.extract;
        if (extract && !page?.missing) {
          return `<div class="reader-dict-def">${esc(String(extract).slice(0, 600))}</div>`;
        }
      }
    } catch {
      return `<div class="reader-dict-def">${esc(rt('readerJs.dictNetworkError'))}</div>`;
    }
    return `<div class="reader-dict-def">${esc(rt('readerJs.dictNotFound'))}</div>`;
  }

  function wordAtPoint(doc, x, y) {
    let range = null;
    if (doc.caretRangeFromPoint) range = doc.caretRangeFromPoint(x, y);
    else if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) {
        range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    if (!range) return '';
    try { range.expand('word'); } catch { /* */ }
    return (range.toString() || '').trim();
  }

  function wireDictionary(doc) {
    let pressTimer = null;
    let sx = 0;
    let sy = 0;
    doc.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      sx = e.clientX;
      sy = e.clientY;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(async () => {
        const word = wordAtPoint(doc, sx, sy);
        if (!word || word.length < 2) return;
        hideSelMenu();
        showDictPopup(word, `<div class="reader-dict-def">${esc(rt('readerJs.dictLoading'))}</div>`);
        const html = await lookupWordDefinition(word);
        showDictPopup(word, html || `<div class="reader-dict-def">${esc(rt('readerJs.dictNotFound'))}</div>`);
      }, 520);
    }, { passive: true });
    doc.addEventListener('pointerup', () => clearTimeout(pressTimer));
    doc.addEventListener('pointercancel', () => clearTimeout(pressTimer));
    doc.addEventListener('pointermove', (e) => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 14) clearTimeout(pressTimer);
    }, { passive: true });
  }

  function setupMediaOverlayUi() {
    const btn = $('btn-media-overlay');
    if (!btn || !view?.mediaOverlay) {
      if (btn) btn.hidden = true;
      return;
    }
    btn.hidden = false;
    btn.title = rt('readerJs.mediaOverlay');
    btn.setAttribute('aria-label', rt('readerJs.mediaOverlay'));
    btn.onclick = () => {
      if (mediaOverlayPlaying) {
        view.mediaOverlay.pause();
        mediaOverlayPlaying = false;
        btn.title = rt('readerJs.mediaOverlay');
        return;
      }
      view.startMediaOverlay().then(() => {
        mediaOverlayPlaying = true;
        btn.title = rt('readerJs.mediaOverlayStop');
      }).catch(console.error);
    };
    view.mediaOverlay.addEventListener('error', () => {
      mediaOverlayPlaying = false;
      btn.title = rt('readerJs.mediaOverlay');
    });
  }

  async function exportReaderNotesJson() {
    const saved = await loadSavedPosition();
    const payload = {
      version: 1,
      bookId,
      exportedAt: new Date().toISOString(),
      position: saved?.position ?? null,
      progress: saved?.progress ?? 0,
      fraction: savedFraction(saved),
      bookmarks: bookmarksData,
      annotations: annotationsData,
    };
    const json = JSON.stringify(payload, null, 2);
    const fileName = `${(window.__READER_BOOK_TITLE || bookId).replace(/[^\w\s-]/g, '').slice(0, 40)}-notes.json`;
    // В APK у WebView нет DownloadListener — blob:<a> молча ничего не сохраняет.
    // Отдаём JSON через share-мост родителя (тот же путь, что у «Поделиться цитатой»).
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'inpx-reader-share', text: json, title: fileName }, '*');
        return;
      }
    } catch { /* fall through to browser download */ }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    // Синхронный revoke может оборвать скачивание даже там, где оно поддержано.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function importReaderNotesJson(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.bookId && parsed.bookId !== bookId) {
        toast(rt('readerJs.notesImportFail'));
        return;
      }
      for (const bm of parsed.bookmarks || []) {
        if (!bm.position) continue;
        const exists = bookmarksData.some(b => b.position === bm.position);
        if (!exists) {
          try {
            const r = await api('POST', '/bookmarks', { position: bm.position, title: bm.title || '' });
            if (r?.id) bookmarksData.push({ ...bm, id: r.id });
          } catch { /* */ }
        }
      }
      for (const ann of parsed.annotations || []) {
        if (!ann.cfi) continue;
        const exists = annotationsData.some(a => a.cfi === ann.cfi);
        if (!exists) {
          try {
            const r = await api('POST', '/annotations', {
              cfi: ann.cfi,
              text: ann.text || '',
              note: ann.note || '',
              color: ann.color || 'yellow',
            });
            if (r?.id) {
              annotationsData.push({ ...ann, id: r.id });
              drawAnnotation(ann);
            }
          } catch { /* */ }
        }
      }
      if (savedFraction(parsed) > 0 || parsed.position) {
        const f = savedFraction(parsed);
        let baseRevision = 0;
        try {
          const rawStore = localStorage.getItem(`inpx_offline_reader_${bookId}`);
          if (rawStore) {
            const store = JSON.parse(rawStore);
            baseRevision = Number.isInteger(Number(store.baseRevision))
              ? Number(store.baseRevision)
              : (Number.isInteger(Number(store.serverRevision)) ? Number(store.serverRevision) : 0);
          }
        } catch { /* */ }
        await api('POST', '/position', {
          position: String(parsed.position || ''),
          progress: Number(parsed.progress) || fractionToProgress(f),
          fraction: f,
          positionVersion: 4,
          baseRevision,
          sectionIndex: parsed.sectionIndex ?? undefined,
          textOffset: parsed.textOffset ?? undefined,
          textQuote: parsed.textQuote ?? undefined,
          textSectionLength: parsed.textSectionLength ?? undefined,
          fb2Href: parsed.fb2Href ?? undefined,
        });
      }
      renderBmTab();
      renderNotesTab();
      applyAllAnnotations();
      toast(rt('readerJs.notesImported'));
    } catch {
      toast(rt('readerJs.notesImportFail'));
    }
  }

  function initNotesImportExport() {
    const exportBtn = $('notes-export-btn');
    const importBtn = $('notes-import-btn');
    const importFile = $('notes-import-file');
    if (exportBtn) exportBtn.onclick = () => exportReaderNotesJson();
    if (importBtn) importBtn.onclick = () => importFile?.click();
    if (importFile) importFile.onchange = (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) void importReaderNotesJson(file);
    };
  }

  /* ===== Brightness / warmth edge swipes ===== */
  const BRIGHTNESS_MIN_LCD = 0.05;
  const BRIGHTNESS_MIN_EINK = 0;
  const BRIGHTNESS_MAX = 1;
  const WARMTH_MIN = 0;
  const WARMTH_MAX = 1;
  /** Полный ход 0→1 (LCD) за эту высоту свайпа. */
  const LIGHT_SWIPE_PX = 220;
  /** Порог, после которого край считается регулировкой подсветки, а не листанием. */
  const LIGHT_ARM_DY = 8;
  /** Уже с этого сдвига начинаем есть touchmove, чтобы Foliate не копил жест листания. */
  const LIGHT_CLAIM_DY = 3;

  /** Пикселей на 1 raw-шаг: один свайп ~55% высоты экрана покрывает весь 0..max. */
  function lightPixelsPerStep(channelMax) {
    const max = Math.max(1, Number(channelMax) || 32);
    const hostH = view?.getBoundingClientRect?.()?.height || innerHeight || 800;
    const span = Math.max(200, Math.min(480, hostH * 0.55));
    return span / max;
  }

  function brightnessMin() {
    return (isAppEinkMode() || S.theme === 'eink') ? BRIGHTNESS_MIN_EINK : BRIGHTNESS_MIN_LCD;
  }

  let brightnessDrag = null;
  let warmthDrag = null;
  /** Свайп у края обрабатывает native (dispatchTouchEvent) — JS-жест выключен. */
  let nativeLightSwipe = false;
  let nativeLightSwipeWanted = null;
  /** Блокирует листание/тап Foliate до конца текущего касания после регулировки. */
  let suppressBookGesture = false;
  /** Прерванный (touchcancel) жест: следующее касание у того же края продолжает регулировку. */
  let lightDragResume = null;
  const LIGHT_RESUME_MS = 1500;
  const lightAdjustCancelers = new Set();

  /**
   * Палец жеста ищем по identifier: на e-ink к касанию часто добавляется второй
   * «призрачный» тач, а его touchend с проверкой по touches[0] убивал регулировку.
   */
  function findTouchById(list, id) {
    if (!list) return null;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].identifier === id) return list[i];
    }
    return null;
  }

  function takeLightResume(kind) {
    const r = lightDragResume;
    lightDragResume = null;
    if (!r || r.kind !== kind) return null;
    return Date.now() - r.at <= LIGHT_RESUME_MS ? r : null;
  }

  function brightnessEdgeLimitPx() {
    const host = view?.getBoundingClientRect?.();
    const w = host?.width || innerWidth;
    return Math.min(56, Math.max(36, w * 0.12));
  }

  function touchPageX(clientX, doc_) {
    const iframe = doc_?.defaultView?.frameElement;
    if (!iframe) return clientX;
    return iframe.getBoundingClientRect().left + clientX;
  }

  function isLeftEdgeBrightnessZone(pageX) {
    const host = view?.getBoundingClientRect?.();
    if (!host?.width) return pageX <= brightnessEdgeLimitPx();
    return pageX - host.left <= brightnessEdgeLimitPx();
  }

  function isRightEdgeWarmthZone(pageX) {
    if (!nativeWarmthAvailable) return false;
    if (!(isAppEinkMode() || S.theme === 'eink')) return false;
    const host = view?.getBoundingClientRect?.();
    const limit = brightnessEdgeLimitPx();
    if (!host?.width) return pageX >= innerWidth - limit;
    return host.right - pageX <= limit;
  }

  function brightnessGestureBlocked() {
    return panelOverlay?.classList.contains('is-open') || isFootnoteOverlayOpen();
  }

  let lightSliderActive = false;
  let lightSliderCommit = null;
  const lightSliderCommits = new Map();

  function isLightAdjustActive() {
    return Boolean(brightnessDrag?.active || warmthDrag?.active);
  }

  function isLightUiBusy() {
    return Boolean(isLightAdjustActive() || lightSliderActive);
  }

  function beginLightAdjust() {
    suppressBookGesture = true;
    for (const fn of lightAdjustCancelers) {
      try { fn(); } catch { /* */ }
    }
  }

  function eatLightGestureEvent(e, { hard = false } = {}) {
    try { e.preventDefault(); } catch { /* */ }
    try { e.stopPropagation(); } catch { /* */ }
    /* hard — полностью отрезаем Foliate (иначе во время свайпа яркости листает страницу). */
    if (hard) {
      try { e.stopImmediatePropagation(); } catch { /* */ }
    }
  }

  function readBrightnessLevel() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      const v = Number(raw.brightness);
      return Number.isFinite(v) ? Math.min(BRIGHTNESS_MAX, Math.max(brightnessMin(), v)) : 1;
    } catch {
      return 1;
    }
  }

  function persistBrightnessLevel(level) {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      raw.brightness = level;
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(raw));
    } catch { /* */ }
  }

  function lightValueText(level, raw, max) {
    if (Number.isFinite(Number(raw)) && Number.isFinite(Number(max))) return `${raw}/${max}`;
    return `${Math.round(level * 100)}%`;
  }

  /**
   * Только текстовая метка рядом со слайдером. value/step у range input во время
   * драга трогать нельзя — WebView сбрасывает захват ползунка.
   */
  function updateLightLabel(kind) {
    const val = $(kind === 'warmth' ? 'rs-warmth-val' : 'rs-brightness-val');
    if (!val) return;
    const raw = kind === 'warmth' ? lightState?.warmthRaw : lightState?.brightnessRaw;
    const max = kind === 'warmth' ? lightState?.warmthMax : lightState?.brightnessMax;
    const level = kind === 'warmth'
      ? lightState?.warmth
      : (lightState?.brightness ?? lightState?.level);
    val.textContent = lightValueText(Number(level) || 0, raw, max);
  }

  /** HUD со значением: во время свайпа железо молчит, показать значение больше негде. */
  let lightHudEl = null;
  let lightHudAt = 0;
  let lightHudTimer = 0;
  /** Перерисовка на e-ink дорогая: не чаще, но с догоняющим обновлением в конце. */
  const LIGHT_HUD_THROTTLE_MS = 110;

  function showLightHud(text) {
    const now = Date.now();
    const wait = LIGHT_HUD_THROTTLE_MS - (now - lightHudAt);
    if (wait > 0) {
      if (lightHudTimer) clearTimeout(lightHudTimer);
      lightHudTimer = setTimeout(() => {
        lightHudTimer = 0;
        paintLightHud(text);
      }, wait);
      return;
    }
    paintLightHud(text);
  }

  function paintLightHud(text) {
    lightHudAt = Date.now();
    if (!lightHudEl) {
      const el = document.createElement('div');
      el.id = 'reader-light-hud';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)'
        + ';z-index:500;pointer-events:none;padding:10px 18px;border-radius:12px'
        + ';font-size:15px;font-weight:600;white-space:nowrap;text-align:center'
        + ';background:var(--r-bar,#fff);color:var(--r-fg,#111)'
        + ';border:1px solid var(--r-border,#8a8a8a)';
      el.hidden = true;
      // В body, а не в #reader-body: filter яркости на html делал бы его
      // containing block для position:fixed
      document.body?.appendChild(el);
      lightHudEl = el;
    }
    if (lightHudEl.textContent !== text) lightHudEl.textContent = text;
    if (lightHudEl.hidden) lightHudEl.hidden = false;
  }

  function hideLightHud() {
    if (lightHudTimer) {
      clearTimeout(lightHudTimer);
      lightHudTimer = 0;
    }
    if (lightHudEl && !lightHudEl.hidden) lightHudEl.hidden = true;
  }

  function syncBrightnessControls(level) {
    // Во время свайпа/драга не трогаем DOM — на BOOX WebView это обрывает жест.
    if (isLightUiBusy()) return;
    const slider = $('rs-brightness');
    const val = $('rs-brightness-val');
    if (slider) wireLightSliderGuard(slider);
    const steps = Number(lightState?.brightnessSteps);
    if (slider && Number.isFinite(steps) && steps > 1) {
      slider.step = String(1 / (steps - 1));
    }
    if (slider && document.activeElement !== slider) {
      slider.value = String(level);
    }
    if (val) {
      val.textContent = lightValueText(level, lightState?.brightnessRaw, lightState?.brightnessMax);
    }
  }

  function applySoftwareBrightness(level) {
    if (isAppEinkMode() || S.theme === 'eink') {
      clearSoftwareBrightness();
      return;
    }
    const clamped = Math.min(BRIGHTNESS_MAX, Math.max(brightnessMin(), level));
    const filter = clamped < 0.999 ? `brightness(${clamped})` : '';
    document.documentElement.style.filter = filter;
    if (readerBody) readerBody.style.filter = '';
  }

  function clearSoftwareBrightness() {
    document.documentElement.style.filter = '';
    if (readerBody) readerBody.style.filter = '';
  }

  let nativeBrightnessAvailable = false;
  let brightnessInitPending = false;
  let discreteLight = false;
  let lightState = null;
  /** На e-ink rAF почти не тикает — throttle + single-flight вместо rAF. */
  const LIGHT_NATIVE_THROTTLE_MS = 50;
  let pendingNativeBrightness = null;
  let brightnessNativeTimer = 0;
  let brightnessNativeInFlight = false;
  /** Троттлинг записи на железо: реже вызовы → меньше шансов поднять системную шкалу BOOX. */
  const LIGHT_WRITE_THROTTLE_MS = 90;
  /** Ответ моста iframe→parent→plugin может потеряться; без сторожа очередь залипает. */
  const LIGHT_WRITE_TIMEOUT_MS = 1200;
  let pendingRawTarget = { brightnessRaw: null, warmthRaw: null };
  let rawTargetTimer = 0;
  let rawTargetInFlight = false;
  let rawTargetWatchdog = 0;

  /** Дискретный raw-путь только на Onyx. На телефоне всегда float + Window brightness. */
  function isDiscreteLight() {
    return Boolean(
      lightState?.onyx
      && (Number(lightState?.brightnessMax) > 0 || discreteLight)
      && (window.__INPX_NATIVE?.setFrontLightRaw || window.__INPX_NATIVE?.adjustFrontLight),
    );
  }

  function applyLightStateFromNative(res, { persist = false, force = false } = {}) {
    if (!res) return null;
    // Во время свайпа/слайдера UI ведём оптимистично — ответ native не должен откатывать
    if (!force && isLightUiBusy()) {
      if (persist) {
        const br = Number(res.brightness ?? res.level);
        if (Number.isFinite(br)) persistBrightnessLevel(br);
        if (Number.isFinite(Number(res.warmth))) persistWarmthLevel(Number(res.warmth));
      }
      return Number(res.brightness ?? res.level);
    }
    const br = Number(res.brightness ?? res.level);
    if (!Number.isFinite(br) && !Number.isFinite(Number(res.brightnessRaw))) return null;
    const onyx = res.onyx === true;
    lightState = onyx
      ? res
      : { ...res, onyx: false, brightness: br, level: br };
    // Никогда не включать raw-режим на обычном LCD/OLED
    discreteLight = onyx && (Number(res.brightnessSteps) > 1 || Number(res.brightnessMax) > 0);
    const level = Number.isFinite(br) ? br : 0;
    syncBrightnessControls(level);
    if (persist) persistBrightnessLevel(level);
    if (onyx && (res.warmthSupported || Number(res.warmthMax) > 0) && Number.isFinite(Number(res.warmth))) {
      nativeWarmthAvailable = true;
      syncWarmthControls(Number(res.warmth));
      if (persist) persistWarmthLevel(Number(res.warmth));
    }
    return level;
  }

  function optimisticBrightnessRaw(raw) {
    if (!lightState?.onyx) return null;
    const max = Math.max(1, Number(lightState?.brightnessMax) || 32);
    const v = Math.max(0, Math.min(max, Math.round(raw)));
    lightState = {
      ...(lightState || {}),
      onyx: true,
      brightnessRaw: v,
      brightnessMax: max,
      brightnessSteps: max + 1,
      brightness: v / max,
    };
    discreteLight = true;
    // Не syncBrightnessControls во время жеста — только in-memory
    if (!isLightUiBusy()) syncBrightnessControls(v / max);
    return v;
  }

  function optimisticWarmthRaw(raw) {
    const max = Math.max(1, Number(lightState?.warmthMax) || 32);
    const v = Math.max(0, Math.min(max, Math.round(raw)));
    lightState = {
      ...(lightState || {}),
      warmthRaw: v,
      warmthMax: max,
      warmthSteps: max + 1,
      warmth: v / max,
      warmthSupported: true,
    };
    nativeWarmthAvailable = true;
    if (!isLightUiBusy()) syncWarmthControls(v / max);
    return v;
  }

  function refreshLightState() {
    if (!window.__INPX_NATIVE?.getFrontLightState) {
      return Promise.resolve(null);
    }
    return window.__INPX_NATIVE.getFrontLightState()
      .then((res) => {
        if (res?.onyx === false) return null;
        applyLightStateFromNative(res, { persist: false, force: !isLightUiBusy() });
        return res;
      })
      .catch(() => null);
  }

  function flushRawTarget({ immediate = false } = {}) {
    if (rawTargetTimer) {
      clearTimeout(rawTargetTimer);
      rawTargetTimer = 0;
    }
    if (rawTargetInFlight) return;
    const br = pendingRawTarget.brightnessRaw;
    const warm = pendingRawTarget.warmthRaw;
    if (br == null && warm == null) return;
    pendingRawTarget = { brightnessRaw: null, warmthRaw: null };
    rawTargetInFlight = true;
    const payload = {};
    if (br != null) payload.brightnessRaw = br;
    if (warm != null) payload.warmthRaw = warm;
    const send = window.__INPX_NATIVE?.setFrontLightRaw
      ? window.__INPX_NATIVE.setFrontLightRaw(payload)
      : Promise.all([
        br != null && window.__INPX_NATIVE?.setBrightness
          ? window.__INPX_NATIVE.setBrightness(
            br / Math.max(1, Number(lightState?.brightnessMax) || 32),
          )
          : null,
        warm != null && window.__INPX_NATIVE?.setWarmth
          ? window.__INPX_NATIVE.setWarmth(
            warm / Math.max(1, Number(lightState?.warmthMax) || 32),
          )
          : null,
      ]).then((rows) => rows.find(Boolean) || null);
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (rawTargetWatchdog) {
        clearTimeout(rawTargetWatchdog);
        rawTargetWatchdog = 0;
      }
      rawTargetInFlight = false;
      if (pendingRawTarget.brightnessRaw != null || pendingRawTarget.warmthRaw != null) {
        if (immediate) flushRawTarget({ immediate: true });
        else {
          rawTargetTimer = setTimeout(() => flushRawTarget(), LIGHT_WRITE_THROTTLE_MS);
        }
      }
    };
    rawTargetWatchdog = setTimeout(settle, LIGHT_WRITE_TIMEOUT_MS);
    Promise.resolve(send)
      .then((res) => {
        // Опоздавший ответ (сторож уже сработал) не должен откатывать шкалу
        if (!settled) applyLightStateFromNative(res, { persist: false });
      })
      .catch(() => {})
      .finally(settle);
  }

  function queueRawTarget({ brightnessRaw = null, warmthRaw = null } = {}, { flush = false } = {}) {
    if (brightnessRaw != null) pendingRawTarget.brightnessRaw = brightnessRaw;
    if (warmthRaw != null) pendingRawTarget.warmthRaw = warmthRaw;
    if (flush) {
      flushRawTarget({ immediate: true });
      return;
    }
    if (rawTargetInFlight || rawTargetTimer) return;
    rawTargetTimer = setTimeout(() => flushRawTarget(), LIGHT_WRITE_THROTTLE_MS);
  }

  function pumpNativeBrightness() {
    if (brightnessNativeInFlight) return;
    if (pendingNativeBrightness == null) return;
    if (!window.__INPX_NATIVE?.setBrightness) {
      pendingNativeBrightness = null;
      return;
    }
    const level = pendingNativeBrightness;
    pendingNativeBrightness = null;
    brightnessNativeInFlight = true;
    Promise.resolve(window.__INPX_NATIVE.setBrightness(level))
      .then((res) => { applyLightStateFromNative(res, { persist: false }); })
      .catch(() => {})
      .finally(() => {
        brightnessNativeInFlight = false;
        if (pendingNativeBrightness != null) pumpNativeBrightness();
      });
  }

  function queueNativeBrightness(level, { flush = false } = {}) {
    pendingNativeBrightness = level;
    if (flush && brightnessNativeTimer) {
      clearTimeout(brightnessNativeTimer);
      brightnessNativeTimer = 0;
    }
    if (brightnessNativeInFlight) return;
    if (flush) {
      pumpNativeBrightness();
      return;
    }
    if (brightnessNativeTimer) return;
    // setTimeout, не rAF: на e-ink rAF почти не вызывается → жест «замирает»
    brightnessNativeTimer = setTimeout(() => {
      brightnessNativeTimer = 0;
      pumpNativeBrightness();
    }, LIGHT_NATIVE_THROTTLE_MS);
  }

  /**
   * Пока палец на слайдере — в железо не пишем. Первая же запись поднимает системную
   * шкалу подсветки BOOX, окно теряет фокус, и Chromium отменяет драг ползунка.
   * Нативный свайп это переживает (он ниже WebView), драг внутри страницы — нет.
   */
  function lightWriteDeferred(persist) {
    return Boolean(lightSliderActive) && !persist && Boolean(lightState?.onyx);
  }

  function applyBrightnessLevel(level, { persist = false } = {}) {
    const clamped = Math.min(BRIGHTNESS_MAX, Math.max(brightnessMin(), level));
    if (isDiscreteLight()) {
      const max = Math.max(1, Number(lightState?.brightnessMax) || 32);
      const raw = optimisticBrightnessRaw(clamped * max);
      if (lightWriteDeferred(persist)) updateLightLabel('brightness');
      else if (raw != null) queueRawTarget({ brightnessRaw: raw }, { flush: persist });
      if (persist) persistBrightnessLevel(clamped);
      if (!isLightUiBusy()) syncBrightnessControls(clamped);
      return clamped;
    }
    if (nativeBrightnessAvailable && window.__INPX_NATIVE?.setBrightness) {
      // Телефон: Window.screenBrightness. Onyx без discrete — тот же float-путь.
      clearSoftwareBrightness();
      if (!lightWriteDeferred(persist)) queueNativeBrightness(clamped, { flush: persist });
    } else if (isAppEinkMode()) {
      // На e-ink без native API программный filter бесполезен
      clearSoftwareBrightness();
    } else {
      applySoftwareBrightness(clamped);
    }
    if (!isLightAdjustActive() || !lightState?.onyx) {
      lightState = { ...(lightState || {}), onyx: false, brightness: clamped, level: clamped };
    }
    if (!isLightUiBusy()) syncBrightnessControls(clamped);
    if (persist) persistBrightnessLevel(clamped);
    return clamped;
  }

  let nativeWarmthAvailable = false;
  let pendingNativeWarmth = null;
  let warmthNativeTimer = 0;
  let warmthNativeInFlight = false;
  let warmthProbeStarted = false;

  function readWarmthLevel() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      const v = Number(raw.warmth);
      return Number.isFinite(v) ? Math.min(WARMTH_MAX, Math.max(WARMTH_MIN, v)) : 0.5;
    } catch {
      return 0.5;
    }
  }

  function persistWarmthLevel(level) {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
      raw.warmth = level;
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(raw));
    } catch { /* */ }
  }

  function syncWarmthControls(level) {
    if (isLightUiBusy()) return;
    const slider = $('rs-warmth');
    const val = $('rs-warmth-val');
    if (slider) wireLightSliderGuard(slider);
    const steps = Number(lightState?.warmthSteps);
    if (slider && Number.isFinite(steps) && steps > 1) {
      slider.step = String(1 / (steps - 1));
    }
    if (slider && document.activeElement !== slider) {
      slider.value = String(level);
    }
    if (val) {
      val.textContent = lightValueText(level, lightState?.warmthRaw, lightState?.warmthMax);
    }
  }

  function pumpNativeWarmth() {
    if (warmthNativeInFlight) return;
    if (pendingNativeWarmth == null) return;
    if (!window.__INPX_NATIVE?.setWarmth) {
      pendingNativeWarmth = null;
      return;
    }
    const level = pendingNativeWarmth;
    pendingNativeWarmth = null;
    warmthNativeInFlight = true;
    Promise.resolve(window.__INPX_NATIVE.setWarmth(level))
      .then((res) => { applyLightStateFromNative(res, { persist: false }); })
      .catch(() => {})
      .finally(() => {
        warmthNativeInFlight = false;
        if (pendingNativeWarmth != null) pumpNativeWarmth();
      });
  }

  function queueNativeWarmth(level, { flush = false } = {}) {
    pendingNativeWarmth = level;
    if (flush && warmthNativeTimer) {
      clearTimeout(warmthNativeTimer);
      warmthNativeTimer = 0;
    }
    if (warmthNativeInFlight) return;
    if (flush) {
      pumpNativeWarmth();
      return;
    }
    if (warmthNativeTimer) return;
    warmthNativeTimer = setTimeout(() => {
      warmthNativeTimer = 0;
      pumpNativeWarmth();
    }, LIGHT_NATIVE_THROTTLE_MS);
  }

  function applyWarmthLevel(level, { persist = false } = {}) {
    if (!nativeWarmthAvailable) return readWarmthLevel();
    const clamped = Math.min(WARMTH_MAX, Math.max(WARMTH_MIN, level));
    if (isDiscreteLight()) {
      const max = Math.max(1, Number(lightState?.warmthMax) || 32);
      const raw = optimisticWarmthRaw(clamped * max);
      if (lightWriteDeferred(persist)) updateLightLabel('warmth');
      else queueRawTarget({ warmthRaw: raw }, { flush: persist });
      if (persist) persistWarmthLevel(clamped);
      if (!isLightUiBusy()) syncWarmthControls(clamped);
      return clamped;
    }
    if (!lightWriteDeferred(persist)) queueNativeWarmth(clamped, { flush: persist });
    if (!isLightUiBusy()) syncWarmthControls(clamped);
    if (persist) persistWarmthLevel(clamped);
    return clamped;
  }

  function wireLightSliderGuard(slider) {
    if (!slider || slider.dataset.lightGuardWired) return;
    slider.dataset.lightGuardWired = '1';
    const isWarmth = slider.id === 'rs-warmth';
    /* Отпускание (в т.ч. pointercancel от системного оверлея) — единственная точка
     * записи в железо; pointerup и change приходят оба, поэтому дедуп по значению. */
    const commit = () => {
      const level = Number(slider.value);
      lightSliderActive = false;
      if (!Number.isFinite(level)) return;
      if (slider.dataset.lightCommitted === String(level)) return;
      slider.dataset.lightCommitted = String(level);
      if (isWarmth) {
        applyWarmthLevel(level, { persist: true });
        syncWarmthControls(Number(lightState?.warmth ?? level));
      } else {
        applyBrightnessLevel(level, { persist: true });
        syncBrightnessControls(Number(lightState?.brightness ?? level));
      }
    };
    lightSliderCommits.set(slider.id, commit);
    const on = () => {
      lightSliderActive = true;
      lightSliderCommit = commit;
      delete slider.dataset.lightCommitted;
    };
    slider.addEventListener('pointerdown', on);
    slider.addEventListener('touchstart', on, { passive: true });
    slider.addEventListener('pointerup', commit);
    slider.addEventListener('pointercancel', commit);
    slider.addEventListener('touchend', commit);
    slider.addEventListener('touchcancel', commit);
    slider.addEventListener('change', commit);
  }

  /**
   * Слайдеры подсветки создаёт native-мост, порядок относительно первого sync не
   * гарантирован — ловим касание делегированием, чтобы флаг «палец на слайдере»
   * встал до первого input, и страхуем отпускание вне ползунка.
   */
  function wireLightSliderDelegation() {
    if (document.documentElement.dataset.lightSliderDelegated) return;
    document.documentElement.dataset.lightSliderDelegated = '1';
    const claim = (e) => {
      const el = e.target;
      if (el?.id !== 'rs-brightness' && el?.id !== 'rs-warmth') return;
      wireLightSliderGuard(el);
      lightSliderActive = true;
      lightSliderCommit = lightSliderCommits.get(el.id) || lightSliderCommit;
      delete el.dataset.lightCommitted;
    };
    const release = () => {
      if (lightSliderActive) lightSliderCommit?.();
    };
    document.addEventListener('pointerdown', claim, { capture: true });
    document.addEventListener('touchstart', claim, { capture: true, passive: true });
    document.addEventListener('pointerup', release, { capture: true });
    document.addEventListener('pointercancel', release, { capture: true });
    document.addEventListener('touchend', release, { capture: true });
    document.addEventListener('touchcancel', release, { capture: true });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    if (e.data?.type !== 'inpx-native-ready') return;
    brightnessInitPending = false;
    nativeBrightnessAvailable = Boolean(e.data.ready);
    // Только читаем с устройства. Не пишем localStorage → железу при старте.
    if (nativeBrightnessAvailable && window.__INPX_NATIVE?.getFrontLightState) {
      refreshLightState().then((res) => {
        if (isLightAdjustActive()) return;
        if (res) applyLightStateFromNative(res, { persist: true });
        else if (!(isAppEinkMode() || S.theme === 'eink')) {
          applyBrightnessLevel(readBrightnessLevel(), { persist: false });
        }
      });
    } else if (nativeBrightnessAvailable && window.__INPX_NATIVE?.getBrightness) {
      window.__INPX_NATIVE.getBrightness().then((res) => {
        if (isLightAdjustActive()) return;
        if (applyLightStateFromNative(res, { persist: true }) != null) return;
        if (!(isAppEinkMode() || S.theme === 'eink')) {
          applyBrightnessLevel(readBrightnessLevel(), { persist: false });
        }
      }).catch(() => {
        if (!(isAppEinkMode() || S.theme === 'eink')) {
          applyBrightnessLevel(readBrightnessLevel(), { persist: false });
        }
      });
    } else if (!(isAppEinkMode() || S.theme === 'eink')) {
      applyBrightnessLevel(readBrightnessLevel(), { persist: false });
    }
    initWarmthGesture();
  });

  function initBrightnessGesture() {
    window.__INPX_SET_BRIGHTNESS = (level, opts) => applyBrightnessLevel(level, opts || {});
    wireLightSliderDelegation();
    if (window.__INPX_NATIVE?.setBrightness && window.parent !== window) {
      brightnessInitPending = true;
      window.parent.postMessage({ type: 'inpx-reader-native-handshake' }, '*');
      setTimeout(() => {
        if (!brightnessInitPending) return;
        brightnessInitPending = false;
        // Без записи на устройство: только LCD software / уже прочитанное состояние
        if (!(isAppEinkMode() || S.theme === 'eink')) {
          applyBrightnessLevel(readBrightnessLevel(), { persist: false });
        }
        initWarmthGesture();
      }, 500);
    } else if (!(isAppEinkMode() || S.theme === 'eink')) {
      applyBrightnessLevel(readBrightnessLevel(), { persist: false });
      initWarmthGesture();
    } else {
      initWarmthGesture();
    }
    if (!readerBody || readerBody.dataset.brightnessEdgeWired) return;
    readerBody.dataset.brightnessEdgeWired = '1';
    wireBrightnessEdge(readerBody);
  }

  /**
   * Включает/выключает нативный свайп подсветки. Пока открыта панель или ушла сама
   * читалка, жест обязан молчать: он живёт в dispatchTouchEvent и иначе перехватывает
   * касание раньше слайдеров настроек и списков — те обрываются на первом же движении.
   */
  function syncNativeLightSwipe(force) {
    if (!window.__INPX_NATIVE?.setLightSwipe) return;
    const wanted = force === false ? false : !brightnessGestureBlocked();
    if (nativeLightSwipeWanted === wanted) return;
    nativeLightSwipeWanted = wanted;
    window.__INPX_NATIVE.setLightSwipe({ enabled: wanted })
      .then((res) => {
        if (res?.supported) nativeLightSwipe = true;
        else if (res?.active === false && !res?.supported) nativeLightSwipe = false;
      })
      .catch(() => {});
  }

  /** Любой путь открытия/закрытия панели (кнопка, backdrop, popstate) — один и тот же класс. */
  function watchPanelForLightSwipe() {
    if (!panelOverlay || panelOverlay.dataset.lightSwipeWatched) return;
    panelOverlay.dataset.lightSwipeWatched = '1';
    new MutationObserver(() => {
      syncNativeLightSwipe();
      if (panelOverlay.classList.contains('is-open')) refreshLightState();
    }).observe(panelOverlay, { attributes: true, attributeFilter: ['class'] });
    // Сноска открывается тремя разными путями, общий у них только класс на body
    new MutationObserver(() => syncNativeLightSwipe())
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  let lightSwipeWired = false;

  /** Жест живёт в native, поэтому его состояние и результат надо забирать событиями. */
  function wireNativeLightSwipe() {
    if (lightSwipeWired) return;
    lightSwipeWired = true;
    watchPanelForLightSwipe();
    window.addEventListener('inpx-native-front-light', (e) => {
      applyLightStateFromNative(e.detail, { persist: true, force: !isLightUiBusy() });
    });
    window.addEventListener('pagehide', () => syncNativeLightSwipe(false));
  }

  function initWarmthGesture() {
    window.__INPX_SET_WARMTH = (level, opts) => applyWarmthLevel(level, opts || {});
    syncNativeLightSwipe();
    wireNativeLightSwipe();
    if (!readerBody?.dataset.warmthEdgeWired && readerBody) {
      readerBody.dataset.warmthEdgeWired = '1';
      wireWarmthEdge(readerBody);
    }
    if (warmthProbeStarted || !window.__INPX_NATIVE?.getWarmth) return;
    warmthProbeStarted = true;
    window.__INPX_NATIVE.getWarmth().then((res) => {
      nativeWarmthAvailable = Boolean(res?.supported || res?.warmthSupported);
      if (!nativeWarmthAvailable || isLightAdjustActive()) return;
      // Не прогонять через applyLightStateFromNative — там level путался с brightness на LCD
      const level = Number(res?.warmth ?? res?.level);
      if (Number.isFinite(level)) {
        syncWarmthControls(level);
        persistWarmthLevel(level);
      }
    }).catch(() => {
      nativeWarmthAvailable = false;
    });
  }

  function onBrightnessTouchStart(e, doc_) {
    if (nativeLightSwipe) return;
    if (!isTouch.matches || brightnessGestureBlocked()) return;
    if (e.touches.length !== 1) return;
    if (warmthDrag) return;
    const t = e.touches[0];
    if (!isLeftEdgeBrightnessZone(touchPageX(t.clientX, doc_))) return;
    // Не глушить тап: suppress только когда свайп яркости реально начался.
    const resume = takeLightResume('brightness');
    brightnessDrag = {
      id: t.identifier,
      x0: t.clientX,
      yPrev: t.clientY,
      startY: t.clientY,
      armDy: resume ? LIGHT_CLAIM_DY : LIGHT_ARM_DY,
      rawFloat: resume ? resume.rawFloat : null,
      levelFloat: resume ? resume.levelFloat : null,
      startRaw: Number(lightState?.brightnessRaw),
      startLevel: Number(lightState?.brightness ?? lightState?.level ?? readBrightnessLevel()),
      active: false,
    };
  }

  function onBrightnessTouchMove(e) {
    if (!brightnessDrag) return false;
    if (warmthDrag?.active) {
      brightnessDrag = null;
      return false;
    }
    const t = findTouchById(e.touches, brightnessDrag.id);
    if (!t) return false;
    const adx = Math.abs(t.clientX - brightnessDrag.x0);
    const dyFromStart = Math.abs(t.clientY - brightnessDrag.startY);
    if (!brightnessDrag.active) {
      // Горизонталь — уступаем жесту меню с края; снимаем suppress
      if (adx > dyFromStart * 0.75 && adx > LIGHT_ARM_DY) {
        brightnessDrag = null;
        if (!warmthDrag?.active) suppressBookGesture = false;
        return false;
      }
      // Рано едим move, пока Foliate не накопил свайп листания
      if (dyFromStart >= LIGHT_CLAIM_DY && adx <= dyFromStart) {
        eatLightGestureEvent(e, { hard: true });
      }
      if (dyFromStart < brightnessDrag.armDy) return false;
      brightnessDrag.active = true;
      brightnessDrag.yPrev = t.clientY;
      if (!Number.isFinite(brightnessDrag.startRaw)) {
        brightnessDrag.startRaw = Number(lightState?.brightnessRaw) || 0;
      }
      if (!Number.isFinite(brightnessDrag.startLevel)) {
        brightnessDrag.startLevel = Number(
          lightState?.brightness ?? lightState?.level ?? readBrightnessLevel(),
        );
      }
      brightnessDrag.startY = t.clientY;
      brightnessDrag.stepPx = lightPixelsPerStep(Number(lightState?.brightnessMax) || 32);
      if (!Number.isFinite(brightnessDrag.rawFloat)) {
        brightnessDrag.rawFloat = Number.isFinite(Number(lightState?.brightnessRaw))
          ? Number(lightState.brightnessRaw)
          : (Number(brightnessDrag.startRaw) || 0);
      }
      if (!Number.isFinite(brightnessDrag.levelFloat)) {
        brightnessDrag.levelFloat = brightnessDrag.startLevel;
      }
      warmthDrag = null;
      beginLightAdjust();
      eatLightGestureEvent(e, { hard: true });
      return true;
    }
    // Относительная дельта от yPrev — «туда-сюда» без привязки к startY
    // (абсолют ломался, когда native/sync сбрасывал якорь).
    const dy = brightnessDrag.yPrev - t.clientY;
    brightnessDrag.yPrev = t.clientY;
    if (isDiscreteLight()) {
      const max = Math.max(1, Number(lightState?.brightnessMax) || 32);
      const stepPx = brightnessDrag.stepPx || lightPixelsPerStep(max);
      // Копим дробь в rawFloat: округление на каждом move съедало движения
      // по 1–3 px, и медленный свайп вообще не сдвигал шкалу.
      const base = Number.isFinite(brightnessDrag.rawFloat) ? brightnessDrag.rawFloat : 0;
      const next = Math.max(0, Math.min(max, base + dy / stepPx));
      brightnessDrag.rawFloat = next;
      const raw = optimisticBrightnessRaw(next);
      if (raw != null && raw !== brightnessDrag.sentRaw) {
        brightnessDrag.sentRaw = raw;
        queueRawTarget({ brightnessRaw: raw });
      }
    } else {
      const base = Number.isFinite(brightnessDrag.levelFloat) ? brightnessDrag.levelFloat : 1;
      const next = Math.min(
        BRIGHTNESS_MAX,
        Math.max(brightnessMin(), base + dy / LIGHT_SWIPE_PX),
      );
      brightnessDrag.levelFloat = next;
      applyBrightnessLevel(next);
    }
    eatLightGestureEvent(e, { hard: true });
    return true;
  }

  function onBrightnessTouchEnd(e) {
    if (!brightnessDrag) return false;
    if (!findTouchById(e.changedTouches, brightnessDrag.id)) {
      // Отпустили лишний палец — регулировка продолжается
      if (brightnessDrag.active) {
        eatLightGestureEvent(e, { hard: true });
        return true;
      }
      return false;
    }
    const wasActive = brightnessDrag.active;
    // Сброс до persist/sync: пока drag жив, syncBrightnessControls себя блокирует
    brightnessDrag = null;
    if (wasActive) {
      if (isDiscreteLight()) {
        const raw = Number(lightState?.brightnessRaw);
        if (Number.isFinite(raw)) queueRawTarget({ brightnessRaw: raw }, { flush: true });
        const br = Number(lightState?.brightness ?? readBrightnessLevel());
        persistBrightnessLevel(br);
        syncBrightnessControls(br);
      } else {
        const br = Number(lightState?.brightness ?? lightState?.level ?? readBrightnessLevel());
        applyBrightnessLevel(br, { persist: true });
      }
      suppressBookGesture = true;
      // hard: иначе Foliate на touchend всё равно перелистнёт
      eatLightGestureEvent(e, { hard: true });
    }
    return wasActive;
  }

  function wireBrightnessEdge(doc_) {
    doc_.addEventListener('touchstart', (e) => onBrightnessTouchStart(e, doc_), { capture: true, passive: true });
    doc_.addEventListener('touchmove', (e) => { onBrightnessTouchMove(e); }, { capture: true, passive: false });
    doc_.addEventListener('touchend', (e) => { onBrightnessTouchEnd(e); }, { capture: true, passive: false });
    doc_.addEventListener('touchcancel', (e) => {
      if (!brightnessDrag) return;
      if (!findTouchById(e.changedTouches, brightnessDrag.id)) return;
      const drag = brightnessDrag;
      brightnessDrag = null;
      if (!drag.active) return;
      suppressBookGesture = true;
      if (isDiscreteLight()) {
        const raw = Number(lightState?.brightnessRaw);
        if (Number.isFinite(raw)) queueRawTarget({ brightnessRaw: raw }, { flush: true });
      }
      const br = Number(lightState?.brightness ?? readBrightnessLevel());
      persistBrightnessLevel(br);
      syncBrightnessControls(br);
      // BOOX отменяет касание системным оверлеем подсветки — даём продолжить с того же места
      lightDragResume = {
        kind: 'brightness',
        at: Date.now(),
        rawFloat: drag.rawFloat,
        levelFloat: drag.levelFloat,
      };
    }, { capture: true, passive: true });
  }

  function onWarmthTouchStart(e, doc_) {
    if (nativeLightSwipe) return;
    if (!isTouch.matches || brightnessGestureBlocked()) return;
    if (!nativeWarmthAvailable) return;
    if (e.touches.length !== 1) return;
    if (brightnessDrag) return;
    const t = e.touches[0];
    if (!isRightEdgeWarmthZone(touchPageX(t.clientX, doc_))) return;
    const resume = takeLightResume('warmth');
    warmthDrag = {
      id: t.identifier,
      x0: t.clientX,
      yPrev: t.clientY,
      startY: t.clientY,
      armDy: resume ? LIGHT_CLAIM_DY : LIGHT_ARM_DY,
      rawFloat: resume ? resume.rawFloat : null,
      levelFloat: resume ? resume.levelFloat : null,
      startRaw: Number(lightState?.warmthRaw),
      active: false,
    };
  }

  function onWarmthTouchMove(e) {
    if (!warmthDrag) return false;
    if (brightnessDrag?.active) {
      warmthDrag = null;
      return false;
    }
    const t = findTouchById(e.touches, warmthDrag.id);
    if (!t) return false;
    const adx = Math.abs(t.clientX - warmthDrag.x0);
    const dyFromStart = Math.abs(t.clientY - warmthDrag.startY);
    if (!warmthDrag.active) {
      if (adx > dyFromStart * 0.75 && adx > LIGHT_ARM_DY) {
        warmthDrag = null;
        if (!brightnessDrag?.active) suppressBookGesture = false;
        return false;
      }
      if (dyFromStart >= LIGHT_CLAIM_DY && adx <= dyFromStart) {
        eatLightGestureEvent(e, { hard: true });
      }
      if (dyFromStart < warmthDrag.armDy) return false;
      warmthDrag.active = true;
      warmthDrag.yPrev = t.clientY;
      if (!Number.isFinite(warmthDrag.startRaw)) {
        warmthDrag.startRaw = Number(lightState?.warmthRaw) || 0;
      }
      warmthDrag.startY = t.clientY;
      warmthDrag.stepPx = lightPixelsPerStep(Number(lightState?.warmthMax) || 32);
      if (!Number.isFinite(warmthDrag.rawFloat)) {
        warmthDrag.rawFloat = Number.isFinite(Number(lightState?.warmthRaw))
          ? Number(lightState.warmthRaw)
          : (Number(warmthDrag.startRaw) || 0);
      }
      if (!Number.isFinite(warmthDrag.levelFloat)) {
        warmthDrag.levelFloat = Number(lightState?.warmth ?? readWarmthLevel());
      }
      brightnessDrag = null;
      beginLightAdjust();
      eatLightGestureEvent(e, { hard: true });
      return true;
    }
    const dy = warmthDrag.yPrev - t.clientY;
    warmthDrag.yPrev = t.clientY;
    if (isDiscreteLight()) {
      const max = Math.max(1, Number(lightState?.warmthMax) || 32);
      const stepPx = warmthDrag.stepPx || lightPixelsPerStep(max);
      const base = Number.isFinite(warmthDrag.rawFloat) ? warmthDrag.rawFloat : 0;
      const next = Math.max(0, Math.min(max, base + dy / stepPx));
      warmthDrag.rawFloat = next;
      const raw = optimisticWarmthRaw(next);
      if (raw != null && raw !== warmthDrag.sentRaw) {
        warmthDrag.sentRaw = raw;
        /* В железо пишем только на отпускании: setLightValue(TEMP) на BOOX поднимает
         * системную шкалу подсветки, окно теряет захват касания и свайп обрывается. */
        showLightHud(`Температура ${raw}/${max}`);
      }
    } else {
      const base = Number.isFinite(warmthDrag.levelFloat) ? warmthDrag.levelFloat : 0.5;
      const next = Math.min(
        WARMTH_MAX,
        Math.max(WARMTH_MIN, base + dy / LIGHT_SWIPE_PX),
      );
      warmthDrag.levelFloat = next;
      applyWarmthLevel(next);
    }
    eatLightGestureEvent(e, { hard: true });
    return true;
  }

  function onWarmthTouchEnd(e) {
    if (!warmthDrag) return false;
    if (!findTouchById(e.changedTouches, warmthDrag.id)) {
      if (warmthDrag.active) {
        eatLightGestureEvent(e, { hard: true });
        return true;
      }
      return false;
    }
    const wasActive = warmthDrag.active;
    warmthDrag = null;
    hideLightHud();
    if (wasActive) {
      if (isDiscreteLight()) {
        const raw = Number(lightState?.warmthRaw);
        if (Number.isFinite(raw)) queueRawTarget({ warmthRaw: raw }, { flush: true });
        const w = Number(lightState?.warmth ?? readWarmthLevel());
        persistWarmthLevel(w);
        syncWarmthControls(w);
      } else {
        applyWarmthLevel(Number(lightState?.warmth ?? readWarmthLevel()), { persist: true });
      }
      suppressBookGesture = true;
      eatLightGestureEvent(e, { hard: true });
    }
    return wasActive;
  }

  function wireWarmthEdge(doc_) {
    doc_.addEventListener('touchstart', (e) => onWarmthTouchStart(e, doc_), { capture: true, passive: true });
    doc_.addEventListener('touchmove', (e) => { onWarmthTouchMove(e); }, { capture: true, passive: false });
    doc_.addEventListener('touchend', (e) => { onWarmthTouchEnd(e); }, { capture: true, passive: false });
    doc_.addEventListener('touchcancel', (e) => {
      if (!warmthDrag) return;
      if (!findTouchById(e.changedTouches, warmthDrag.id)) return;
      const drag = warmthDrag;
      warmthDrag = null;
      hideLightHud();
      if (!drag.active) return;
      suppressBookGesture = true;
      if (isDiscreteLight()) {
        const raw = Number(lightState?.warmthRaw);
        if (Number.isFinite(raw)) queueRawTarget({ warmthRaw: raw }, { flush: true });
      }
      const w = Number(lightState?.warmth ?? readWarmthLevel());
      persistWarmthLevel(w);
      syncWarmthControls(w);
      lightDragResume = {
        kind: 'warmth',
        at: Date.now(),
        rawFloat: drag.rawFloat,
        levelFloat: drag.levelFloat,
      };
    }, { capture: true, passive: true });
  }

  function wireDoc(doc) {
    if (readerWiredDocs.has(doc)) return;
    readerWiredDocs.add(doc);

    wireBrightnessEdge(doc);
    wireWarmthEdge(doc);
    wireDictionary(doc);

    doc.addEventListener('keydown', handleKeydown);

    let pinchStartDist = 0;
    let pinchStartSize = 0;
    let pinchPendingSize = 0;
    function touchDistPinch(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    function applyPinchFontSize(size) {
      const next = Math.round(Math.min(32, Math.max(12, size)));
      pinchPendingSize = next;
      if (next === S.fontSize) return;
      S.fontSize = next;
      refreshSettingsUI();
      requestApplySettings();
    }
    function commitPinchFont() {
      if (!pinchStartDist) {
        pinchPendingSize = 0;
        return;
      }
      pinchStartDist = 0;
      const pending = pinchPendingSize;
      pinchPendingSize = 0;
      if (pending && pending !== S.fontSize) {
        S.fontSize = pending;
        refreshSettingsUI();
      }
      flushApplySettings();
    }

    /* Тап по ссылке в режиме колонок: foliate на touchmove/touchend листает страницу и
     * перебивает клик; pointerup у нас срабатывает до click и зоны листания тоже мешают.
     * Не вызывать preventDefault на touchmove — иначе WebKit часто шлёт touchcancel, touchend
     * не обрабатывает жест, а synthetic click не вызывается.
     * Зоны тапа (меню, листание) работают и в scrolled — иначе верхняя панель
     * не открывается, а соседняя глава не загружается (Foliate держит одну секцию). */
    const LINK_TAP_SLOP = 28;
    let linkTapTouch = null;
    const isFlowPaginated = () => S.layout !== 'scrolled';

    /** Макс. сдвиг пальца для «тапа»; Foliate на touchmove листает при меньшем dx — см. touchmove cancel. */
    const TAP_SLOP_PX = 22;
    const TAP_MAX_MS = 700;
    const TAP_LONG_MS = 480;
    /** Любой touchmove дальше — не тап (иначе после лёгкого drag Foliate touchend + наш тап = двойной сдвиг). */
    const TAP_CANCEL_MOVE_PX = 10;
    const EDGE_MENU_PX = 24;
    const EDGE_MENU_MIN_DX = 48;
    let screenTapTrack = null;
    let edgeMenuTrack = null;

    /**
     * Координаты тапа относительно видимого foliate-view + id зоны 3×3.
     * clientX/Y в iframe → page coords через frameElement.
     */
    function tapCoordsInHost(clientX, clientY, doc_) {
      const win = doc_?.defaultView;
      const iframe = win?.frameElement;
      const host = view?.getBoundingClientRect?.();
      if (!iframe || !host?.width) return null;
      const fr = iframe.getBoundingClientRect();
      const px = fr.left + clientX;
      const py = fr.top + clientY;
      const fx = Math.max(0, Math.min(1, (px - host.left) / Math.max(1, host.width)));
      const fy = Math.max(0, Math.min(1, (py - host.top) / Math.max(1, host.height)));
      const el = doc_?.documentElement;
      const wm = (el && win?.getComputedStyle(el).writingMode || 'horizontal-tb').toLowerCase();
      const zone = resolveTapZone9(fx, fy, { verticalWriting: wm.startsWith('vertical') });
      return { fx, fy, zone, pageX: px, pageY: py, hostLeft: host.left };
    }

    function clearScreenTapLongPress() {
      if (screenTapTrack?.longTimer) clearTimeout(screenTapTrack.longTimer);
      if (screenTapTrack) screenTapTrack.longTimer = null;
    }

    function armScreenTapLongPress(doc_) {
      clearScreenTapLongPress();
      if (!screenTapTrack) return;
      screenTapTrack.longTimer = setTimeout(() => {
        if (!screenTapTrack || screenTapTrack.longFired) return;
        try {
          const sel = doc_?.getSelection?.();
          if (sel && !sel.isCollapsed && String(sel).trim()) {
            clearScreenTapLongPress();
            screenTapTrack = null;
            return;
          }
        } catch { /* */ }
        screenTapTrack.longFired = true;
        const coords = tapCoordsInHost(screenTapTrack.x, screenTapTrack.y, doc_);
        const zone = coords?.zone || 'mm';
        const action = S.tapZonesLong?.[zone] || 'none';
        screenTapTrack = null;
        runTapAction(action);
      }, TAP_LONG_MS);
    }

    lightAdjustCancelers.add(() => {
      clearScreenTapLongPress();
      screenTapTrack = null;
      edgeMenuTrack = null;
      linkTapTouch = null;
    });

    function slopOk(t) {
      return Math.hypot(t.clientX - linkTapTouch.x, t.clientY - linkTapTouch.y) <= LINK_TAP_SLOP;
    }

    /* Любое касание по тексту = пользовательский жест; листание Foliate не всегда доходит до touchend с зонами. */
    doc.addEventListener(
      'touchstart',
      () => {
        void acquireReaderWakeLock();
      },
      { capture: true, passive: true }
    );

    function finishLinkTapFromTouch(e, a) {
      linkTapTouch = null;
      pinchStartDist = 0;
      pinchPendingSize = 0;
      e.stopImmediatePropagation();
      e.preventDefault();
      queueMicrotask(() => {
        if (a.isConnected) a.click();
      });
    }

    doc.addEventListener('touchstart', e => {
      if (!isFlowPaginated() || e.touches.length !== 1) {
        linkTapTouch = null;
        return;
      }
      const a = e.target.closest?.('a[href]');
      if (!a) {
        linkTapTouch = null;
        return;
      }
      const t = e.touches[0];
      linkTapTouch = { el: a, x: t.clientX, y: t.clientY };
    }, { capture: true, passive: true });

    doc.addEventListener('touchstart', e => {
      /* Новый тач — снимаем блок листания от прошлой регулировки. */
      if (!isLightAdjustActive()) suppressBookGesture = false;
      edgeMenuTrack = null;
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const pageX = touchPageX(t.clientX, doc);
        const host = view?.getBoundingClientRect?.();
        const fromLeft = host?.width
          ? (pageX - host.left) <= EDGE_MENU_PX
          : pageX <= EDGE_MENU_PX;
        if (fromLeft && !brightnessGestureBlocked()) {
          edgeMenuTrack = { x: t.clientX, y: t.clientY, armed: false };
        }
      }
      if (e.touches.length === 1 && !e.target.closest?.('a[href]')) {
        const t = e.touches[0];
        screenTapTrack = { x: t.clientX, y: t.clientY, t: Date.now(), longFired: false, longTimer: null };
        armScreenTapLongPress(doc);
      } else {
        clearScreenTapLongPress();
        screenTapTrack = null;
      }
    }, { capture: true, passive: true });

    doc.addEventListener('touchmove', e => {
      if (isLightAdjustActive() || suppressBookGesture) {
        clearScreenTapLongPress();
        screenTapTrack = null;
        edgeMenuTrack = null;
        // Не даём Foliate обрабатывать move, пока палец у края (кандидат на подсветку)
        if (brightnessDrag || warmthDrag || isLightAdjustActive()) {
          eatLightGestureEvent(e, { hard: true });
        }
        return;
      }
      if (edgeMenuTrack && e.touches.length === 1 && !edgeMenuTrack.armed) {
        const t = e.touches[0];
        const dx = t.clientX - edgeMenuTrack.x;
        const dy = t.clientY - edgeMenuTrack.y;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (dx >= EDGE_MENU_MIN_DX && adx > ady * 1.25) {
          edgeMenuTrack.armed = true;
          clearScreenTapLongPress();
          screenTapTrack = null;
          brightnessDrag = null;
          warmthDrag = null;
          e.preventDefault();
          openPanel('toc', { toggle: false });
          void acquireReaderWakeLock();
          return;
        }
        if (ady > 16 && ady >= adx) {
          edgeMenuTrack = null;
        }
      }
      if (!screenTapTrack || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - screenTapTrack.x, t.clientY - screenTapTrack.y) > TAP_CANCEL_MOVE_PX) {
        clearScreenTapLongPress();
        screenTapTrack = null;
      }
    }, { capture: true, passive: false });

    /* Короткий тап: только preventDefault — foliate-paginator #onTouchEnd всё равно вызывается и
     * должен отработать (сброс #touchScrolled); при defaultPrevented foliate не делает snap().
     * Нельзя stopImmediatePropagation — иначе #onTouchEnd не выполняется и состояние ломается. */
    doc.addEventListener('touchend', e => {
      if (linkTapTouch) return;
      if (suppressBookGesture || isLightAdjustActive()) {
        suppressBookGesture = false;
        clearScreenTapLongPress();
        screenTapTrack = null;
        edgeMenuTrack = null;
        eatLightGestureEvent(e, { hard: true });
        return;
      }
      if (edgeMenuTrack?.armed) {
        edgeMenuTrack = null;
        clearScreenTapLongPress();
        screenTapTrack = null;
        return;
      }
      edgeMenuTrack = null;
      if (isFootnoteOverlayOpen()) return;
      if (!screenTapTrack || e.changedTouches.length !== 1) return;
      if (screenTapTrack.longFired) {
        clearScreenTapLongPress();
        screenTapTrack = null;
        e.preventDefault();
        return;
      }
      const t = e.changedTouches[0];
      if (panelBlocksBookTap(touchToPageY(t.clientY, doc))) {
        clearScreenTapLongPress();
        screenTapTrack = null;
        return;
      }
      const dt = Date.now() - screenTapTrack.t;
      const adx = Math.abs(t.clientX - screenTapTrack.x);
      const ady = Math.abs(t.clientY - screenTapTrack.y);
      if (dt > TAP_MAX_MS || adx > TAP_SLOP_PX || ady > TAP_SLOP_PX) {
        clearScreenTapLongPress();
        screenTapTrack = null;
        return;
      }
      clearScreenTapLongPress();
      const coords = tapCoordsInHost(t.clientX, t.clientY, doc);
      const zone = coords?.zone || 'mm';
      const action = S.tapZonesShort?.[zone] || 'toggleChrome';
      screenTapTrack = null;
      e.preventDefault();
      runTapAction(action);
    }, { capture: true, passive: false });

    doc.addEventListener('touchcancel', () => {
      clearScreenTapLongPress();
      screenTapTrack = null;
      edgeMenuTrack = null;
    }, { capture: true, passive: true });

    doc.addEventListener('touchmove', e => {
      if (!linkTapTouch) return;
      if (e.touches.length !== 1) {
        linkTapTouch = null;
        return;
      }
      const t = e.touches[0];
      if (!slopOk(t)) {
        linkTapTouch = null;
        return;
      }
      e.stopImmediatePropagation();
    }, { capture: true, passive: false });

    doc.addEventListener('touchend', e => {
      if (!linkTapTouch) return;
      if (e.changedTouches.length !== 1) {
        linkTapTouch = null;
        return;
      }
      const t = e.changedTouches[0];
      if (!slopOk(t)) {
        linkTapTouch = null;
        return;
      }
      finishLinkTapFromTouch(e, linkTapTouch.el);
    }, { capture: true, passive: false });

    doc.addEventListener('touchcancel', e => {
      if (!linkTapTouch || e.changedTouches.length !== 1) {
        linkTapTouch = null;
        return;
      }
      const t = e.changedTouches[0];
      if (!slopOk(t)) {
        linkTapTouch = null;
        return;
      }
      finishLinkTapFromTouch(e, linkTapTouch.el);
    }, { capture: true, passive: false });

    let pStart = null;
    let pointerDownOnLink = false;

    doc.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      pointerDownOnLink = !!e.target.closest?.('a[href]');
      pStart = { x: e.clientX, y: e.clientY, t: Date.now() };
    });

    doc.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        pinchStartDist = touchDistPinch(e.touches);
        pinchStartSize = S.fontSize;
        pinchPendingSize = S.fontSize;
      }
    }, { passive: true });
    doc.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || !pinchStartDist) return;
      e.preventDefault();
      const ratio = touchDistPinch(e.touches) / pinchStartDist;
      const dampened = 1 + (ratio - 1) * 0.35;
      applyPinchFontSize(pinchStartSize * dampened);
    }, { passive: false });
    doc.addEventListener('touchend', () => { commitPinchFont(); }, { passive: true });
    doc.addEventListener('touchcancel', () => { commitPinchFont(); }, { passive: true });

    doc.addEventListener('pointerup', e => {
      /* Тач: зоны только в capture-touchend (ниже). Иначе pointerup и touchend оба листают —
       * порядок событий между ними не гарантирован (PE + Touch Events). */
      if (e.pointerType === 'touch') {
        pStart = null;
        pointerDownOnLink = false;
        return;
      }
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') {
        pStart = null;
        pointerDownOnLink = false;
        return;
      }
      if (!pStart || e.button !== 0) {
        pointerDownOnLink = false;
        return;
      }
      const fromLink = pointerDownOnLink;
      pointerDownOnLink = false;
      const startX = pStart.x, startY = pStart.y, startT = pStart.t;
      const dx = e.clientX - startX, dy = e.clientY - startY, dt = Date.now() - startT;
      pStart = null;

      const adx = Math.abs(dx), ady = Math.abs(dy);
      /* Мышь: горизонтальный свайп с любого места (как у многих десктоп-ридеров). Перо: только с края — иначе мешает выделению. */
      if (adx > 30 && adx > ady * 2 && dt < 800) {
        if (document.documentElement.classList.contains('is-restoring-position')) {
          pStart = null;
          return;
        }
        if (e.pointerType === 'mouse') {
          if (dx < 0) view?.goRight(); else view?.goLeft();
          void acquireReaderWakeLock();
          return;
        }
        if (e.pointerType === 'pen') {
          const zStart = tapCoordsInHost(startX, startY, doc)?.zone || '';
          if (zStart.endsWith('l') || zStart.endsWith('r')) {
            if (dx < 0) view?.goRight(); else view?.goLeft();
            void acquireReaderWakeLock();
            return;
          }
        }
      }

      if (dt > TAP_MAX_MS || adx > TAP_SLOP_PX || ady > TAP_SLOP_PX) return;
      /* Не отсекаем по getSelection(): после relocate foliate может оставить несвёрнутый range —
       * короткий тап с малым сдвигом уже отфильтрован выше. */
      if (fromLink) return;

      const zone = tapCoordsInHost(e.clientX, e.clientY, doc)?.zone || 'mm';
      runTapAction(S.tapZonesShort?.[zone] || 'toggleChrome');
    });

    const WHEEL_FLIP_PX = 28;
    doc.addEventListener('wheel', e => {
      if (S.layout === 'scrolled') return;
      if (e.ctrlKey || e.metaKey) return;
      if (document.documentElement.classList.contains('is-restoring-position')) return;
      const dy = e.deltaY;
      const dx = e.deltaX;
      const mag = Math.hypot(dx, dy);
      if (e.deltaMode === 0 && mag < WHEEL_FLIP_PX) return;
      e.preventDefault();
      const dominant = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      if (dominant > 0) view?.goRight();
      else if (dominant < 0) view?.goLeft();
      void acquireReaderWakeLock();
    }, { passive: false });

  }

  /* ===== Book metadata (foliate sidebar parity) ===== */
  function formatLanguageMap(x) {
    if (!x) return '';
    if (typeof x === 'string') return x;
    const keys = Object.keys(x);
    return keys.length ? x[keys[0]] : '';
  }
  function formatOneContributor(contributor) {
    return typeof contributor === 'string' ? contributor : formatLanguageMap(contributor?.name);
  }
  function formatContributor(contributor) {
    if (Array.isArray(contributor)) {
      return contributor.map(formatOneContributor).filter(Boolean).join(', ');
    }
    return formatOneContributor(contributor);
  }
  function mapCalibreColor(which) {
    const w = String(which || '').toLowerCase();
    if (w.includes('green')) return 'green';
    if (w.includes('blue')) return 'blue';
    if (w.includes('pink') || w.includes('red')) return 'pink';
    if (w.includes('underline')) return 'underline';
    return 'yellow';
  }
  async function setBookChromeMetadata() {
    const book = view?.book;
    const configTitle = String(window.__READER_BOOK_TITLE || '').trim();
    const title = formatLanguageMap(book?.metadata?.title) || configTitle || '';
    const author = formatContributor(book?.metadata?.author) || '';
    if (title) document.title = title;
    const tbTitle = document.querySelector('.tb-title');
    if (tbTitle) tbTitle.textContent = title;
    const tbKicker = document.querySelector('.tb-kicker');
    if (tbKicker) tbKicker.textContent = author || 'Чтение';
    const header = $('toc-book-header');
    const coverEl = $('toc-cover');
    const tocTitle = $('toc-book-title');
    const tocAuthor = $('toc-book-author');
    if (title || author) {
      if (header) header.hidden = false;
      if (tocTitle) tocTitle.textContent = title;
      if (tocAuthor) tocAuthor.textContent = author;
    } else if (header) {
      header.hidden = true;
    }
    if (coverEl && book?.getCover) {
      try {
        const blob = await book.getCover();
        if (blob) coverEl.src = URL.createObjectURL(blob);
      } catch { /* */ }
    }
  }
  async function importCalibreHighlights() {
    const book = view?.book;
    if (!book?.getCalibreBookmarks) return;
    let bookmarks;
    try {
      bookmarks = await book.getCalibreBookmarks();
    } catch {
      return;
    }
    if (!bookmarks?.length) return;
    const { fromCalibreHighlight } = await import('/foliate/epubcfi.js');
    const byIndex = new Map();
    for (const obj of bookmarks) {
      if (obj.type !== 'highlight') continue;
      try {
        const value = fromCalibreHighlight(obj);
        const color = mapCalibreColor(obj.style?.which);
        const note = obj.notes || '';
        const annotation = { value, color, note };
        calibreAnnotationsByValue.set(value, annotation);
        const list = byIndex.get(obj.spine_index) || [];
        list.push(annotation);
        byIndex.set(obj.spine_index, list);
      } catch (e) {
        console.warn('[Calibre highlight]', e);
      }
    }
    if (!byIndex.size) return;
    view.addEventListener('create-overlay', ({ detail }) => {
      const list = byIndex.get(detail.index);
      if (!list) return;
      for (const annotation of list) {
        try { view.addAnnotation(annotation); } catch { /* */ }
      }
    });
  }

  /* ===== Build TOC ===== */
  function buildToc(toc, depth) {
    if (!toc) return;
    for (const item of toc) {
      tocData.push({ href: item.href, label: (item.label || '').trim(), depth });
      if (item.subitems?.length) buildToc(item.subitems, depth + 1);
    }
  }

  /* ===== Error ===== */
  function hideReaderLoading() {
    document.getElementById('reader-loading')?.remove();
  }

  function ensureRestoreVeil() {
    let veil = document.getElementById('reader-restore-veil');
    if (veil) return veil;
    veil = document.createElement('div');
    veil.id = 'reader-restore-veil';
    veil.className = 'reader-restore-veil';
    veil.setAttribute('aria-busy', 'true');
    veil.setAttribute('aria-label', 'Загрузка книги');
    veil.innerHTML = '<div class="reader-spinner"></div><div class="reader-loading-text">Загрузка книги…</div>';
    document.body.appendChild(veil);
    return veil;
  }

  function setRestoreVeil(on) {
    const veil = ensureRestoreVeil();
    veil.hidden = !on;
    veil.setAttribute('aria-busy', on ? 'true' : 'false');
    document.documentElement.classList.toggle('is-restoring-position', Boolean(on));
  }

  async function revealReaderAfterRestore() {
    try {
      await ensurePaginatorContentPage();
      await waitForLayoutSettled(800);
    } catch { /* still drop the veil */ }
  }

  async function waitForPaginatorReady(timeoutMs = 2500) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const size = Number(view?.renderer?.size);
      if (Number.isFinite(size) && size > 16) return true;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return false;
  }

  /** Foliate column layout uses empty sentinel pages 0 and last. Opening there is a blank screen. */
  async function ensurePaginatorContentPage() {
    const renderer = view?.renderer;
    if (!renderer || renderer.scrolled) return;
    const size = Number(renderer.size);
    if (!Number.isFinite(size) || size < 8) return;
    const page = Number(renderer.page);
    const pages = Number(renderer.pages);
    if (!Number.isFinite(page) || !Number.isFinite(pages) || pages < 3) return;
    if (page <= 0 && typeof renderer.next === 'function') {
      await renderer.next();
    } else if (page >= pages - 1 && typeof renderer.prev === 'function') {
      await renderer.prev();
    }
  }

  function showError(msg) {
    hideReaderLoading();
    setRestoreVeil(false);
    try {
      window.__DEBUG_LOG__?.('H3', 'reader:showError', 'displayed', { msg: String(msg || '') });
    } catch { /* */ }
    bookPagesEl?.classList.add('is-hidden');
    readerBody.innerHTML = '<div class="reader-error"><div class="reader-error-title">' + esc(rt('readerJs.errorTitle')) + '</div>' +
      '<div class="reader-error-text">' + esc(msg) + '</div>' +
      '<a href="' + readerBookPagePath() + '" class="tb-btn" style="margin-top:12px;">' + esc(rt('readerJs.back')) + '</a></div>';
  }

  /* ===== Reader ext classifier (kept in sync with server utils/book-format.js) ===== */
  function classifyExt(ext) {
    // Strip trailing `.zip` so composite exts like `pdf.zip` / `djvu.zip`
    // (Flibusta wrapper packs) classify as their underlying format.
    const raw = String(ext || '').toLowerCase().replace(/^\./, '');
    const e = raw.replace(/\.zip$/, '');
    if (e === 'pdf') return 'pdf';
    if (e === 'djvu' || e === 'djv') return 'djvu';
    if (e === 'fb2' || e === 'fbz' || e === 'epub' || e === 'mobi' || e === 'azw3' || e === 'kf8' || e === 'cbz') return 'foliate';
    return 'unsupported';
  }

  /**
   * PDF/DJVU are not supported by foliate-js. For PDF we fall back to the
   * browser's native PDF viewer (same-origin iframe, which Chrome/Edge/Firefox
   * render via their built-in viewer). For DJVU — no browser has a native
   * renderer, so we show a clear "download to read" banner instead of the
   * cryptic "Failed to load container file" message from foliate-js.
   */
  function showUnsupportedBanner(kind) {
    hideReaderLoading();
    setRestoreVeil(false);
    bookPagesEl?.classList.add('is-hidden');
    const downloadHref = globalThis.downloadBookPath ? globalThis.downloadBookPath(bookId) : `/download/${encodeURIComponent(bookId)}`;
    const title = kind === 'djvu' ? rt('readerJs.djvuUnsupportedTitle') : rt('readerJs.unsupportedTitle');
    const text = kind === 'djvu' ? rt('readerJs.djvuUnsupportedText') : rt('readerJs.unsupportedText');
    readerBody.innerHTML =
      '<div class="reader-error">' +
      '<div class="reader-error-title">' + esc(title) + '</div>' +
      '<div class="reader-error-text">' + esc(text) + '</div>' +
      '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">' +
      '<a href="' + downloadHref + '" class="tb-btn" download>' + esc(rt('readerJs.download')) + '</a>' +
      '<a href="' + readerBookPagePath() + '" class="tb-btn">' + esc(rt('readerJs.back')) + '</a>' +
      '</div></div>';
  }

  function isZipMagic(h) {
    return h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04;
  }

  function isSevenZipMagic(h) {
    return h[0] === 0x37 && h[1] === 0x7a && h[2] === 0xbc && h[3] === 0xaf;
  }

  async function inspectZipBookKind(buffer) {
    try {
      const { configure, ZipReader, BlobReader, TextWriter } = await import('/foliate/vendor/zip.js');
      configure({ useWebWorkers: false });
      const reader = new ZipReader(new BlobReader(new Blob([buffer])));
      const entries = await reader.getEntries();
      const mimeEntry = entries.find((entry) => {
        const p = String(entry.filename || '').replace(/\\/g, '/').toLowerCase();
        return p === 'mimetype' || p.endsWith('/mimetype');
      });
      if (mimeEntry) {
        const mime = String(await mimeEntry.getData(new TextWriter())).trim();
        if (mime === 'application/epub+zip') {
          await reader.close();
          return 'epub';
        }
      }
      if (entries.some((entry) => /meta-inf\/container\.xml$/i.test(String(entry.filename || '').replace(/\\/g, '/')))) {
        await reader.close();
        return 'epub';
      }
      const fb2Entry = entries.find((entry) => /\.fb2$/i.test(String(entry.filename || '')));
      if (fb2Entry) {
        await reader.close();
        return 'fb2';
      }
      await reader.close();
    } catch {
      /* fall through */
    }
    return null;
  }

  /** Определяет реальный формат по содержимому — важно, если ext в URL/профиле неверный. */
  async function sniffBookExt(buffer, fallbackExt) {
    const fb = String(fallbackExt || 'fb2').toLowerCase().replace(/^\./, '').replace(/\.zip$/, '');
    if (!buffer || buffer.byteLength < 4) return fb || 'fb2';
    const h = new Uint8Array(buffer);
    if (h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) return 'pdf';
    if (isSevenZipMagic(h)) {
      if (fb.includes('epub')) {
        throw new Error(
          'EPUB сохранён в формате 7z. Удалите книгу с устройства и скачайте заново с сервера.',
        );
      }
      return fb || 'fb2';
    }
    if (isZipMagic(h)) {
      const zipKind = await inspectZipBookKind(buffer);
      if (zipKind) return zipKind;
      if (fb.includes('epub')) return 'epub';
      if (fb === 'fb2' || fb === 'fbz') return 'fb2';
      if (fb.includes('mobi') || fb.includes('azw')) return fb;
      return 'epub';
    }
    const sample = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, Math.min(buffer.byteLength, 512)));
    if (sample.includes('FictionBook') || /<\?xml/i.test(sample)) return 'fb2';
    return fb || 'fb2';
  }

  /* ===== Main ===== */
  async function loadBook() {
    try { window.__DEBUG_LOG__?.('H4', 'reader:loadBook', 'start', { bookId, bookExt }); } catch { /* */ }
    readerSessionStartedAt = Date.now();
    lastChapterKey = '';
    chapterSessionStartedAt = 0;
    chapterStartFraction = 0;
    stopReaderTts();
    invalidateBookPageCache();
    bookPagesEl?.classList.add('is-hidden');
    closeReaderFootnote();
    footnoteHandler = null;
    setRestoreVeil(true);

    // Branch on book type: foliate-js doesn't handle PDF/DJVU. For PDF we let
    // the browser's native PDF viewer render the file; for DJVU we surface a
    // clear download prompt (no browser has a native DJVU renderer).
    const kind = classifyExt(bookExt);
    const contentSuffix = 'content';
    const url = globalThis.apiBookPath
      ? globalThis.apiBookPath(bookId, contentSuffix)
      : `/api/books/${encodeURIComponent(bookId)}/${contentSuffix}`;

    if (kind === 'pdf') {
      const pdfUrl = globalThis.apiBookPath
        ? globalThis.apiBookPath(bookId, 'content')
        : `/api/books/${encodeURIComponent(bookId)}/content`;
      hideReaderLoading();
      setRestoreVeil(false);
      readerBody.innerHTML = '<iframe class="reader-pdf-frame" src="' + pdfUrl + '" title="PDF"></iframe>';
      return;
    }
    if (kind === 'djvu') {
      showUnsupportedBanner('djvu');
      return;
    }
    if (kind === 'unsupported') {
      showUnsupportedBanner('generic');
      return;
    }

    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(rtp('readerJs.loadError', { status: res.status }));
    const buffer = await res.arrayBuffer();
    try {
      window.__DEBUG_LOG__?.('H4', 'reader:loadBook', 'fetched', {
        byteLength: buffer.byteLength,
        url: String(url).slice(0, 80),
      });
    } catch { /* */ }
    const effectiveExt = await sniffBookExt(buffer, bookExt);
    effectiveBookExt = effectiveExt;
    const file = new File([buffer], 'book.' + effectiveExt.toLowerCase());

    const urlPos = new URLSearchParams(location.search).get('pos');
    const urlFracRaw = new URLSearchParams(location.search).get('frac');
    const urlFb2 = new URLSearchParams(location.search).get('fb2');
    const urlFrac = urlFracRaw != null ? normalizeFraction(Number(urlFracRaw)) : 0;
    const savedHint = await loadSavedPosition();
    const needsRestore = Boolean(
      urlPos
      || savedHint
      || urlFrac > 0.01
      || (urlFb2 && isFb2Href(urlFb2)),
    );
    // Пока книга открывается/восстанавливается — глушим page-haptic (несколько relocate подряд).
    let bootRestoreInProgress = true;
    let openedView = false;
    try {
      if (needsRestore) positionSaveSuppression.begin();

      view = document.createElement('foliate-view');
      readerBody.replaceChildren(view);
      await view.open(file);
      openedView = true;
      await waitForPaginatorReady();
      try { window.__DEBUG_LOG__?.('H4', 'reader:loadBook', 'view.open ok', { effectiveExt }); } catch { /* */ }

      fb2FlatToc = isFb2Active() ? flattenTocForSeek(view.book?.toc) : [];
      // Дорогой разбор секций (createDocument по каждому TOC-фрагменту) — лениво,
      // только если реально покажется cross-device диалог, а не на каждом открытии.
      let flatTocForPromptCache = null;
      window.__READER_GET_FB2_FLAT_TOC__ = () => {
        if (!flatTocForPromptCache) flatTocForPromptCache = buildFlatTocForPrompt();
        return flatTocForPromptCache;
      };

      applyRendererLayout();
      await syncReaderGoogleFont();
      applyBookStyles();
      applyInvertFilter();
      await setBookChromeMetadata();
      await importCalibreHighlights();

      view.addEventListener('load', ({ detail: { doc, index } }) => {
        if (!ttsAdvancingSection) stopReaderTts();
        if (doc && index != null) docIndexMap.set(doc, index);
        if (!bootRestoreInProgress) void applySectionStyles(doc);
        wireDoc(doc);
        wireSelection(doc);
      });

      wireViewAnnotations();
      wireFootnotes();

      view.addEventListener('relocate', ({ detail }) => {
        const loc = view.lastLocation || detail;
        const payload = readerPositionFromLocation(loc);
        if (!seekBarUserActive) {
          setProgressFromFraction(payload.fraction, loc.tocItem ?? detail.tocItem);
        }
        updateBookPageDisplay(loc);
        if (document.documentElement.dataset.inpxApp === '1') {
          const tocItem = loc.tocItem ?? detail.tocItem;
          let chapterTitle = '';
          try {
            chapterTitle = tocItem?.label ? formatChapterLabel(tocItem.label) : '';
          } catch { /* ignore */ }
          const chapterKey = tocItem?.href || chapterTitle || '';
          if (chapterKey && chapterKey !== lastChapterKey) {
            lastChapterKey = chapterKey;
            chapterSessionStartedAt = Date.now();
            chapterStartFraction = payload.fraction;
          }
          try {
            window.parent.postMessage({
              type: 'inpx-reader-progress',
              fraction: payload.fraction,
              progress: payload.progress,
              chapterTitle,
              remainingBookMinutes: estimateRemainingBookMinutes(payload.fraction),
              remainingChapterMinutes: estimateRemainingChapterMinutes(payload.fraction),
            }, '*');
          } catch { /* ignore */ }
        }
        const why = detail.reason || loc.reason;
        const newIdx = Number(loc?.section?.current);
        const oldIdx = Number(layoutAnchorSticky?.sectionIndex);
        if (Number.isInteger(oldIdx) && Number.isInteger(newIdx) && oldIdx !== newIdx) {
          layoutAnchorSticky = snapshotLayoutAnchor(loc);
        }
        if (why === 'page' || why === 'snap' || why === 'scroll') {
          noteUserLayoutAnchor(loc);
        }
        if (!seekBarUserActive && (payload.position || payload.fraction > 0)) savePosition(payload, why);
        if (why === 'snap' || why === 'page' || why === 'navigation') {
          if (S.pageHaptic === true && !bootRestoreInProgress) {
            const now = Date.now();
            if (now - lastPageHapticAt > 280) {
              lastPageHapticAt = now;
              postReaderHaptic('light');
            }
          }
          if (!bootRestoreInProgress) maybeEinkFullRefresh(why);
          try { view.deselect?.(); } catch { /* */ }
          hideSelMenu();
          activeSel = null;
        }
      });

      if (view.book?.toc) {
        rawToc = view.book.toc;
        tocData = [];
        tocView = null;
        buildToc(rawToc, 1);
      } else {
        rawToc = null;
        tocData = [];
        tocView = null;
      }
      renderTocTab(); updateTocBtnState();
      setupMediaOverlayUi();

      if (!needsRestore) {
        await view.renderer.next();
        await ensurePaginatorContentPage();
        await flushPendingSectionStyles();
      } else {
        const saved = await loadSavedPosition();
        try {
          const settleFromSaved = await restoreReadingPosition(saved, urlPos);
          // При открытии закладки/заметки (?pos=) нельзя дотягивать paginator/nudge
          // к последней позиции чтения — иначе прыжок обратно «куда читали».
          if (settleFromSaved && saved && view?.lastLocation) {
            // Same-layout reopen can still sit one page early after textAnchor;
            // snap/nudge again once fonts are fully ready.
            const bootDoc = getLoadedSectionDoc();
            if (bootDoc) await waitForFontsReady(bootDoc, 3000);
            if (!(await tryRestorePaginatorPage(saved))) {
              await nudgeIfLandedOnePageEarly(saved);
            }
            if (view?.lastLocation) {
              const landed = readerPositionFromLocation(view.lastLocation);
              const pageOk = Number(saved.paginatorPage) === Number(landed.paginatorPage)
                && Number(saved.paginatorPages) === Number(landed.paginatorPages);
              if (pageOk || isTextAnchorLandingVerified(saved, view.lastLocation)) {
                commitReadingPosition(landed, 'restore-settle');
              } else {
                // Keep saved page/offset as the commit so close-flush cannot walk backward.
                committedPosition = {
                  ...landed,
                  sectionIndex: saved.sectionIndex ?? landed.sectionIndex,
                  textOffset: saved.textOffset ?? landed.textOffset,
                  textQuote: saved.textQuote ?? landed.textQuote,
                  textSectionLength: saved.textSectionLength ?? landed.textSectionLength,
                  paginatorPage: saved.paginatorPage ?? landed.paginatorPage,
                  paginatorPages: saved.paginatorPages ?? landed.paginatorPages,
                  sectionPageFraction: saved.sectionPageFraction ?? landed.sectionPageFraction,
                  fraction: savedFraction(saved) || landed.fraction,
                  progress: fractionToProgress(savedFraction(saved) || landed.fraction),
                  fb2Href: saved.fb2Href || landed.fb2Href,
                };
                posLog('restore-commit-saved', {
                  landedPage: landed.paginatorPage,
                  savedPage: saved.paginatorPage,
                });
              }
            }
          }
        } catch (e) {
          posLog('restore-error', { msg: e instanceof Error ? e.message : String(e) });
          console.warn('[reader] position restore', e);
        }
      }
    } finally {
      await revealReaderAfterRestore();
      if (typeof window.__READER_WAIT_OPEN_SYNC__ === 'function') {
        await window.__READER_WAIT_OPEN_SYNC__(2500);
      }
      try {
        if (typeof window.__SHOW_DEFERRED_CROSS_DEVICE_PROMPT__ === 'function') {
          await window.__SHOW_DEFERRED_CROSS_DEVICE_PROMPT__();
        }
      } catch { /* keep veil teardown */ }
      bootRestoreInProgress = false;
      clearTimeout(resizeTimer);
      resizeTimer = null;
      const replayViewport = pendingViewportPreserve;
      viewportPreserveFrozen = false;
      releaseRendererLayout();
      endLayoutSuppress();
      setRestoreVeil(false);
      hideReaderLoading();
      pendingViewportPreserve = false;
      if (replayViewport) onViewportResize();
      if (needsRestore) positionSaveSuppression.end();
      if (openedView) {
        clearTimeout(chromeTimer);
        setChromeVisible(false);
        void acquireReaderWakeLock();
        posLog('veil-off', {
          needsRestore,
          fraction: normalizeFraction(view?.lastLocation?.fraction ?? 0),
          page: Number(view?.renderer?.page),
          pages: Number(view?.renderer?.pages),
        });
        if (view?.lastLocation) {
          const opened = snapshotLayoutAnchor(view.lastLocation);
          if (isUsableLayoutAnchor(opened)) layoutAnchorSticky = opened;
        }
      }
    }
  }

  /* Две колонки: при ресайзе окна пересчитать ширину колонки (без лишнего saveSettings). */
  let resizeTimer = null;
  let viewportPreserveFrozen = false;
  let pendingViewportPreserve = false;

  function anchorFromCommittedPosition() {
    if (!committedPosition) return null;
    return {
      sectionIndex: Number(committedPosition.sectionIndex),
      textOffset: Number(committedPosition.textOffset),
      textQuote: String(committedPosition.textQuote || ''),
      cfi: String(committedPosition.position || '').trim(),
      fraction: Number(committedPosition.fraction) || 0,
      fb2Href: committedPosition.fb2Href || null,
      range: null,
    };
  }

  function freezeViewportLayoutAnchor() {
    if (viewportPreserveFrozen && isUsableLayoutAnchor(layoutAnchorSticky)) {
      pinRendererTextAnchor(layoutAnchorSticky, true);
      holdRendererLayout();
      beginLayoutSuppress();
      return;
    }
    const size = Number(view?.renderer?.size);
    const collapsed = !Number.isFinite(size) || size < 32;
    const committed = anchorFromCommittedPosition();
    let snap = collapsed ? layoutAnchorSticky : captureStickyLayoutAnchor();
    if (committed && isUsableLayoutAnchor(committed) && (!snap || isLayoutAnchorJump(committed, snap))) {
      snap = committed;
    }
    if (!isUsableLayoutAnchor(snap)) snap = layoutAnchorSticky;
    if (isUsableLayoutAnchor(snap)) layoutAnchorSticky = snap;
    pinRendererTextAnchor(layoutAnchorSticky, true);
    holdRendererLayout();
    beginLayoutSuppress();
    viewportPreserveFrozen = true;
  }

  let lastViewportBox = { w: 0, h: 0 };

  function onViewportResize() {
    if (document.documentElement.classList.contains('is-restoring-position')) {
      pendingViewportPreserve = true;
      return;
    }
    if (!view?.renderer) return;
    if (window.visualViewport && Number(window.visualViewport.scale) > 1.01) return;
    const box = view.renderer.getBoundingClientRect();
    if (
      lastViewportBox.w > 0
      && Math.abs(box.width - lastViewportBox.w) < 24
      && Math.abs(box.height - lastViewportBox.h) < 24
    ) {
      return;
    }
    lastViewportBox = { w: box.width, h: box.height };
    clearTimeout(resizeTimer);
    freezeViewportLayoutAnchor();
    resizeTimer = setTimeout(async () => {
      viewportPreserveFrozen = false;
      pendingViewportPreserve = false;
      if (!view?.renderer || document.documentElement.classList.contains('is-restoring-position')) {
        pendingViewportPreserve = true;
        releaseRendererLayout();
        endLayoutSuppress();
        return;
      }
      applyRendererLayout();
      if (view.lastLocation) updateBookPageDisplay(view.lastLocation);
      const snap = layoutAnchorSticky
        || anchorFromCommittedPosition()
        || (view.lastLocation ? snapshotLayoutAnchor(view.lastLocation) : null);
      if (snap) await preserveLocationAfterLayoutChange(snap, { applyStyles: false });
      else {
        releaseRendererLayout();
        endLayoutSuppress();
      }
    }, 320);
  }
  window.addEventListener('resize', onViewportResize);
  window.addEventListener('orientationchange', onViewportResize);

  /** Explicit close path only — do not call on every pagehide (TTS keepalive uses pagehide). */
  function teardownReaderSession() {
    readerSessionAlive = false;
    clearTimeout(resizeTimer);
    resizeTimer = null;
    clearTimeout(layoutPreserveTimer);
    layoutPreserveTimer = null;
    clearTimeout(applySettingsTimer);
    applySettingsTimer = null;
    layoutRestoreToken += 1;
    if (statusClockTimer != null) {
      clearInterval(statusClockTimer);
      statusClockTimer = null;
    }
    if (autoFlipTimer != null) {
      clearInterval(autoFlipTimer);
      autoFlipTimer = null;
    }
    autoFlipArmed = false;
    window.removeEventListener('resize', onViewportResize);
    window.removeEventListener('orientationchange', onViewportResize);
    try {
      window.__READER_BOOTSTRAP_TEARDOWN__?.();
    } catch {
      /* ignore */
    }
    try {
      window.__READER_RELEASE_CONTENT_BLOB__?.();
    } catch {
      /* ignore */
    }
    try {
      stopReaderTts();
    } catch {
      /* ignore */
    }
    releaseReaderWakeLock();
    try {
      pauseTtsKeepalive();
      ttsKeepaliveEl?.remove();
    } catch {
      /* ignore */
    }
    ttsKeepaliveEl = null;
    if (ttsKeepaliveUrl) {
      try { URL.revokeObjectURL(ttsKeepaliveUrl); } catch { /* */ }
      ttsKeepaliveUrl = null;
    }
    if (ttsCoverArtworkUrl && String(ttsCoverArtworkUrl).startsWith('blob:')) {
      try { URL.revokeObjectURL(ttsCoverArtworkUrl); } catch { /* */ }
    }
    ttsCoverArtworkUrl = '';
    ttsCoverBase64Cache = '';
    try {
      const coverEl = $('toc-cover');
      const src = coverEl?.getAttribute('src') || '';
      if (src.startsWith('blob:')) {
        try { URL.revokeObjectURL(src); } catch { /* */ }
        if (coverEl) coverEl.removeAttribute('src');
      }
    } catch {
      /* ignore */
    }
    try {
      if (typeof view?.close === 'function') view.close();
    } catch {
      /* ignore */
    }
    view = null;
  }
  window.__READER_TEARDOWN__ = teardownReaderSession;
  window.addEventListener('pagehide', () => {
    // Orientation/background fires pagehide. Do not abort layout restore —
    // that is what puts the user back after font/margin/rotation reflow.
    if (layoutPreserveTimer || resizeTimer || layoutSuppressHeld) return;
    endLayoutSuppress();
    releaseRendererLayout();
  });

  /* ===== Boot ===== */
  applySettings();
  initBrightnessGesture();
  window.__READER_RESTORE_SAVED__ = async (saved, opts = {}) => {
    if (!saved || !view) return false;
    if (!opts?.force && !document.documentElement.classList.contains('is-restoring-position')) return false;
    positionSaveSuppression.begin();
    try {
      await restoreReadingPosition(saved, null);
      if (
        saved.sectionIndex != null
        && saved.textOffset != null
        && Number.isInteger(Number(saved.sectionIndex))
        && Number(saved.sectionIndex) >= 0
        && Number.isInteger(Number(saved.textOffset))
        && Number(saved.textOffset) >= 0
      ) {
        await waitForLayoutSettled(1200);
        const ok = isTextAnchorLandingVerified(saved, view?.lastLocation);
        posLog('deferred-text-anchor-verify', {
          targetSectionIndex: Number(saved.sectionIndex),
          targetTextOffset: Number(saved.textOffset),
          landedSectionIndex: Number(view?.lastLocation?.section?.current),
          landedTextOffset: Number(view?.lastLocation?.textOffset),
          ok,
        });
        return ok;
      }
      const target = savedFraction(saved);
      if (target <= 0) return true;
      await waitForLayoutSettled(1200);
      const landed = readingFractionFromLocation(view?.lastLocation);
      const ok = Math.abs(landed - target) <= 0.03;
      posLog('deferred-restore-verify', {
        targetFraction: target,
        landedFraction: landed,
        ok,
      });
      return ok;
    } finally {
      positionSaveSuppression.end();
    }
  };
  (async () => {
    try {
      setRestoreVeil(true);
      try { window.__DEBUG_LOG__?.('H3', 'reader:boot', 'start', { bookId, bookExt }); } catch { /* */ }
      if (window.__READER_LOCAL_INIT__) {
        await window.__READER_LOCAL_INIT__;
        try { window.__DEBUG_LOG__?.('H2', 'reader:boot', 'LOCAL_INIT ok', {}); } catch { /* */ }
      }
      if (window.__READER_BOOT_ERROR) {
        throw new Error(String(window.__READER_BOOT_ERROR));
      }
      await ensureReaderI18n();
      await loadBookmarks(); renderBmTab();
      await loadAnnotations();
      await loadBook();
      try { window.__DEBUG_LOG__?.('H4', 'reader:boot', 'loadBook done', {}); } catch { /* */ }
      applyAllAnnotations();
    } catch (e) {
      try {
        window.__DEBUG_LOG__?.('H3', 'reader:boot', 'catch', {
          msg: e instanceof Error ? e.message : String(e),
        });
      } catch { /* */ }
      console.error(e);
      showError(e.message || rt('readerJs.loadBookFail'));
    }
  })();
})();
