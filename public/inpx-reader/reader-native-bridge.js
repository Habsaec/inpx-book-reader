(function () {
  'use strict';

  const pendingNative = new Map();
  let nativeReady = false;

  function postNative(method, data) {
    return new Promise((resolve, reject) => {
      const id = `n_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      pendingNative.set(id, { resolve, reject });
      window.parent.postMessage({ type: 'inpx-native-call', id, method, data }, '*');
      setTimeout(() => {
        if (pendingNative.has(id)) {
          pendingNative.delete(id);
          reject(new Error('Native call timeout'));
        }
      }, 15000);
    });
  }

  const nativeApi = {
    setBrightness(level) {
      return postNative('setBrightness', { level }).then((ret) => {
        try {
          if (ret && (ret.onyx === false || ret.onyxError)) {
            console.warn('[inpx] setBrightness', ret);
          }
        } catch (_) { /* */ }
        return ret;
      });
    },
    getBrightness() {
      return postNative('getBrightness', {}).then((ret) => {
        try {
          if (ret && (ret.onyx === false || ret.onyxError)) {
            console.warn('[inpx] getBrightness', ret);
          }
        } catch (_) { /* */ }
        return ret;
      });
    },
    getFrontLightState() {
      return postNative('getFrontLightState', {});
    },
    adjustFrontLight(opts) {
      return postNative('adjustFrontLight', opts || {});
    },
    setFrontLightRaw(opts) {
      return postNative('setFrontLightRaw', opts || {});
    },
    setWarmth(level) {
      return postNative('setWarmth', { level });
    },
    setLightSwipe(opts) {
      return postNative('setLightSwipe', opts || {});
    },
    refreshEinkScreen() {
      return postNative('refreshEinkScreen', {});
    },
    getWarmth() {
      return postNative('getWarmth', {});
    },
    getVoices() {
      return postNative('getVoices', {});
    },
    speak(opts) {
      return postNative('speak', opts);
    },
    stopTts() {
      return postNative('stopTts', {});
    },
    pauseTts() {
      return postNative('pauseTts', {});
    },
    resumeTts() {
      return postNative('resumeTts', {});
    },
    getTtsState() {
      return postNative('getTtsState', {});
    },
  };

  function installNativeBridge() {
    if (window.__INPX_NATIVE) return;
    window.__INPX_NATIVE = nativeApi;
  }

  if (window.__READER_APP) {
    installNativeBridge();
  } else {
    const waitForApp = setInterval(() => {
      if (!window.__READER_APP) return;
      clearInterval(waitForApp);
      installNativeBridge();
    }, 0);
    setTimeout(() => clearInterval(waitForApp), 5000);
  }

  class NativeUtterance {
    constructor(text) {
      this.text = String(text || '');
      this.lang = '';
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      this._id = `u_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
  }

  let speaking = false;
  let paused = false;
  let currentUtterance = null;
  let voicesCache = [];

  function loadVoices() {
    nativeApi.getVoices().then((res) => {
      const list = Array.isArray(res?.voices) ? res.voices : [];
      voicesCache = list.map((v) => ({
        name: v.name,
        lang: v.lang,
        voiceURI: v.uri || v.name,
        localService: true,
        default: false,
      }));
      window.dispatchEvent(new Event('voiceschanged'));
    }).catch(() => {});
  }

  function finishUtterance(err) {
    const u = currentUtterance;
    speaking = false;
    paused = false;
    currentUtterance = null;
    if (!u) return;
    if (err) {
      if (typeof u.onerror === 'function') u.onerror({ error: err });
    } else if (typeof u.onend === 'function') {
      u.onend();
    }
  }

  const nativeSynth = {
    get speaking() {
      return speaking;
    },
    get pending() {
      return false;
    },
    speak(utterance) {
      if (!utterance || !utterance.text) return;
      currentUtterance = utterance;
      speaking = true;
      paused = false;
      nativeApi.speak({
        text: utterance.text,
        utteranceId: utterance._id,
        rate: utterance.rate || 1,
        voice: utterance.voice?.voiceURI || utterance.voice?.name || '',
      }).catch((err) => finishUtterance(err));
    },
    cancel() {
      speaking = false;
      paused = false;
      currentUtterance = null;
      nativeApi.stopTts().catch(() => {});
    },
    pause() {
      if (!speaking) return;
      paused = true;
      nativeApi.pauseTts().catch(() => {});
    },
    resume() {
      if (!paused) return;
      paused = false;
      nativeApi.resumeTts().catch(() => {});
    },
    getVoices() {
      return voicesCache.slice();
    },
    addEventListener(type, handler) {
      if (type === 'voiceschanged') {
        window.addEventListener('voiceschanged', handler);
      }
    },
  };

  function installNativeTts() {
    if (window.__INPX_NATIVE_TTS_INSTALLED) return;
    window.__INPX_NATIVE_TTS_INSTALLED = true;
    window.__INPX_USE_NATIVE_TTS = true;
    window.speechSynthesis = nativeSynth;
    window.SpeechSynthesisUtterance = NativeUtterance;
    loadVoices();
  }

  window.addEventListener('inpx-native-tts-start', (e) => {
    if (currentUtterance && e.detail?.utteranceId === currentUtterance._id) {
      speaking = true;
      paused = false;
      if (typeof currentUtterance.onstart === 'function') currentUtterance.onstart();
    }
  });

  window.addEventListener('inpx-native-tts-end', (e) => {
    if (currentUtterance && e.detail?.utteranceId === currentUtterance._id) {
      finishUtterance(null);
    }
  });

  window.addEventListener('inpx-native-tts-error', (e) => {
    if (currentUtterance && e.detail?.utteranceId === currentUtterance._id) {
      finishUtterance('native-tts-error');
    }
  });

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'inpx-native-event' && e.data.event === 'ttsEnd') {
      window.dispatchEvent(new CustomEvent('inpx-native-tts-end', { detail: e.data.data }));
    }
    if (e.data?.type === 'inpx-native-event' && e.data.event === 'ttsStart') {
      window.dispatchEvent(new CustomEvent('inpx-native-tts-start', { detail: e.data.data }));
    }
    if (e.data?.type === 'inpx-native-event' && e.data.event === 'ttsError') {
      window.dispatchEvent(new CustomEvent('inpx-native-tts-error', { detail: e.data.data }));
    }
    /* Итог нативного свайпа подсветки: без него слайдеры и localStorage остаются
       со старым значением и следующее касание слайдера отбрасывает свет назад. */
    if (e.data?.type === 'inpx-native-event' && e.data.event === 'frontLight') {
      window.dispatchEvent(new CustomEvent('inpx-native-front-light', { detail: e.data.data }));
    }
  });

  function applyLightStateFromBridge(res, slider, val) {
    const level = Number(res?.brightness ?? res?.level);
    if (!Number.isFinite(level)) return false;
    const steps = Number(res?.brightnessSteps);
    if (slider && Number.isFinite(steps) && steps > 1) {
      slider.step = String(1 / (steps - 1));
    }
    const dragging = slider && (document.activeElement === slider || slider.matches(':active'));
    if (slider && !dragging) slider.value = String(level);
    if (val && !dragging) {
      val.textContent = `${Math.round(level * 100)}%`;
    }
    return true;
  }

  /**
   * На e-ink (Onyx) контролы подсветки в настройках не нужны: живой драг ползунка
   * ломает системный оверлей BOOX, а свайп у краёв уже работает. Оставляем подсказку.
   * На телефоне — обычный слайдер яркости экрана.
   */
  function injectBrightnessControl() {
    if (document.getElementById('rs-frontlight-hint') || document.getElementById('rs-brightness')) return;
    const slot = document.getElementById('rs-brightness-slot');
    const anchor = slot || document.getElementById('rs-tts-rate')?.closest('.rs-group');
    if (!anchor) return;

    const group = document.createElement('div');
    group.className = 'rs-group';
    const eink = window.__READER_APP_EINK === 1 || window.__READER_APP_EINK === true;

    if (eink) {
      group.id = 'rs-frontlight-hint';
      group.innerHTML =
        '<div class="rs-label">Подсветка</div>' +
        '<div class="rs-hint">' +
        'Яркость — свайп вверх/вниз у левого края экрана. Температура — у правого. ' +
        'Кнопки громкости листают страницы.' +
        '</div>';
      if (slot) slot.appendChild(group);
      else anchor.parentNode.insertBefore(group, anchor);
      return;
    }

    group.innerHTML =
      '<div class="rs-label">Яркость экрана</div>' +
      '<div class="rs-slider">' +
      '<input type="range" id="rs-brightness" name="readerBrightness" min="0.05" max="1" step="0.01" aria-label="Яркость">' +
      '<span class="rs-val" id="rs-brightness-val">—</span>' +
      '</div>' +
      '<div class="rs-hint">Или свайп вверх/вниз у левого края экрана</div>';

    if (slot) slot.appendChild(group);
    else anchor.parentNode.insertBefore(group, anchor);

    const slider = document.getElementById('rs-brightness');
    const val = document.getElementById('rs-brightness-val');
    if (!slider) return;

    let settings = {};
    try {
      settings = JSON.parse(localStorage.getItem('reader-settings') || '{}');
    } catch { /* */ }

    const syncFromDevice = () => {
      const api = nativeApi.getFrontLightState || nativeApi.getBrightness;
      api.call(nativeApi).then((res) => {
        applyLightStateFromBridge(res, slider, val);
        if (Number.isFinite(Number(res?.brightness))) {
          try {
            settings.brightness = Number(res.brightness);
            localStorage.setItem('reader-settings', JSON.stringify(settings));
          } catch { /* */ }
        }
      }).catch(() => {});
    };
    syncFromDevice();

    const applyBr = (level, persist) => {
      if (typeof window.__INPX_SET_BRIGHTNESS === 'function') {
        window.__INPX_SET_BRIGHTNESS(level, { persist });
        return;
      }
      settings.brightness = level;
      localStorage.setItem('reader-settings', JSON.stringify(settings));
      nativeApi.setBrightness(level).then((res) => {
        applyLightStateFromBridge(res, slider, val);
      }).catch(() => {
        if (val) val.textContent = `${Math.round(level * 100)}%`;
      });
    };
    slider.addEventListener('input', () => applyBr(Number(slider.value), false));
    slider.addEventListener('change', () => applyBr(Number(slider.value), true));
  }

  function bootNativeUi() {
    // Только UI + чтение с устройства. Не форсируем localStorage → железу при старте.
    injectBrightnessControl();
  }

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'inpx-native-ready') {
      nativeReady = Boolean(e.data.ready);
      if (nativeReady) {
        installNativeTts();
        bootNativeUi();
      }
      return;
    }
        if (e.data?.type === 'inpx-native-response' && e.data.id) {
      const pending = pendingNative.get(e.data.id);
      if (!pending) return;
      pendingNative.delete(e.data.id);
      if (e.data.error) pending.reject(new Error(e.data.error));
      else pending.resolve(e.data.result);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (nativeReady) bootNativeUi();
    });
  } else if (nativeReady) {
    bootNativeUi();
  }

  const settingsObserver = new MutationObserver(() => {
    if (nativeReady) injectBrightnessControl();
  });
  settingsObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
