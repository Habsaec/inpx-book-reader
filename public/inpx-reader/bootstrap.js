import {
  buildCrossDevicePromptDetailsFromStore,
  buildMergeInputFromOfflineStore,
  fractionToProgress,
  normalizeReadingFraction,
  savedFraction,
  needsDeferredCrossDevicePromptFromStore,
} from './position-sync.js';
import {
  acceptPendingPositionRevision,
  completePendingPositionRestore,
  declinePendingPositionRevision,
} from './reader-shared/pending-position-revision.js';

function debugLog(hypothesisId, location, message, data) {
    const payload = {
      sessionId: '756f1e',
      hypothesisId,
      location,
      message,
      data: data || {},
      timestamp: Date.now(),
    };
    // #region agent log
    try {
      window.parent.postMessage({ type: 'inpx-debug-log', ...payload }, '*');
    } catch { /* */ }
    try {
      const k = 'debug_session_756f1e';
      const arr = JSON.parse(localStorage.getItem(k) || '[]');
      arr.push(payload);
      if (arr.length > 80) arr.splice(0, arr.length - 80);
      localStorage.setItem(k, JSON.stringify(arr));
    } catch { /* */ }
    try {
      console.log('DEBUG_756f1e', JSON.stringify(payload));
    } catch { /* */ }
    // #endregion
  }
  window.__DEBUG_LOG__ = debugLog;

  window.addEventListener('error', function (e) {
    debugLog('H3', 'bootstrap:window.onerror', 'uncaught', {
      msg: String(e.message || ''),
      file: String(e.filename || ''),
      line: Number(e.lineno) || 0,
    });
  });
  window.addEventListener('unhandledrejection', function (e) {
    const reason = e.reason;
    debugLog('H3', 'bootstrap:unhandledrejection', 'promise rejected', {
      msg: reason instanceof Error ? reason.message : String(reason),
    });
  });

  const params = new URLSearchParams(location.search);
  let config = null;
  try {
    const raw = localStorage.getItem('INPX_READER_CONFIG');
    if (raw) config = JSON.parse(raw);
  } catch {
    config = null;
  }

  const localFileName = config?.localFileName || '';

  function extFromPath(path) {
    const m = String(path || '').match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : '';
  }

  const bookId = params.get('bookId') || config?.bookId || '';
  const bookExt = params.get('ext') || config?.bookExt || extFromPath(localFileName) || 'fb2';
  const bookTitle = config?.bookTitle || '';
  const storageUri = config?.storageUri || '';

  window.__READER_BOOK_ID = bookId;
  window.__READER_BOOK_EXT = bookExt;
  window.__READER_BOOK_TITLE = bookTitle;
  window.__READER_APP = 1;
  document.documentElement.dataset.inpxApp = '1';

  // Только флаг приложения / URL — не dataset (его раньше ставила цветовая тема «E-Ink»).
  const appEink =
    params.get('eink') === '1'
    || config?.einkActive === true;
  window.__READER_APP_EINK = appEink ? 1 : 0;
  if (appEink) {
    document.documentElement.dataset.eink = '1';
    document.documentElement.dataset.readerTheme = 'eink';
  } else {
    delete document.documentElement.dataset.eink;
  }

  /** 0.0001% on 0–100 scale → fraction precision 1e-6 */
  function normalizeStoredFraction(fraction) {
    return normalizeReadingFraction(fraction);
  }

  function fractionToStoredProgress(fraction) {
    return fractionToProgress(fraction);
  }

  function applyPositionPayload(store, payload) {
    const prevFrac = normalizeStoredFraction(store.fraction ?? (Number(store.progress) || 0) / 100);
    const fraction = Number.isFinite(Number(payload?.fraction))
      ? normalizeStoredFraction(payload.fraction)
      : normalizeStoredFraction((Number(payload?.progress) || 0) / 100);
    const saveReason = payload?.positionSaveReason != null ? String(payload.positionSaveReason) : '';
    if (fraction < 0.02 && prevFrac > 0.05) {
      return;
    }
    store.fraction = fraction;
    store.progress = fractionToStoredProgress(fraction);
    const pos = payload?.position != null ? String(payload.position).trim() : '';
    store.position = pos || null;
    const href = payload?.fb2Href != null ? String(payload.fb2Href).trim() : '';
    if (href) {
      store.fb2Href = href;
    } else if (fraction < prevFrac - 0.02) {
      store.fb2Href = null;
    }
    if (Number.isFinite(Number(payload?.sectionIndex))) store.sectionIndex = Number(payload.sectionIndex);
    store.textOffset = payload?.textOffset != null
      && Number.isInteger(Number(payload.textOffset)) && Number(payload.textOffset) >= 0
      ? Number(payload.textOffset)
      : null;
    store.textQuote = typeof payload?.textQuote === 'string' ? payload.textQuote.slice(0, 256) : null;
    store.textSectionLength =
      payload?.textSectionLength != null
        && Number.isInteger(Number(payload.textSectionLength)) && Number(payload.textSectionLength) >= 0
        ? Number(payload.textSectionLength)
        : null;
    if (Number.isFinite(Number(payload?.sectionPageFraction))) {
      store.sectionPageFraction = Number(payload.sectionPageFraction);
    }
    if (Number.isFinite(Number(payload?.paginatorPage))) store.paginatorPage = Number(payload.paginatorPage);
    if (Number.isFinite(Number(payload?.paginatorPages))) store.paginatorPages = Number(payload.paginatorPages);
    if (typeof payload?.layoutMode === 'string' && payload.layoutMode) store.layoutMode = payload.layoutMode;
    store.positionVersion = 4;
    store.positionDirty = true;
    store.dismissedServerRevision = null;
    store.pendingCrossDevicePrompt = false;
    if (saveReason) store.positionSaveReason = saveReason;
    else delete store.positionSaveReason;
    touchPositionChanged(store);
    writeReaderData(store);
  }

  window.__READER_WRITE_POSITION__ = function readerWritePosition(payload) {
    applyPositionPayload(readReaderData(), payload || {});
  };

  function applySafeArea(insets) {
    if (!insets) return;
    const root = document.documentElement;
    const top = Number(insets.top) || 0;
    const bottom = Number(insets.bottom) || 0;
    const left = Number(insets.left) || 0;
    const right = Number(insets.right) || 0;
    root.style.setProperty('--r-safe-top', top + 'px');
    root.style.setProperty('--r-safe-bottom', bottom + 'px');
    root.style.setProperty('--r-safe-left', left + 'px');
    root.style.setProperty('--r-safe-right', right + 'px');
  }

  try {
    const rawInsets = localStorage.getItem('INPX_SAFE_AREA');
    if (rawInsets) applySafeArea(JSON.parse(rawInsets));
  } catch {
    /* ignore */
  }

  function readerDataKey() {
    return `inpx_offline_reader_${bookId}`;
  }

  function readReaderData() {
    try {
      const raw = localStorage.getItem(readerDataKey());
      return raw
        ? JSON.parse(raw)
        : { positionVersion: 4, position: null, progress: 0, fraction: 0, bookmarks: [], annotations: [] };
    } catch {
      return { positionVersion: 4, position: null, progress: 0, fraction: 0, bookmarks: [], annotations: [] };
    }
  }

  function writeReaderData(data, opts) {
    const current = { ...data, positionVersion: 4, updatedAt: new Date().toISOString() };
    localStorage.setItem(readerDataKey(), JSON.stringify(current));
    if (!opts?.skipParentNotify) notifyParentReaderSync(current);
  }

  function notifyParentReaderSync(store) {
    if (window.__READER_APP !== 1) return;
    try {
      window.parent.postMessage({
        type: 'inpx-reader-sync-store',
        bookId,
        data: {
          position: store.position ?? null,
          progress: Number(store.progress) || 0,
          fraction: Number.isFinite(Number(store.fraction)) ? Number(store.fraction) : null,
          fb2Href: store.fb2Href ?? null,
          sectionIndex: Number.isFinite(Number(store.sectionIndex)) ? Number(store.sectionIndex) : null,
          textOffset: store.textOffset != null
            && Number.isInteger(Number(store.textOffset)) && Number(store.textOffset) >= 0
            ? Number(store.textOffset)
            : null,
          textQuote: typeof store.textQuote === 'string' ? store.textQuote : null,
          textSectionLength:
            store.textSectionLength != null
              && Number.isInteger(Number(store.textSectionLength)) && Number(store.textSectionLength) >= 0
              ? Number(store.textSectionLength)
              : null,
          sectionPageFraction: Number.isFinite(Number(store.sectionPageFraction))
            ? Number(store.sectionPageFraction)
            : null,
          paginatorPage: Number.isFinite(Number(store.paginatorPage)) ? Number(store.paginatorPage) : null,
          paginatorPages: Number.isFinite(Number(store.paginatorPages)) ? Number(store.paginatorPages) : null,
          layoutMode: store.layoutMode ?? null,
          positionChangedAt: store.positionChangedAt ?? null,
          positionSaveReason: store.positionSaveReason ?? null,
          bookmarks: Array.isArray(store.bookmarks) ? store.bookmarks : [],
          annotations: Array.isArray(store.annotations) ? store.annotations : [],
          bookmarksChangedAt: store.bookmarksChangedAt ?? null,
          annotationsChangedAt: store.annotationsChangedAt ?? null,
          deletedBookmarkPositions: Array.isArray(store.deletedBookmarkPositions)
            ? store.deletedBookmarkPositions
            : [],
          deletedAnnotationCfis: Array.isArray(store.deletedAnnotationCfis) ? store.deletedAnnotationCfis : [],
          updatedAt: store.updatedAt ?? null,
          pendingCrossDevicePrompt: Boolean(store.pendingCrossDevicePrompt),
          serverPosition: store.serverPosition ?? null,
          serverPositionUpdatedAt: store.serverPositionUpdatedAt ?? null,
          serverPositionProgress: Number.isFinite(Number(store.serverPositionProgress))
            ? Number(store.serverPositionProgress)
            : -1,
          serverPositionFraction: Number.isFinite(Number(store.serverPositionFraction))
            ? Number(store.serverPositionFraction)
            : -1,
          serverFb2Href: store.serverFb2Href ?? null,
          serverSectionIndex: Number.isFinite(Number(store.serverSectionIndex))
            ? Number(store.serverSectionIndex)
            : null,
          serverTextOffset:
            store.serverTextOffset != null
              && Number.isInteger(Number(store.serverTextOffset)) && Number(store.serverTextOffset) >= 0
              ? Number(store.serverTextOffset)
              : null,
          serverTextQuote: typeof store.serverTextQuote === 'string' ? store.serverTextQuote : null,
          serverTextSectionLength:
            store.serverTextSectionLength != null
              && Number.isInteger(Number(store.serverTextSectionLength)) && Number(store.serverTextSectionLength) >= 0
              ? Number(store.serverTextSectionLength)
              : null,
          serverSectionPageFraction: Number.isFinite(Number(store.serverSectionPageFraction))
            ? Number(store.serverSectionPageFraction)
            : null,
          serverPaginatorPage: Number.isFinite(Number(store.serverPaginatorPage))
            ? Number(store.serverPaginatorPage)
            : null,
          serverPaginatorPages: Number.isFinite(Number(store.serverPaginatorPages))
            ? Number(store.serverPaginatorPages)
            : null,
          serverLayoutMode: store.serverLayoutMode ?? null,
          dismissedServerPositionUpdatedAt: store.dismissedServerPositionUpdatedAt ?? null,
          crossDeviceResolvedAt: store.crossDeviceResolvedAt ?? null,
          positionVersion: Number(store.positionVersion) || 1,
          serverRevision: Number.isInteger(Number(store.serverRevision)) ? Number(store.serverRevision) : 0,
          baseRevision: Number.isInteger(Number(store.baseRevision)) ? Number(store.baseRevision) : 0,
          positionDirty: Boolean(store.positionDirty),
          dismissedServerRevision: Number.isInteger(Number(store.dismissedServerRevision))
            ? Number(store.dismissedServerRevision)
            : null,
        },
      }, '*');
    } catch {
      /* ignore */
    }
  }

  function mergeReaderStores(local, incoming) {
    if (!incoming || typeof incoming !== 'object') return local;
    const localFrac = normalizeStoredFraction(local.fraction ?? (Number(local.progress) || 0) / 100);
    const incomingFrac = normalizeStoredFraction(incoming.fraction ?? (Number(incoming.progress) || 0) / 100);
    const spuriousReset = incomingFrac < 0.02 && localFrac > 0.05;
    const localTs = Date.parse(local.positionChangedAt || local.updatedAt || '') || 0;
    const incomingTs = Date.parse(incoming.positionChangedAt || incoming.updatedAt || '') || 0;
    const pickPositionFrom = spuriousReset
      ? local
      : (incomingTs >= localTs ? incoming : local);
    return {
      ...local,
      ...incoming,
      position: pickPositionFrom.position ?? local.position,
      progress: pickPositionFrom.progress ?? local.progress,
      fraction: pickPositionFrom.fraction ?? local.fraction,
      fb2Href: pickPositionFrom.fb2Href ?? local.fb2Href,
      sectionIndex: pickPositionFrom.sectionIndex ?? local.sectionIndex,
      textOffset: Object.prototype.hasOwnProperty.call(pickPositionFrom, 'textOffset')
        ? pickPositionFrom.textOffset
        : local.textOffset,
      textQuote: Object.prototype.hasOwnProperty.call(pickPositionFrom, 'textQuote')
        ? pickPositionFrom.textQuote
        : local.textQuote,
      textSectionLength: Object.prototype.hasOwnProperty.call(pickPositionFrom, 'textSectionLength')
        ? pickPositionFrom.textSectionLength
        : local.textSectionLength,
      sectionPageFraction: pickPositionFrom.sectionPageFraction ?? local.sectionPageFraction,
      paginatorPage: pickPositionFrom.paginatorPage ?? local.paginatorPage,
      paginatorPages: pickPositionFrom.paginatorPages ?? local.paginatorPages,
      layoutMode: pickPositionFrom.layoutMode ?? local.layoutMode,
      positionChangedAt: pickPositionFrom.positionChangedAt ?? local.positionChangedAt,
      pendingCrossDevicePrompt: incoming.pendingCrossDevicePrompt ?? local.pendingCrossDevicePrompt,
      serverPosition: incoming.serverPosition ?? local.serverPosition,
      serverPositionUpdatedAt: incoming.serverPositionUpdatedAt ?? local.serverPositionUpdatedAt,
      serverPositionProgress: incoming.serverPositionProgress ?? local.serverPositionProgress,
      serverPositionFraction: incoming.serverPositionFraction ?? local.serverPositionFraction,
      serverFb2Href: incoming.serverFb2Href ?? local.serverFb2Href,
      serverSectionIndex: incoming.serverSectionIndex ?? local.serverSectionIndex,
      serverTextOffset: Object.prototype.hasOwnProperty.call(incoming, 'serverTextOffset')
        ? incoming.serverTextOffset
        : local.serverTextOffset,
      serverTextQuote: Object.prototype.hasOwnProperty.call(incoming, 'serverTextQuote')
        ? incoming.serverTextQuote
        : local.serverTextQuote,
      serverTextSectionLength: Object.prototype.hasOwnProperty.call(incoming, 'serverTextSectionLength')
        ? incoming.serverTextSectionLength
        : local.serverTextSectionLength,
      serverSectionPageFraction: incoming.serverSectionPageFraction ?? local.serverSectionPageFraction,
      serverPaginatorPage: incoming.serverPaginatorPage ?? local.serverPaginatorPage,
      serverPaginatorPages: incoming.serverPaginatorPages ?? local.serverPaginatorPages,
      serverLayoutMode: incoming.serverLayoutMode ?? local.serverLayoutMode,
      dismissedServerPositionUpdatedAt:
        incoming.dismissedServerPositionUpdatedAt ?? local.dismissedServerPositionUpdatedAt,
      crossDeviceResolvedAt: incoming.crossDeviceResolvedAt ?? local.crossDeviceResolvedAt,
      positionVersion: incoming.positionVersion ?? local.positionVersion,
      serverRevision: incoming.serverRevision ?? local.serverRevision,
      baseRevision: incoming.baseRevision ?? local.baseRevision,
      positionDirty: incoming.positionDirty ?? local.positionDirty,
      dismissedServerRevision:
        incoming.dismissedServerRevision !== undefined
          ? incoming.dismissedServerRevision
          : local.dismissedServerRevision,
      bookmarks: Array.isArray(incoming.bookmarks) && incoming.bookmarks.length
        ? incoming.bookmarks
        : (local.bookmarks || []),
      annotations: Array.isArray(incoming.annotations) && incoming.annotations.length
        ? incoming.annotations
        : (local.annotations || []),
      deletedBookmarkPositions: Array.isArray(incoming.deletedBookmarkPositions)
        ? incoming.deletedBookmarkPositions
        : (local.deletedBookmarkPositions || []),
      deletedAnnotationCfis: Array.isArray(incoming.deletedAnnotationCfis)
        ? incoming.deletedAnnotationCfis
        : (local.deletedAnnotationCfis || []),
    };
  }

  function normalizeBookmark(item) {
    if (item.created_at && !item.createdAt) item.createdAt = item.created_at;
    return item;
  }

  function normalizeAnnotation(item) {
    if (item.created_at && !item.createdAt) item.createdAt = item.created_at;
    return item;
  }

  function ensureTombstones(store) {
    if (!Array.isArray(store.deletedBookmarkPositions)) store.deletedBookmarkPositions = [];
    if (!Array.isArray(store.deletedAnnotationCfis)) store.deletedAnnotationCfis = [];
  }

  function tombstoneBookmarkPosition(store, position) {
    if (!position) return;
    ensureTombstones(store);
    if (!store.deletedBookmarkPositions.includes(position)) {
      store.deletedBookmarkPositions.push(position);
    }
  }

  function tombstoneAnnotationCfi(store, cfi) {
    if (!cfi) return;
    ensureTombstones(store);
    if (!store.deletedAnnotationCfis.includes(cfi)) {
      store.deletedAnnotationCfis.push(cfi);
    }
  }

  function clearBookmarkTombstone(store, position) {
    if (!position || !Array.isArray(store.deletedBookmarkPositions)) return;
    store.deletedBookmarkPositions = store.deletedBookmarkPositions.filter((p) => p !== position);
  }

  function clearAnnotationTombstone(store, cfi) {
    if (!cfi || !Array.isArray(store.deletedAnnotationCfis)) return;
    store.deletedAnnotationCfis = store.deletedAnnotationCfis.filter((c) => c !== cfi);
  }

  function touchBookmarksChanged(store) {
    store.bookmarksChangedAt = new Date().toISOString();
  }

  function touchAnnotationsChanged(store) {
    store.annotationsChangedAt = new Date().toISOString();
  }

  function touchPositionChanged(store) {
    store.positionChangedAt = new Date().toISOString();
  }

  const CROSS_DEVICE_MSG =
    'Ранее вы уже читали эту книгу на другом устройстве. Перейти на сохранённую позицию?';
  const CROSS_DEVICE_ACCEPT = 'Перейти';
  const CROSS_DEVICE_DECLINE = 'Остаться здесь';

  let positionPromptResolved = false;
  let positionPromptGate = null;

  function applyPendingServerSnapshot(store) {
    const serverFrac = savedFraction({
      progress: store.serverPositionProgress,
      fraction: store.serverPositionFraction,
    });
    store.fraction = serverFrac;
    store.progress = fractionToStoredProgress(serverFrac);
    store.position = store.serverPosition || null;
    store.fb2Href = store.serverFb2Href || null;
    if (Number.isFinite(Number(store.serverSectionIndex))) {
      store.sectionIndex = Number(store.serverSectionIndex);
    } else {
      delete store.sectionIndex;
    }
    store.textOffset =
      store.serverTextOffset != null
        && Number.isInteger(Number(store.serverTextOffset)) && Number(store.serverTextOffset) >= 0
        ? Number(store.serverTextOffset)
        : null;
    store.textQuote = typeof store.serverTextQuote === 'string' ? store.serverTextQuote : null;
    store.textSectionLength =
      store.serverTextSectionLength != null
        && Number.isInteger(Number(store.serverTextSectionLength)) && Number(store.serverTextSectionLength) >= 0
        ? Number(store.serverTextSectionLength)
        : null;
    if (Number.isFinite(Number(store.serverSectionPageFraction))) {
      store.sectionPageFraction = Number(store.serverSectionPageFraction);
    } else {
      delete store.sectionPageFraction;
    }
    if (Number.isFinite(Number(store.serverPaginatorPage))) {
      store.paginatorPage = Number(store.serverPaginatorPage);
    } else {
      delete store.paginatorPage;
    }
    if (Number.isFinite(Number(store.serverPaginatorPages))) {
      store.paginatorPages = Number(store.serverPaginatorPages);
    } else {
      delete store.paginatorPages;
    }
    if (store.serverLayoutMode) store.layoutMode = store.serverLayoutMode;
    else delete store.layoutMode;
    store.positionChangedAt = store.serverPositionUpdatedAt || new Date().toISOString();
    store.positionVersion = 4;
    acceptPendingPositionRevision(store);
    store.dismissedServerPositionUpdatedAt = null;
    store.crossDeviceResolvedAt = store.serverPositionUpdatedAt || new Date().toISOString();
    writeReaderData(store);
  }

  function dismissPendingServerSnapshot(store) {
    store.dismissedServerPositionUpdatedAt = store.serverPositionUpdatedAt || null;
    store.crossDeviceResolvedAt = store.serverPositionUpdatedAt || new Date().toISOString();
    store.positionVersion = 4;
    declinePendingPositionRevision(store);
    writeReaderData(store);
  }

  function buildCrossDeviceLines(store) {
    const flatToc = Array.isArray(window.__READER_FB2_FLAT_TOC__) ? window.__READER_FB2_FLAT_TOC__ : [];
    const livePosition = window.__READER_GET_CURRENT_POSITION__?.();
    const displayStore = livePosition ? { ...store, ...livePosition } : store;
    const lines = buildCrossDevicePromptDetailsFromStore(displayStore, flatToc);
    const mergeInput = buildMergeInputFromOfflineStore(displayStore);
    return {
      ...lines,
      localFraction: mergeInput.localFraction,
      localProgress: Number(displayStore.progress) || 0,
      serverFraction: mergeInput.serverFraction,
      serverProgress: mergeInput.serverProgress,
      localFb2Href: displayStore.fb2Href || null,
      serverFb2Href: store.serverFb2Href || null,
      localPosition: displayStore.position || null,
      serverPosition: store.serverPosition || null,
      localSectionIndex: displayStore.sectionIndex ?? null,
      serverSectionIndex: store.serverSectionIndex ?? null,
      localTextOffset: displayStore.textOffset ?? null,
      serverTextOffset: store.serverTextOffset ?? null,
      localTextQuote: displayStore.textQuote ?? null,
      serverTextQuote: store.serverTextQuote ?? null,
      localTextSectionLength: displayStore.textSectionLength ?? null,
      serverTextSectionLength: store.serverTextSectionLength ?? null,
      localPaginatorPage: displayStore.paginatorPage ?? null,
      localPaginatorPages: displayStore.paginatorPages ?? null,
      serverPaginatorPage: store.serverPaginatorPage ?? null,
      serverPaginatorPages: store.serverPaginatorPages ?? null,
      flatToc,
    };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showBootstrapCrossDeviceConfirm(lines) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'inpx-cross-device-prompt';
      overlay.innerHTML =
        '<div class="inpx-cross-device-backdrop" tabindex="-1"></div>' +
        '<div class="inpx-cross-device-panel" role="alertdialog" aria-modal="true" aria-labelledby="inpx-cross-device-title" aria-describedby="inpx-cross-device-desc">' +
        `<h2 id="inpx-cross-device-title" class="inpx-cross-device-message">${CROSS_DEVICE_MSG}</h2>` +
        '<div id="inpx-cross-device-desc" class="inpx-cross-device-compare">' +
        `<div class="inpx-cross-device-row"><span class="inpx-cross-device-label">Сейчас</span><span class="inpx-cross-device-value">${escapeHtml(lines.localLine)}</span></div>` +
        `<div class="inpx-cross-device-row inpx-cross-device-row-server"><span class="inpx-cross-device-label">На другом устройстве</span><span class="inpx-cross-device-value">${escapeHtml(lines.serverLine)}</span></div>` +
        '</div>' +
        '<div class="inpx-cross-device-actions">' +
        `<button type="button" data-act="decline">${CROSS_DEVICE_DECLINE}</button>` +
        `<button type="button" data-act="accept">${CROSS_DEVICE_ACCEPT}</button>` +
        '</div></div>';
      const panel = overlay.querySelector('.inpx-cross-device-panel');
      const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const getFocusables = () =>
        Array.from(panel?.querySelectorAll(focusableSelector) ?? []).filter(
          (el) => !el.hasAttribute('disabled'),
        );
      const finish = (accepted) => {
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        resolve(accepted);
      };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
          return;
        }
        if (e.key !== 'Tab' || !panel) return;
        const items = getFocusables();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };
      overlay.addEventListener('click', (e) => {
        const act = e.target?.closest?.('[data-act]')?.getAttribute('data-act');
        if (act === 'accept') finish(true);
        if (act === 'decline') finish(false);
        if (e.target?.classList?.contains('inpx-cross-device-backdrop')) finish(false);
      });
      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(overlay);
      const declineBtn = overlay.querySelector('[data-act="decline"]');
      if (declineBtn instanceof HTMLElement) declineBtn.focus();
    });
  }

  function requestParentCrossDevicePrompt(lines) {
    return new Promise((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      function onMsg(e) {
        if (e.data?.type !== 'inpx-reader-position-prompt-response') return;
        if (e.data.requestId !== requestId) return;
        window.removeEventListener('message', onMsg);
        resolve(typeof e.data.accepted === 'boolean' ? e.data.accepted : null);
      }
      window.addEventListener('message', onMsg);
      window.parent.postMessage({
        type: 'inpx-reader-position-prompt-request',
        requestId,
        bookId,
        message: CROSS_DEVICE_MSG,
        localLine: lines.localLine,
        serverLine: lines.serverLine,
        localFraction: lines.localFraction,
        localProgress: lines.localProgress,
        serverFraction: lines.serverFraction,
        serverProgress: lines.serverProgress,
        localFb2Href: lines.localFb2Href,
        serverFb2Href: lines.serverFb2Href,
        localPosition: lines.localPosition,
        serverPosition: lines.serverPosition,
        localSectionIndex: lines.localSectionIndex,
        serverSectionIndex: lines.serverSectionIndex,
        localTextOffset: lines.localTextOffset,
        serverTextOffset: lines.serverTextOffset,
        localTextQuote: lines.localTextQuote,
        serverTextQuote: lines.serverTextQuote,
        localTextSectionLength: lines.localTextSectionLength,
        serverTextSectionLength: lines.serverTextSectionLength,
        localPaginatorPage: lines.localPaginatorPage,
        localPaginatorPages: lines.localPaginatorPages,
        serverPaginatorPage: lines.serverPaginatorPage,
        serverPaginatorPages: lines.serverPaginatorPages,
        flatToc: lines.flatToc,
      }, '*');
    });
  }

  function serverSnapshotRestorePayload(store) {
    const serverFrac = savedFraction({
      progress: store.serverPositionProgress,
      fraction: store.serverPositionFraction,
    });
    return {
      position: store.serverPosition || '',
      progress: fractionToStoredProgress(serverFrac),
      fraction: serverFrac,
      fb2Href: store.serverFb2Href || null,
      sectionIndex: store.serverSectionIndex ?? null,
      textOffset: store.serverTextOffset ?? null,
      textQuote: store.serverTextQuote ?? null,
      textSectionLength: store.serverTextSectionLength ?? null,
      sectionPageFraction: store.serverSectionPageFraction ?? null,
      paginatorPage: store.serverPaginatorPage ?? null,
      paginatorPages: store.serverPaginatorPages ?? null,
      layoutMode: store.serverLayoutMode ?? null,
    };
  }

  function needsDeferredCrossDevicePrompt(store) {
    return needsDeferredCrossDevicePromptFromStore(store);
  }

  async function maybeShowDeferredCrossDevicePrompt() {
    if (positionPromptResolved) return;
    if (positionPromptGate) {
      await positionPromptGate;
      return;
    }
    positionPromptGate = (async () => {
      const store = readReaderData();
      if (!needsDeferredCrossDevicePrompt(store)) {
        positionPromptResolved = true;
        if (store.pendingCrossDevicePrompt) {
          store.pendingCrossDevicePrompt = false;
          writeReaderData(store, { skipParentNotify: true });
        }
        return;
      }
      const lines = buildCrossDeviceLines(store);
      let accepted = null;
      if (window.__READER_APP === 1) {
        accepted = await requestParentCrossDevicePrompt(lines);
      } else {
        accepted = await showBootstrapCrossDeviceConfirm(lines);
      }
      if (accepted === null) return;
      const fresh = readReaderData();
      if (accepted) {
        const payload = serverSnapshotRestorePayload(fresh);
        let restored = false;
        if (typeof window.__READER_RESTORE_SAVED__ === 'function') {
          restored = await window.__READER_RESTORE_SAVED__(payload);
        }
        // Сначала фактически перемещаем Foliate, и только после успешной проверки
        // фиксируем серверный snapshot. Иначе запись в store/parent могла обогнать
        // навигацию и позиция считалась принятой, хотя экран оставался на старом месте.
        if (completePendingPositionRestore(fresh, restored)) {
          fresh.pendingCrossDevicePrompt = false;
          applyPendingServerSnapshot(fresh);
          positionPromptResolved = true;
        }
      } else {
        fresh.pendingCrossDevicePrompt = false;
        dismissPendingServerSnapshot(fresh);
        positionPromptResolved = true;
      }
    })();
    try {
      await positionPromptGate;
    } finally {
      positionPromptGate = null;
    }
  }

  window.__SHOW_DEFERRED_CROSS_DEVICE_PROMPT__ = maybeShowDeferredCrossDevicePrompt;

  function buildPositionGetPayload(store) {
    const fraction = Number.isFinite(Number(store.fraction))
      ? normalizeStoredFraction(store.fraction)
      : normalizeStoredFraction((Number(store.progress) || 0) / 100);
    let position = store.position || '';
    const fb2Href = store.fb2Href || null;
    if ((fb2Href || fraction > 0.01) && position && !/^(?:app:)?ch\d+:p\d+$/.test(String(position))) {
      position = '';
    }
    return {
      position,
      progress: fractionToStoredProgress(fraction),
      fraction,
      fb2Href,
      sectionIndex: Number.isFinite(Number(store.sectionIndex)) ? Number(store.sectionIndex) : null,
      textOffset: store.textOffset != null
        && Number.isInteger(Number(store.textOffset)) && Number(store.textOffset) >= 0
        ? Number(store.textOffset)
        : null,
      textQuote: typeof store.textQuote === 'string' ? store.textQuote : null,
      textSectionLength:
        store.textSectionLength != null
          && Number.isInteger(Number(store.textSectionLength)) && Number(store.textSectionLength) >= 0
          ? Number(store.textSectionLength)
          : null,
      sectionPageFraction: Number.isFinite(Number(store.sectionPageFraction))
        ? Number(store.sectionPageFraction)
        : null,
      paginatorPage: Number.isFinite(Number(store.paginatorPage)) ? Number(store.paginatorPage) : null,
      paginatorPages: Number.isFinite(Number(store.paginatorPages)) ? Number(store.paginatorPages) : null,
      layoutMode: store.layoutMode || 'paginated',
    };
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /** Blob URL книги — создаётся внутри iframe (не в parent WebView). */
  let contentBlobUrl = '';

  function requestBookFileFromParent() {
    return new Promise((resolve, reject) => {
      if (!storageUri || !localFileName) {
        reject(new Error('Файл книги не найден на устройстве'));
        return;
      }
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMsg);
        reject(new Error('Не удалось прочитать файл книги (таймаут)'));
      }, 15000);

      function onMsg(e) {
        if (e.data?.type !== 'inpx-reader-book-file' || e.data?.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        if (e.data.error) {
          debugLog('H2', 'bootstrap:requestBookFile', 'parent error', { error: String(e.data.error) });
          reject(new Error(String(e.data.error)));
          return;
        }
        try {
          let bytes;
          if (e.data.buffer instanceof ArrayBuffer) {
            bytes = new Uint8Array(e.data.buffer);
          } else if (e.data.data) {
            bytes = base64ToBytes(String(e.data.data));
          } else {
            reject(new Error('Пустой ответ при чтении файла'));
            return;
          }
          const blob = new Blob([bytes], { type: 'application/octet-stream' });
          resolve(URL.createObjectURL(blob));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }

      window.addEventListener('message', onMsg);
      window.parent.postMessage({
        type: 'inpx-reader-request-book-file',
        requestId,
        storageUri,
        localFileName,
      }, '*');
    });
  }

  async function ensureLocalContentUrl() {
    debugLog('H2', 'bootstrap:ensureLocalContentUrl', 'start', {
      bookId,
      hasStorageUri: Boolean(storageUri),
      hasLocalFileName: Boolean(localFileName),
    });
    try {
      if (contentBlobUrl) {
        try {
          const probe = await fetch(contentBlobUrl);
          if (probe.ok) {
            debugLog('H2', 'bootstrap:ensureLocalContentUrl', 'reuse blob', { ok: true });
            return contentBlobUrl;
          }
        } catch {
          /* re-request below */
        }
      }
      if (contentBlobUrl && contentBlobUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(contentBlobUrl); } catch { /* */ }
      }
      contentBlobUrl = await requestBookFileFromParent();
      debugLog('H2', 'bootstrap:ensureLocalContentUrl', 'blob ready', {
        byteLength: contentBlobUrl ? 1 : 0,
        isBlob: String(contentBlobUrl).startsWith('blob:'),
      });
      return contentBlobUrl;
    } catch (e) {
      debugLog('H2', 'bootstrap:ensureLocalContentUrl', 'failed', {
        msg: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  function closeReader() {
    try {
      window.__READER_FLUSH_POSITION__?.();
    } catch {
      /* ignore */
    }
    window.parent.postMessage({ type: 'inpx-reader-close' }, '*');
  }

  function setupLocalReaderApi() {
    const LOCAL_BASE = `inpx-local://${encodeURIComponent(bookId)}`;

    globalThis.apiBookPath = function apiBookPath(id, suffix) {
      const clean = String(suffix || '').replace(/^\//, '');
      if (clean.startsWith('content') && contentBlobUrl) {
        return contentBlobUrl;
      }
      return `${LOCAL_BASE}${clean ? '/' + clean : ''}`;
    };

    globalThis.bookPagePath = function bookPagePath() {
      closeReader();
      return '#';
    };

    const nativeFetch = window.fetch.bind(window);
    window.fetch = function localFetch(input, init) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (contentBlobUrl && url === contentBlobUrl) {
        return nativeFetch(contentBlobUrl, init);
      }

      if (url.startsWith(LOCAL_BASE)) {
        const path = url.slice(LOCAL_BASE.length) || '';
        const store = readReaderData();
        const method = (init?.method || 'GET').toUpperCase();

        if (path === '/position') {
          if (method === 'GET') {
            const payload = buildPositionGetPayload(readReaderData());
            return Promise.resolve(new Response(JSON.stringify(payload), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }));
          }
          if (method === 'POST') {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            applyPositionPayload(store, body);
            return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }));
          }
        }

        if (path === '/bookmarks') {
          if (method === 'GET') {
            const list = (store.bookmarks || []).map(normalizeBookmark);
            return Promise.resolve(new Response(JSON.stringify(list), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }));
          }
          if (method === 'POST') {
            return Promise.resolve().then(() => {
              const body = init?.body ? JSON.parse(String(init.body)) : {};
              clearBookmarkTombstone(store, body.position);
              const item = normalizeBookmark({
                id: Date.now(),
                position: body.position,
                title: body.title || '',
                created_at: new Date().toISOString(),
              });
              store.bookmarks = [...(store.bookmarks || []), item];
              touchBookmarksChanged(store);
              writeReaderData(store);
              return new Response(JSON.stringify({ ok: true, ...item }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            });
          }
        }

        if (path.startsWith('/bookmarks/') && method === 'DELETE') {
          const id = Number(path.split('/')[2]);
          const removed = (store.bookmarks || []).find((b) => b.id === id);
          store.bookmarks = (store.bookmarks || []).filter((b) => b.id !== id);
          if (removed?.position) tombstoneBookmarkPosition(store, removed.position);
          touchBookmarksChanged(store);
          writeReaderData(store);
          return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }));
        }

        if (path === '/annotations') {
          if (method === 'GET') {
            const list = (store.annotations || []).map(normalizeAnnotation);
            return Promise.resolve(new Response(JSON.stringify(list), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }));
          }
          if (method === 'POST') {
            return Promise.resolve().then(() => {
              const body = init?.body ? JSON.parse(String(init.body)) : {};
              clearAnnotationTombstone(store, body.cfi);
              const item = normalizeAnnotation({
                id: Date.now(),
                cfi: body.cfi,
                text: body.text || '',
                note: body.note || '',
                color: body.color || 'yellow',
                created_at: new Date().toISOString(),
              });
              store.annotations = [...(store.annotations || []), item];
              touchAnnotationsChanged(store);
              writeReaderData(store);
              return new Response(JSON.stringify(item), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            });
          }
        }

        if (path.startsWith('/annotations/') && method === 'PATCH') {
          const id = Number(path.split('/')[2]);
          return Promise.resolve().then(() => {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            store.annotations = (store.annotations || []).map((a) => {
              if (a.id !== id) return a;
              return normalizeAnnotation({ ...a, ...body });
            });
            touchAnnotationsChanged(store);
            writeReaderData(store);
            const item = (store.annotations || []).find((a) => a.id === id);
            return new Response(JSON.stringify(item || { ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          });
        }

        if (path.startsWith('/annotations/') && method === 'DELETE') {
          const id = Number(path.split('/')[2]);
          const removed = (store.annotations || []).find((a) => a.id === id);
          store.annotations = (store.annotations || []).filter((a) => a.id !== id);
          if (removed?.cfi) tombstoneAnnotationCfi(store, removed.cfi);
          touchAnnotationsChanged(store);
          writeReaderData(store);
          return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }));
        }

        return Promise.resolve(new Response('Not found', { status: 404 }));
      }

      return nativeFetch(input, init);
    };
  }

  // В APK чтение всегда с локального файла (скачанного заранее).
  setupLocalReaderApi();
  window.__READER_LOCAL_INIT__ = ensureLocalContentUrl();

  document.getElementById('btn-app-back')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeReader();
  });

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'inpx-safe-area') {
      applySafeArea(e.data.insets);
      return;
    }
    if (e.data?.type === 'inpx-reader-seed-store' && e.data.bookId === bookId && e.data.data) {
      const merged = mergeReaderStores(readReaderData(), e.data.data);
      writeReaderData(merged, { skipParentNotify: true });
      return;
    }
    if (e.data?.type === 'inpx-reader-back') {
      closeReader();
    }
  });
