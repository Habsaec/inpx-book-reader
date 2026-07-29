package ru.inpx.bookreader;

import android.content.pm.ActivityInfo;
import android.graphics.Insets;
import android.os.Build;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Set;

@CapacitorPlugin(name = "ReaderNative")
public class ReaderNativePlugin extends Plugin {

    private TtsPlaybackManager ttsManager;
    private static ReaderNativePlugin instance;

    private void applySystemTextSelectionMenu(boolean enabled) {
        ReaderCapacitorWebView.setSystemTextSelectionMenuEnabled(enabled);
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            WebSettings settings = webView.getSettings();
            if (enabled) {
                settings.setDisabledActionModeMenuItems(WebSettings.MENU_ITEM_NONE);
            } else {
                settings.setDisabledActionModeMenuItems(
                    WebSettings.MENU_ITEM_SHARE
                        | WebSettings.MENU_ITEM_WEB_SEARCH
                        | WebSettings.MENU_ITEM_PROCESS_TEXT
                );
            }
        }
    }

    @Override
    public void load() {
        super.load();
        instance = this;
        ttsManager = TtsPlaybackManager.getInstance(getContext());
        ttsManager.setUtteranceCallback((type, utteranceId) -> forwardTtsEventToReader(type, utteranceId));
    }

    /** Состояние подсветки после нативного свайпа — в JS читалки. */
    static void emitFrontLightState(JSObject state) {
        ReaderNativePlugin plugin = instance;
        if (plugin == null || state == null) return;
        plugin.forwardFrontLightToReader(state);
    }

    private void forwardFrontLightToReader(JSObject state) {
        notifyListeners("frontLight", state);
        if (getBridge() == null || getBridge().getWebView() == null) return;
        String js =
            "(function(){"
                + "var payload={type:'inpx-native-event',event:'frontLight',data:"
                + state.toString()
                + "};"
                + "window.postMessage(payload,'*');"
                + "var iframe=document.querySelector('iframe[title]');"
                + "if(iframe&&iframe.contentWindow){iframe.contentWindow.postMessage(payload,'*');}"
                + "})();";
        getActivity().runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(js, null));
    }

    /**
     * Включает нативный свайп подсветки у краёв экрана. Читалка выключает его, когда
     * открыта панель или закрыт сам ридер, иначе жест мешал бы прокрутке списков.
     */
    @PluginMethod
    public void setLightSwipe(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", Boolean.FALSE));
        boolean onyx = OnyxFrontLight.isLikelyOnyxDevice() && OnyxFrontLight.isAvailable(getContext());
        FrontLightSwipe.setEnabled(enabled && onyx);
        JSObject ret = new JSObject();
        ret.put("active", enabled && onyx);
        ret.put("supported", onyx);
        ret.put("warmthSupported", onyx && OnyxFrontLight.hasWarmth(getContext()));
        call.resolve(ret);
    }

    private void forwardTtsEventToReader(String type, String utteranceId) {
        JSObject data = new JSObject();
        data.put("utteranceId", utteranceId);

        if ("ttsStart".equals(type)) {
            notifyListeners("ttsStart", data);
        } else if ("ttsEnd".equals(type)) {
            notifyListeners("ttsEnd", data);
        } else if ("ttsError".equals(type)) {
            notifyListeners("ttsError", data);
        }

        if (getBridge() == null || getBridge().getWebView() == null) return;

        String safeId = utteranceId == null ? "" : utteranceId.replace("\\", "\\\\").replace("'", "\\'");
        String js =
            "(function(){"
                + "var payload={type:'inpx-native-event',event:'"
                + type
                + "',data:{utteranceId:'"
                + safeId
                + "'}};"
                + "var iframe=document.querySelector('iframe[title]');"
                + "if(iframe&&iframe.contentWindow){iframe.contentWindow.postMessage(payload,'*');}"
                + "})();";
        getActivity().runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(js, null));
    }

    @PluginMethod
    public void setSystemTextSelectionMenuEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", true);
        boolean showMenu = enabled != null && enabled;
        getActivity().runOnUiThread(() -> {
            applySystemTextSelectionMenu(showMenu);
            call.resolve();
        });
    }

    @PluginMethod
    public void setOrientationLock(PluginCall call) {
        String mode = call.getString("mode", "auto");
        getActivity().runOnUiThread(() -> {
            int orientation;
            if ("portrait".equals(mode)) {
                orientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
            } else if ("landscape".equals(mode)) {
                orientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
            } else {
                orientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
            }
            getActivity().setRequestedOrientation(orientation);
            call.resolve();
        });
    }

    @PluginMethod
    public void getSafeAreaInsets(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            float density = getActivity().getResources().getDisplayMetrics().density;
            int topPx = 0;
            int bottomPx = 0;
            int leftPx = 0;
            int rightPx = 0;

            View decor = getActivity().getWindow().getDecorView();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsets wi = decor.getRootWindowInsets();
                if (wi != null) {
                    Insets bars = wi.getInsets(WindowInsets.Type.systemBars());
                    topPx = bars.top;
                    bottomPx = bars.bottom;
                    leftPx = bars.left;
                    rightPx = bars.right;
                }
            } else {
                WindowInsets wi = decor.getRootWindowInsets();
                if (wi != null) {
                    topPx = wi.getSystemWindowInsetTop();
                    bottomPx = wi.getSystemWindowInsetBottom();
                    leftPx = wi.getSystemWindowInsetLeft();
                    rightPx = wi.getSystemWindowInsetRight();
                }
            }

            if (topPx == 0) {
                int resourceId = getContext().getResources().getIdentifier("status_bar_height", "dimen", "android");
                if (resourceId > 0) {
                    topPx = getContext().getResources().getDimensionPixelSize(resourceId);
                }
            }

            JSObject ret = new JSObject();
            ret.put("top", topPx / density);
            ret.put("bottom", bottomPx / density);
            ret.put("left", leftPx / density);
            ret.put("right", rightPx / density);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("manufacturer", Build.MANUFACTURER != null ? Build.MANUFACTURER : "");
        ret.put("brand", Build.BRAND != null ? Build.BRAND : "");
        ret.put("model", Build.MODEL != null ? Build.MODEL : "");
        boolean onyxDevice = OnyxFrontLight.isLikelyOnyxDevice();
        ret.put("onyxDevice", onyxDevice);
        if (onyxDevice) {
            boolean onyxOk = OnyxFrontLight.isAvailable(getContext());
            ret.put("onyxFrontLight", onyxOk);
            ret.put("onyxStatus", OnyxFrontLight.status());
            String err = OnyxFrontLight.lastError();
            if (err != null && !err.isEmpty()) ret.put("onyxError", err);
            ret.put(
                "writeSettings",
                android.provider.Settings.System.canWrite(getContext())
            );
            ret.put("onyxWarmth", OnyxFrontLight.hasWarmth(getContext()));
            ret.put("onyxEpdRefresh", OnyxEpdRefresh.isSupported());
        }
        call.resolve(ret);
    }

    /** Полная перерисовка EPD (GC16) — против шлейфов на e-ink. */
    @PluginMethod
    public void refreshEinkScreen(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject ret = new JSObject();
            boolean supported = OnyxEpdRefresh.isSupported();
            ret.put("supported", supported);
            if (!supported) {
                ret.put("ok", false);
                ret.put("error", OnyxEpdRefresh.lastError());
                call.resolve(ret);
                return;
            }
            View webView = getBridge() != null ? getBridge().getWebView() : null;
            View decor = getActivity().getWindow() != null
                ? getActivity().getWindow().getDecorView()
                : null;
            boolean ok = OnyxEpdRefresh.fullRefresh(webView);
            if (!ok && decor != null && decor != webView) {
                ok = OnyxEpdRefresh.fullRefresh(decor);
            }
            ret.put("ok", ok);
            if (!ok) ret.put("error", OnyxEpdRefresh.lastError());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void setBrightness(PluginCall call) {
        Float level = call.getFloat("level");
        if (level == null) {
            call.reject("Missing level");
            return;
        }
        // < 0 → вернуть системную яркость окна (выход из читалки); frontlight Onyx не трогаем
        final boolean restore = level < 0f;
        final float clamped = restore
            ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            : Math.max(0f, Math.min(1f, level));

        if (!restore && OnyxFrontLight.isLikelyOnyxDevice() && OnyxFrontLight.isAvailable(getContext())) {
            // Off UI thread: иначе WebView не получает touchmove и свайп «замирает».
            OnyxFrontLight.enqueueSetLevel(getContext(), clamped, (JSObject state) -> {
                state.put("onyx", true);
                putFrontLightLevelAlias(state);
                call.resolve(state);
            });
            return;
        }

        getActivity().runOnUiThread(() -> {
            if (!restore && OnyxFrontLight.isLikelyOnyxDevice()) {
                // Onyx без API — не трогаем Window (системный оверлей).
                JSObject ret = mergeFrontLightState(false, OnyxFrontLight.lastError());
                call.resolve(ret);
                return;
            }
            Window window = getActivity().getWindow();
            WindowManager.LayoutParams params = window.getAttributes();
            params.screenBrightness = clamped < 0.01f && !restore
                ? 0.01f
                : clamped;
            window.setAttributes(params);
            JSObject ret = new JSObject();
            ret.put("onyx", false);
            ret.put("level", restore ? windowBrightnessOrDefault() : clamped);
            ret.put("brightness", restore ? windowBrightnessOrDefault() : clamped);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getBrightness(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean onyx = false;
            String onyxError = "";
            float level = 1f;
            if (OnyxFrontLight.isLikelyOnyxDevice() && OnyxFrontLight.isAvailable(getContext())) {
                float onyxLevel = OnyxFrontLight.getLevel(getContext());
                if (onyxLevel >= 0f) {
                    level = onyxLevel;
                    onyx = true;
                } else {
                    onyxError = OnyxFrontLight.lastError();
                    level = windowBrightnessOrDefault();
                }
            } else {
                if (OnyxFrontLight.isLikelyOnyxDevice()) {
                    onyxError = OnyxFrontLight.lastError();
                }
                level = windowBrightnessOrDefault();
            }
            JSObject ret = OnyxFrontLight.isAvailable(getContext())
                ? OnyxFrontLight.toJson(getContext())
                : new JSObject();
            ret.put("level", level);
            ret.put("onyx", onyx);
            if (!onyxError.isEmpty()) ret.put("onyxError", onyxError);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getFrontLightState(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean onyx = OnyxFrontLight.isLikelyOnyxDevice() && OnyxFrontLight.isAvailable(getContext());
            JSObject ret = onyx ? OnyxFrontLight.toJson(getContext()) : new JSObject();
            ret.put("onyx", onyx);
            if (onyx) putFrontLightLevelAlias(ret);
            else {
                ret.put("level", windowBrightnessOrDefault());
                String err = OnyxFrontLight.lastError();
                if (err != null && !err.isEmpty()) ret.put("onyxError", err);
            }
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void adjustFrontLight(PluginCall call) {
        Integer brightnessDelta = call.getInt("brightnessDelta");
        Integer warmthDelta = call.getInt("warmthDelta");
        final int bd = brightnessDelta != null ? brightnessDelta : 0;
        final int wd = warmthDelta != null ? warmthDelta : 0;
        if (!(OnyxFrontLight.isLikelyOnyxDevice() && OnyxFrontLight.isAvailable(getContext()))) {
            JSObject ret = new JSObject();
            ret.put("onyx", false);
            ret.put("level", windowBrightnessOrDefault());
            call.resolve(ret);
            return;
        }
        OnyxFrontLight.enqueueAdjust(getContext(), bd, wd, (JSObject state) -> {
            state.put("onyx", true);
            putFrontLightLevelAlias(state);
            call.resolve(state);
        });
    }

    @PluginMethod
    public void setFrontLightRaw(PluginCall call) {
        Integer brightnessRaw = call.getInt("brightnessRaw");
        Integer warmthRaw = call.getInt("warmthRaw");
        if (!(OnyxFrontLight.isLikelyOnyxDevice() && OnyxFrontLight.isAvailable(getContext()))) {
            JSObject ret = new JSObject();
            ret.put("onyx", false);
            ret.put("level", windowBrightnessOrDefault());
            call.resolve(ret);
            return;
        }
        OnyxFrontLight.enqueueSetRaw(getContext(), brightnessRaw, warmthRaw, (JSObject state) -> {
            state.put("onyx", true);
            putFrontLightLevelAlias(state);
            call.resolve(state);
        });
    }

    private float windowBrightnessOrDefault() {
        WindowManager.LayoutParams params = getActivity().getWindow().getAttributes();
        float level = params.screenBrightness;
        return level < 0 ? 1f : level;
    }

    private void putFrontLightLevelAlias(JSObject ret) {
        try {
            if (ret.has("brightness")) {
                ret.put("level", ret.getDouble("brightness"));
            }
        } catch (Exception ignored) {
            /* JSObject.getDouble may throw JSONException */
        }
    }

    private void putWarmthLevelAlias(JSObject ret) {
        try {
            if (ret.has("warmth")) {
                ret.put("level", ret.getDouble("warmth"));
            }
        } catch (Exception ignored) {
            /* JSObject.getDouble may throw JSONException */
        }
    }

    private JSObject mergeFrontLightState(boolean onyxApplied, String onyxError) {
        // После записи не syncFromDevice — getLightValue отстаёт и откатывает raw.
        JSObject ret = OnyxFrontLight.isAvailable(getContext())
            ? OnyxFrontLight.toJsonAfterWrite(getContext())
            : new JSObject();
        ret.put("onyx", onyxApplied);
        if (onyxApplied) putFrontLightLevelAlias(ret);
        if (onyxError != null && !onyxError.isEmpty()) ret.put("onyxError", onyxError);
        return ret;
    }

    @PluginMethod
    public void setWarmth(PluginCall call) {
        Float level = call.getFloat("level");
        if (level == null) {
            call.reject("Missing level");
            return;
        }
        final float clamped = Math.max(0f, Math.min(1f, level));
        if (!OnyxFrontLight.hasWarmth(getContext())) {
            JSObject ret = new JSObject();
            ret.put("onyx", false);
            ret.put("supported", false);
            ret.put("onyxError", "warmth unsupported");
            call.resolve(ret);
            return;
        }
        OnyxFrontLight.enqueueSetWarmth(getContext(), clamped, (JSObject state) -> {
            state.put("onyx", true);
            state.put("supported", true);
            putWarmthLevelAlias(state);
            call.resolve(state);
        });
    }

    @PluginMethod
    public void getWarmth(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean supported = OnyxFrontLight.hasWarmth(getContext());
            float level = supported ? OnyxFrontLight.getWarmth(getContext()) : -1f;
            JSObject ret = supported && OnyxFrontLight.isAvailable(getContext())
                ? OnyxFrontLight.toJson(getContext())
                : new JSObject();
            ret.put("supported", supported);
            if (level >= 0f) {
                ret.put("level", level);
                ret.put("onyx", true);
            } else {
                ret.put("level", 0.5f);
                ret.put("onyx", false);
                String err = OnyxFrontLight.lastError();
                if (err != null && !err.isEmpty()) ret.put("onyxError", err);
            }
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        TextToSpeech tts = ttsManager.getTts();
        if (!ttsManager.isReady() || tts == null) {
            call.resolve(new JSObject().put("voices", new JSArray()));
            return;
        }
        JSArray voices = new JSArray();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Set<Voice> set = tts.getVoices();
            if (set != null) {
                for (Voice voice : set) {
                    JSObject item = new JSObject();
                    item.put("name", voice.getName());
                    item.put("lang", voice.getLocale() != null ? voice.getLocale().toLanguageTag() : "");
                    item.put("uri", voice.getName());
                    voices.put(item);
                }
            }
        } else {
            JSObject item = new JSObject();
            item.put("name", "default");
            item.put("lang", "ru-RU");
            item.put("uri", "default");
            voices.put(item);
        }
        JSObject ret = new JSObject();
        ret.put("voices", voices);
        call.resolve(ret);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("Missing text");
            return;
        }
        String utteranceId = call.getString("utteranceId", "u" + System.currentTimeMillis());
        Float rate = call.getFloat("rate", 1f);
        String voiceName = call.getString("voice", "");
        ttsManager.speak(text, utteranceId, rate != null ? rate : 1f, voiceName);
        call.resolve();
    }

    @PluginMethod
    public void stopTts(PluginCall call) {
        ttsManager.stop();
        call.resolve();
    }

    @PluginMethod
    public void pauseTts(PluginCall call) {
        ttsManager.pause();
        call.resolve();
    }

    @PluginMethod
    public void resumeTts(PluginCall call) {
        ttsManager.resume();
        call.resolve();
    }

    @PluginMethod
    public void getTtsState(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("speaking", ttsManager.isSpeaking());
        ret.put("paused", ttsManager.isPaused());
        call.resolve(ret);
    }
}
