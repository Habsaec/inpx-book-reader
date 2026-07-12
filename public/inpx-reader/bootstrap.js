(function () {
  'use strict';

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

  /** 0.0001% on 0–100 scale → fraction precision 1e-6 */
  const READING_POSITION_SCALE = 1e6;
  const PROGRESS_PERCENT_SCALE = 1e4;

  function normalizeStoredFraction(fraction) {
    const f = Math.max(0, Math.min(1, Number(fraction) || 0));
    return Math.round(f * READING_POSITION_SCALE) / READING_POSITION_SCALE;
  }

  function fractionToStoredProgress(fraction) {
    return Math.round(normalizeStoredFraction(fraction) * 100 * PROGRESS_PERCENT_SCALE) / PROGRESS_PERCENT_SCALE;
  }

  function applyPositionPayload(store, payload) {
    const prevFrac = normalizeStoredFraction(store.fraction ?? (Number(store.progress) || 0) / 100);
    const fraction = Number.isFinite(Number(payload?.fraction))
      ? normalizeStoredFraction(payload.fraction)
      : normalizeStoredFraction((Number(payload?.progress) || 0) / 100);
    const saveReason = payload?.positionSaveReason != null ? String(payload.positionSaveReason) : '';
    if (saveReason === 'flush' && fraction + 0.02 < prevFrac) {
      return;
    }
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
    delete store.sectionIndex;
    delete store.sectionPageFraction;
    delete store.paginatorPage;
    delete store.paginatorPages;
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
      return raw ? JSON.parse(raw) : { position: null, progress: 0, fraction: 0, bookmarks: [], annotations: [] };
    } catch {
      return { position: null, progress: 0, fraction: 0, bookmarks: [], annotations: [] };
    }
  }

  function writeReaderData(data, opts) {
    localStorage.setItem(readerDataKey(), JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
    if (!opts?.skipParentNotify) notifyParentReaderSync(data);
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
        },
      }, '*');
    } catch {
      /* ignore */
    }
  }

  function storeRestoreScore(store) {
    let score = 0;
    if (store.position?.trim()) score += 3;
    if (store.fb2Href) score += 2;
    if (Number(store.fraction) > 0 || Number(store.progress) > 0) score += 1;
    return score;
  }

  function mergeReaderStores(local, incoming) {
    if (!incoming || typeof incoming !== 'object') return local;
    const localFrac = normalizeStoredFraction(local.fraction ?? (Number(local.progress) || 0) / 100);
    const incomingFrac = normalizeStoredFraction(incoming.fraction ?? (Number(incoming.progress) || 0) / 100);
    const localTs = Date.parse(local.positionChangedAt || local.updatedAt || '') || 0;
    const incomingTs = Date.parse(incoming.positionChangedAt || incoming.updatedAt || '') || 0;
    const pickPositionFrom = incomingFrac > localFrac + 1e-5 ? incoming
      : localFrac > incomingFrac + 1e-5
        ? (localTs > incomingTs ? local : incoming)
        : (incomingTs >= localTs ? incoming : local);
    const merged = {
      ...local,
      ...incoming,
      position: pickPositionFrom.position ?? local.position,
      progress: pickPositionFrom.progress ?? local.progress,
      fraction: pickPositionFrom.fraction ?? local.fraction,
      fb2Href: pickPositionFrom.fb2Href ?? local.fb2Href,
      sectionIndex: pickPositionFrom.sectionIndex ?? local.sectionIndex,
      sectionPageFraction: pickPositionFrom.sectionPageFraction ?? local.sectionPageFraction,
      paginatorPage: pickPositionFrom.paginatorPage ?? local.paginatorPage,
      paginatorPages: pickPositionFrom.paginatorPages ?? local.paginatorPages,
      layoutMode: pickPositionFrom.layoutMode ?? local.layoutMode,
      positionChangedAt: pickPositionFrom.positionChangedAt ?? local.positionChangedAt,
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
    if (incomingFrac > localFrac + 1e-5) return merged;
    const localScore = storeRestoreScore(local);
    const incomingScore = storeRestoreScore(incoming);
    if (incomingScore < localScore) return { ...merged, ...pickPositionFrom };
    if (incomingScore === localScore && incomingTs < localTs) return { ...merged, ...pickPositionFrom };
    return merged;
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
            const fraction = Number.isFinite(Number(store.fraction))
              ? normalizeStoredFraction(store.fraction)
              : normalizeStoredFraction((Number(store.progress) || 0) / 100);
            let position = store.position || '';
            const fb2Href = store.fb2Href || null;
            if ((fb2Href || fraction > 0.01) && position && !/^(?:app:)?ch\d+:p\d+$/.test(String(position))) {
              position = '';
            }
            return Promise.resolve(new Response(JSON.stringify({
              position,
              progress: fractionToStoredProgress(fraction),
              fraction,
              fb2Href,
              sectionIndex: Number.isFinite(Number(store.sectionIndex)) ? Number(store.sectionIndex) : null,
              sectionPageFraction: Number.isFinite(Number(store.sectionPageFraction))
                ? Number(store.sectionPageFraction)
                : null,
              paginatorPage: Number.isFinite(Number(store.paginatorPage)) ? Number(store.paginatorPage) : null,
              paginatorPages: Number.isFinite(Number(store.paginatorPages)) ? Number(store.paginatorPages) : null,
              layoutMode: store.layoutMode || 'paginated',
            }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
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
})();
