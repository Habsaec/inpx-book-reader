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
        ttsManager = TtsPlaybackManager.getInstance(getContext());
        ttsManager.setUtteranceCallback((type, utteranceId) -> forwardTtsEventToReader(type, utteranceId));
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
    public void setBrightness(PluginCall call) {
        Float level = call.getFloat("level");
        if (level == null) {
            call.reject("Missing level");
            return;
        }
        float clamped = Math.max(0.01f, Math.min(1f, level));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowManager.LayoutParams params = window.getAttributes();
            params.screenBrightness = clamped;
            window.setAttributes(params);
            call.resolve();
        });
    }

    @PluginMethod
    public void getBrightness(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WindowManager.LayoutParams params = getActivity().getWindow().getAttributes();
            float level = params.screenBrightness;
            if (level < 0) level = 1f;
            JSObject ret = new JSObject();
            ret.put("level", level);
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
