package ru.inpx.bookreader;

import android.content.Intent;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ActionMode;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {

    private static final long SPLASH_MAX_MS = 15000;

    private FrontLightSwipe lightSwipe;
    private View splashOverlay;
    private boolean splashIsDark = true;
    private final Handler splashHandler = new Handler(Looper.getMainLooper());
    private Runnable splashTimeoutRunnable;

    /** <input type="file"> из WebView (импорт заметок, фоновая картинка читалки). */
    private ValueCallback<Uri[]> pendingFileChooser;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            ValueCallback<Uri[]> callback = pendingFileChooser;
            pendingFileChooser = null;
            if (callback == null) return;
            callback.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData())
            );
        });

    private final Runnable splashPollRunnable = new Runnable() {
        @Override
        public void run() {
            pollSplashHide();
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // До любого вызова Onyx DeviceController (blacklist на Android 13 / BOOX 4.2)
        OnyxFrontLight.applyHiddenApiExemptions();
        splashIsDark = SplashThemeResolver.useDarkSplash(this);
        setTheme(
            splashIsDark
                ? R.style.AppTheme_NoActionBarLaunch_Dark
                : R.style.AppTheme_NoActionBarLaunch_Light
        );
        registerPlugin(FolderPickerPlugin.class);
        registerPlugin(BookStoragePlugin.class);
        registerPlugin(ReaderNativePlugin.class);
        registerPlugin(SecureCredentialsPlugin.class);
        registerPlugin(DownloadNotificationPlugin.class);
        registerPlugin(LaunchIntentPlugin.class);
        registerPlugin(ContinueWidgetPlugin.class);
        registerPlugin(NetworkInfoPlugin.class);
        super.onCreate(savedInstanceState);
        lightSwipe = new FrontLightSwipe(this, lightSwipeHost);
        installWebViewFileChooser();
        showNativeSplashOverlay();
        splashHandler.post(splashPollRunnable);
        splashTimeoutRunnable = this::hideNativeSplashOverlay;
        splashHandler.postDelayed(splashTimeoutRunnable, SPLASH_MAX_MS);
        handleLaunchIntent(getIntent());
    }

    private void pollSplashHide() {
        if (splashOverlay == null) return;
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            splashHandler.postDelayed(splashPollRunnable, 50);
            return;
        }
        webView.evaluateJavascript(
            "(function(){return window.__INPX_APP_READY__===true;})()",
            value -> {
                if ("true".equals(value)) {
                    hideNativeSplashOverlay();
                } else if (splashOverlay != null) {
                    splashHandler.postDelayed(splashPollRunnable, 80);
                }
            }
        );
    }

    /**
     * Стоковый WebView не обрабатывает <input type="file"> без onShowFileChooser —
     * иначе «Импорт заметок» и выбор фонового изображения в читалке молча мертвы в APK.
     */
    private void installWebViewFileChooser() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                if (pendingFileChooser != null) {
                    pendingFileChooser.onReceiveValue(null);
                }
                pendingFileChooser = callback;
                final Intent intent;
                try {
                    intent = params.createIntent();
                } catch (Exception e) {
                    pendingFileChooser = null;
                    return false;
                }
                try {
                    fileChooserLauncher.launch(intent);
                    return true;
                } catch (Exception e) {
                    pendingFileChooser = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });
    }

    private void showNativeSplashOverlay() {
        if (splashOverlay != null) return;
        int splashColor = SplashThemeResolver.splashBackgroundColor(splashIsDark);
        getWindow().setBackgroundDrawable(new ColorDrawable(splashColor));
        splashOverlay = getLayoutInflater().inflate(R.layout.native_splash_overlay, null);
        View root = splashOverlay.findViewById(R.id.native_splash_root);
        if (root != null) {
            root.setBackgroundColor(splashColor);
        }
        addContentView(
            splashOverlay,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
    }

    private void hideNativeSplashOverlay() {
        splashHandler.removeCallbacks(splashPollRunnable);
        if (splashTimeoutRunnable != null) {
            splashHandler.removeCallbacks(splashTimeoutRunnable);
            splashTimeoutRunnable = null;
        }
        if (splashOverlay == null) return;
        final View overlay = splashOverlay;
        splashOverlay = null;
        overlay.animate()
            .alpha(0f)
            .setDuration(180)
            .withEndAction(() -> {
                ViewGroup parent = overlay.getParent() instanceof ViewGroup group ? group : null;
                if (parent != null) parent.removeView(overlay);
            })
            .start();
    }

    @Override
    public void onDestroy() {
        splashHandler.removeCallbacks(splashPollRunnable);
        if (splashTimeoutRunnable != null) {
            splashHandler.removeCallbacks(splashTimeoutRunnable);
        }
        splashOverlay = null;
        ReaderNativePlugin.resetVolumeKeysCapture();
        FrontLightSwipe.setEnabled(false);
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLaunchIntent(intent);
    }

    private void handleLaunchIntent(Intent intent) {
        LaunchIntentPlugin.capture(this, intent);
        if (bridge == null) return;
        PluginHandle handle = bridge.getPlugin("LaunchIntent");
        if (handle != null && handle.getInstance() instanceof LaunchIntentPlugin plugin) {
            plugin.deliverPending();
        }
    }

    @Override
    public void onActionModeStarted(ActionMode mode) {
        if (!ReaderCapacitorWebView.isSystemTextSelectionMenuEnabled()) {
            Menu menu = mode != null ? mode.getMenu() : null;
            if (menu != null) menu.clear();
        }
        super.onActionModeStarted(mode);
    }

    private void dispatchVolumePageTurn(String direction) {
        if (bridge == null || bridge.getWebView() == null) return;
        String js =
            "window.dispatchEvent(new CustomEvent('reader-volume-key',{detail:{direction:'"
                + direction
                + "'}}))";
        bridge.getWebView().evaluateJavascript(js, null);
    }

    /**
     * Подсветка свайпом у края обрабатывается здесь, до WebView: так жест не зависит
     * от JS и рендера страницы. Пока жест не «наш», события уходят в WebView как обычно.
     */
    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        FrontLightSwipe swipe = lightSwipe;
        if (swipe != null && swipe.onTouch(ev)) return true;
        return super.dispatchTouchEvent(ev);
    }

    private final FrontLightSwipe.Host lightSwipeHost = new FrontLightSwipe.Host() {
        @Override
        public void cancelWebViewTouch(MotionEvent source) {
            MotionEvent cancel = MotionEvent.obtain(source);
            cancel.setAction(MotionEvent.ACTION_CANCEL);
            try {
                MainActivity.super.dispatchTouchEvent(cancel);
            } finally {
                cancel.recycle();
            }
        }

        @Override
        public void onFrontLightState(JSObject state) {
            runOnUiThread(() -> ReaderNativePlugin.emitFrontLightState(state));
        }
    };

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && ReaderNativePlugin.isVolumeKeysCaptureEnabled()) {
            int keyCode = event.getKeyCode();
            if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
                dispatchVolumePageTurn("next");
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
                dispatchVolumePageTurn("prev");
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
}
