package ru.inpx.bookreader;

import android.content.Intent;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ActionMode;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {

    private static final long SPLASH_MAX_MS = 15000;

    private FrontLightSwipe lightSwipe;
    private View splashOverlay;
    private boolean splashIsDark = true;
    private final Handler splashHandler = new Handler(Looper.getMainLooper());
    private Runnable splashTimeoutRunnable;

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
        super.onCreate(savedInstanceState);
        lightSwipe = new FrontLightSwipe(this, lightSwipeHost);
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
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLaunchIntent(intent);
    }

    private void handleLaunchIntent(Intent intent) {
        LaunchIntentPlugin.capture(intent);
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
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
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
