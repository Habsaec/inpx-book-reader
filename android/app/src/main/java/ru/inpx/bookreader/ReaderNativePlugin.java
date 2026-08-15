package ru.inpx.bookreader;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Insets;
import android.os.Build;
import android.speech.tts.Voice;
import android.util.Base64;
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
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "ReaderNative")
public class ReaderNativePlugin extends Plugin {

    private TtsPlaybackManager ttsManager;
    private static ReaderNativePlugin instance;
    private static volatile boolean volumeKeysCaptureEnabled = false;

    public static boolean isVolumeKeysCaptureEnabled() {
        return volumeKeysCaptureEnabled;
    }

    /** Native teardown path when WebView/plugin may not run JS cleanup. */
    public static void resetVolumeKeysCapture() {
        volumeKeysCaptureEnabled = false;
    }
    private final ExecutorService coverExecutor = Executors.newSingleThreadExecutor();

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

    @Override
    protected void handleOnDestroy() {
        volumeKeysCaptureEnabled = false;
        FrontLightSwipe.setEnabled(false);
        coverExecutor.shutdownNow();
        if (instance == this) instance = null;
        super.handleOnDestroy();
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

    /** Capture Vol+/− for page turns only while Foliate reader is open. */
    @PluginMethod
    public void setVolumeKeysCapture(PluginCall call) {
        volumeKeysCaptureEnabled = Boolean.TRUE.equals(call.getBoolean("enabled", Boolean.FALSE));
        JSObject ret = new JSObject();
        ret.put("enabled", volumeKeysCaptureEnabled);
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
                    Insets cutout = wi.getInsets(WindowInsets.Type.displayCutout());
                    // Punch-hole / notch: берём max(systemBars, cutout), иначе текст
                    // уезжает под камеру при edge-to-edge.
                    topPx = Math.max(bars.top, cutout.top);
                    bottomPx = Math.max(bars.bottom, cutout.bottom);
                    leftPx = Math.max(bars.left, cutout.left);
                    rightPx = Math.max(bars.right, cutout.right);
                }
            } else {
                WindowInsets wi = decor.getRootWindowInsets();
                if (wi != null) {
                    topPx = wi.getSystemWindowInsetTop();
                    bottomPx = wi.getSystemWindowInsetBottom();
                    leftPx = wi.getSystemWindowInsetLeft();
                    rightPx = wi.getSystemWindowInsetRight();
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && wi.getDisplayCutout() != null) {
                        topPx = Math.max(topPx, wi.getDisplayCutout().getSafeInsetTop());
                        bottomPx = Math.max(bottomPx, wi.getDisplayCutout().getSafeInsetBottom());
                        leftPx = Math.max(leftPx, wi.getDisplayCutout().getSafeInsetLeft());
                        rightPx = Math.max(rightPx, wi.getDisplayCutout().getSafeInsetRight());
                    }
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
        // Пересоздаём TTS, если в настройках телефона сменили движок —
        // иначе список голосов остаётся от старого системного TTS.
        ttsManager.ensureSystemDefault(() -> {
            JSArray voices = new JSArray();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                for (Voice voice : ttsManager.listVoices()) {
                    JSObject item = new JSObject();
                    item.put("name", voice.getName());
                    item.put("lang", voice.getLocale() != null ? voice.getLocale().toLanguageTag() : "");
                    item.put("uri", voice.getName());
                    voices.put(item);
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
            ret.put("engine", ttsManager.getBoundEngine());
            call.resolve(ret);
        });
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

    /**
     * Sync Android MediaSession / MediaStyle notification for lock screen and system media capsule.
     * Optional cover: coverBase64 (raw or data-URL) preferred; else coverUrl (+ authHeader).
     */
    @PluginMethod
    public void updateTtsMediaSession(PluginCall call) {
        Boolean activeObj = call.getBoolean("active", Boolean.FALSE);
        boolean active = Boolean.TRUE.equals(activeObj);
        Boolean playingObj = call.getBoolean("playing", Boolean.FALSE);
        boolean playing = Boolean.TRUE.equals(playingObj);
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String coverBase64 = call.getString("coverBase64", null);
        String coverUrl = call.getString("coverUrl", null);
        String authHeader = call.getString("authHeader", null);

        TtsMediaState.update(title, artist, playing, active);

        if (!active) {
            Intent stop = new Intent(getContext(), TtsForegroundService.class);
            getContext().stopService(stop);
            call.resolve();
            return;
        }

        Intent refresh = new Intent(getContext(), TtsForegroundService.class);
        refresh.setAction(TtsForegroundService.ACTION_REFRESH);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(refresh);
        } else {
            getContext().startService(refresh);
        }

        if (coverBase64 != null && !coverBase64.trim().isEmpty()) {
            final String b64 = coverBase64.trim();
            coverExecutor.execute(() -> {
                Bitmap bmp = decodeCoverBase64(b64);
                if (bmp != null) {
                    TtsMediaState.setCover(bmp, "b64:" + b64.hashCode());
                    if (TtsMediaState.snapshot().active) {
                        refreshTtsForeground();
                    }
                }
            });
        } else if (coverUrl != null && !coverUrl.trim().isEmpty()) {
            final String url = coverUrl.trim();
            final String auth = authHeader;
            coverExecutor.execute(() -> {
                Bitmap bmp = downloadCoverBitmap(url, auth);
                if (bmp != null) {
                    TtsMediaState.setCover(bmp, "url:" + url);
                    if (TtsMediaState.snapshot().active) {
                        refreshTtsForeground();
                    }
                }
            });
        }

        call.resolve();
    }

    static void emitTtsMediaAction(String action) {
        ReaderNativePlugin plugin = instance;
        if (plugin == null || action == null || action.isEmpty()) return;
        JSObject data = new JSObject();
        data.put("action", action);
        plugin.notifyListeners("ttsMediaAction", data);
        if (plugin.getBridge() == null || plugin.getBridge().getWebView() == null) return;
        String safe = action.replace("\\", "\\\\").replace("'", "\\'");
        String js =
            "(function(){"
                + "var payload={type:'inpx-native-event',event:'ttsMediaAction',data:{action:'"
                + safe
                + "'}};"
                + "window.postMessage(payload,'*');"
                + "var iframe=document.querySelector('iframe[title]');"
                + "if(iframe&&iframe.contentWindow){iframe.contentWindow.postMessage(payload,'*');}"
                + "})();";
        plugin.getActivity().runOnUiThread(
            () -> plugin.getBridge().getWebView().evaluateJavascript(js, null)
        );
    }

    private void refreshTtsForeground() {
        Intent refresh = new Intent(getContext(), TtsForegroundService.class);
        refresh.setAction(TtsForegroundService.ACTION_REFRESH);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(refresh);
        } else {
            getContext().startService(refresh);
        }
    }

    private static Bitmap decodeCoverBase64(String raw) {
        try {
            String data = raw;
            int comma = data.indexOf(',');
            if (data.startsWith("data:") && comma > 0) {
                data = data.substring(comma + 1);
            }
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (bytes == null || bytes.length == 0) return null;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.RGB_565;
            Bitmap full = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
            return scaleCover(full);
        } catch (Exception e) {
            return null;
        }
    }

    private static Bitmap downloadCoverBitmap(String coverUrl, String authHeader) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(coverUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setInstanceFollowRedirects(true);
            if (authHeader != null && !authHeader.isEmpty()) {
                conn.setRequestProperty("Authorization", authHeader);
            }
            conn.setRequestProperty("Accept", "image/*");
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;
            try (InputStream in = conn.getInputStream()) {
                BitmapFactory.Options opts = new BitmapFactory.Options();
                opts.inPreferredConfig = Bitmap.Config.RGB_565;
                Bitmap full = BitmapFactory.decodeStream(in, null, opts);
                return scaleCover(full);
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static Bitmap scaleCover(Bitmap full) {
        if (full == null) return null;
        int max = 512;
        int w = full.getWidth();
        int h = full.getHeight();
        if (w <= 0 || h <= 0) return full;
        if (w <= max && h <= max) return full;
        float scale = Math.min(max / (float) w, max / (float) h);
        int nw = Math.max(1, Math.round(w * scale));
        int nh = Math.max(1, Math.round(h * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(full, nw, nh, true);
        if (scaled != full) full.recycle();
        return scaled;
    }
}
