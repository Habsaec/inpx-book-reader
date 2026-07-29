package ru.inpx.bookreader;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.SystemClock;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import com.getcapacitor.JSObject;

/**
 * Подсветка ведением пальца у края экрана, как в AlReaderX: левый край — яркость,
 * правый — температура (если устройство её умеет).
 *
 * <p>Жест обрабатывается в {@code dispatchTouchEvent}, то есть до WebView. Поток
 * касаний не зависит от JS, рендера страницы и постоянного обновления e-ink, а
 * значение уходит в железо сразу на каждом шаге — без round-trip через мост
 * iframe → parent → плагин, из-за которого шкала отставала от пальца.
 */
final class FrontLightSwipe {

    private static final String TAG = "FrontLightSwipe";

    interface Host {
        /** Оборвать начатый жест внутри WebView, иначе Foliate перелистнёт страницу. */
        void cancelWebViewTouch(MotionEvent source);

        /** Итоговое состояние — в JS (localStorage + слайдеры настроек). */
        void onFrontLightState(JSObject state);
    }

    private static final float EDGE_MIN_DP = 36f;
    private static final float EDGE_MAX_DP = 56f;
    private static final float EDGE_FRACTION = 0.12f;
    private static final float ARM_DP = 8f;
    /** Продолжение после внешней отмены: почти без порога, чтобы жест не «начинался заново». */
    private static final float RESUME_ARM_DP = 2f;
    /**
     * Системный оверлей подсветки BOOX и полное обновление экрана отбирают поток
     * касаний у окна (ACTION_CANCEL). Палец при этом никуда не делся, поэтому
     * следующее касание у того же края продолжает регулировку с прежнего значения.
     */
    private static final long RESUME_MS = 2500L;
    /** Полный ход шкалы за эту долю высоты экрана. */
    private static final float SPAN_FRACTION = 0.55f;
    /** Панели читалки сверху/снизу жест не перехватывает. */
    private static final float SAFE_TOP_FRACTION = 0.1f;
    private static final float SAFE_BOTTOM_FRACTION = 0.88f;

    private static volatile boolean enabled;
    /** Слепок последнего жеста для строки диагностики в настройках читалки. */
    private static volatile String lastTrace = "";

    private final Activity activity;
    private final Host host;

    private boolean tracking;
    private boolean claimed;
    private boolean warmthSide;
    private int pointerId = -1;
    private float startX;
    private float startY;
    private float prevY;
    /** Дробное значение шкалы: округление на каждом шаге съедало медленные движения. */
    private float value;
    private float stepPx = 1f;
    private int max = 1;
    private int lastRaw = Integer.MIN_VALUE;
    private float armPx;
    private float resumeValue = Float.NaN;
    private long downAt;
    private int moveCount;
    private int writeCount;
    private int startRaw;
    private long canceledAt;
    private boolean canceledWarmth;
    private float canceledValue;
    private TextView hud;

    FrontLightSwipe(Activity activity, Host host) {
        this.activity = activity;
        this.host = host;
    }

    static void setEnabled(boolean value) {
        enabled = value;
    }

    static boolean isEnabled() {
        return enabled;
    }

    static String lastTrace() {
        return lastTrace;
    }

    boolean onTouch(MotionEvent ev) {
        if (!enabled) {
            if (tracking || claimed) reset();
            return false;
        }
        switch (ev.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                return onDown(ev);
            case MotionEvent.ACTION_MOVE:
                return onMove(ev);
            case MotionEvent.ACTION_UP: {
                boolean was = claimed;
                if (was) {
                    trace("up");
                    commit();
                }
                canceledAt = 0;
                reset();
                return was;
            }
            case MotionEvent.ACTION_CANCEL: {
                boolean was = claimed;
                if (was) {
                    trace("cancel");
                    commit();
                    canceledAt = SystemClock.uptimeMillis();
                    canceledWarmth = warmthSide;
                    canceledValue = value;
                }
                reset();
                return was;
            }
            default:
                // Лишний «призрачный» тач на e-ink жест не ломает
                return claimed;
        }
    }

    private boolean onDown(MotionEvent ev) {
        reset();
        if (!OnyxFrontLight.availableFast()) return false;
        int width = viewportWidth();
        int height = viewportHeight();
        float x = ev.getX();
        float y = ev.getY();
        if (y < height * SAFE_TOP_FRACTION || y > height * SAFE_BOTTOM_FRACTION) return false;
        float edge = edgePx(width);
        if (x <= edge) {
            warmthSide = false;
        } else if (width - x <= edge && OnyxFrontLight.warmthAvailableFast()) {
            warmthSide = true;
        } else {
            return false;
        }
        tracking = true;
        pointerId = ev.getPointerId(0);
        startX = x;
        startY = y;
        prevY = y;
        downAt = SystemClock.uptimeMillis();
        moveCount = 0;
        writeCount = 0;
        boolean resuming = canceledAt != 0
            && canceledWarmth == warmthSide
            && downAt - canceledAt <= RESUME_MS;
        resumeValue = resuming ? canceledValue : Float.NaN;
        armPx = dp(resuming ? RESUME_ARM_DP : ARM_DP);
        canceledAt = 0;
        // DOWN отдаём WebView: жест ещё может оказаться тапом или листанием
        return false;
    }

    private boolean onMove(MotionEvent ev) {
        if (!tracking) return false;
        int index = ev.findPointerIndex(pointerId);
        if (index < 0) return claimed;
        float x = ev.getX(index);
        float y = ev.getY(index);
        if (!claimed) {
            float adx = Math.abs(x - startX);
            float ady = Math.abs(y - startY);
            if (adx > armPx && adx > ady) {
                // Горизонталь у края — жест меню/листания, не наш
                tracking = false;
                return false;
            }
            if (ady < armPx) return false;
            claim(y);
            host.cancelWebViewTouch(ev);
            return true;
        }
        moveCount++;
        step(prevY - y);
        prevY = y;
        return true;
    }

    private void claim(float y) {
        claimed = true;
        prevY = y;
        max = Math.max(1, warmthSide ? OnyxFrontLight.warmthMaxFast() : OnyxFrontLight.brightnessMaxFast());
        int raw = warmthSide ? OnyxFrontLight.warmthRawFast() : OnyxFrontLight.brightnessRawFast();
        float from = Float.isNaN(resumeValue) ? raw : resumeValue;
        value = Math.max(0, Math.min(max, from));
        lastRaw = Math.round(value);
        startRaw = lastRaw;
        stepPx = Math.max(1f, viewportHeight() * SPAN_FRACTION / max);
        showHud(lastRaw);
    }

    /** @param dyUp сдвиг пальца вверх в пикселях (вверх = ярче/теплее) */
    private void step(float dyUp) {
        if (dyUp == 0f) return;
        value = Math.max(0f, Math.min(max, value + dyUp / stepPx));
        int raw = Math.round(value);
        if (raw == lastRaw) return;
        lastRaw = raw;
        showHud(raw);
        writeCount++;
        write(raw, null);
    }

    /**
     * Итог жеста для диагностики: обрыв посреди свайпа видно по {@code cancel} и по
     * тому, сколько MOVE успело дойти до окна.
     */
    private void trace(String end) {
        lastTrace = (warmthSide ? "warm" : "br")
            + " " + end
            + " mv=" + moveCount
            + " wr=" + writeCount
            + " " + startRaw + ">" + lastRaw + "/" + max
            + " " + (SystemClock.uptimeMillis() - downAt) + "ms"
            + " hw=" + OnyxFrontLight.lastWriteMs() + "ms";
        Log.i(TAG, lastTrace);
    }

    private void commit() {
        hideHud();
        if (lastRaw == Integer.MIN_VALUE) return;
        write(lastRaw, host::onFrontLightState);
    }

    private void write(int raw, java.util.function.Consumer<JSObject> onDone) {
        if (warmthSide) OnyxFrontLight.enqueueSetRaw(activity, null, raw, onDone);
        else OnyxFrontLight.enqueueSetRaw(activity, raw, null, onDone);
    }

    private void reset() {
        tracking = false;
        claimed = false;
        pointerId = -1;
        lastRaw = Integer.MIN_VALUE;
        hideHud();
    }

    private float edgePx(int width) {
        float byFraction = width * EDGE_FRACTION;
        return Math.min(dp(EDGE_MAX_DP), Math.max(dp(EDGE_MIN_DP), byFraction));
    }

    private void showHud(int raw) {
        TextView view = hudView();
        if (view == null) return;
        view.setText(activity.getString(
            warmthSide ? R.string.light_hud_warmth : R.string.light_hud_brightness, raw, max));
        if (view.getVisibility() != View.VISIBLE) view.setVisibility(View.VISIBLE);
    }

    private void hideHud() {
        if (hud != null && hud.getVisibility() != View.GONE) hud.setVisibility(View.GONE);
    }

    private TextView hudView() {
        if (hud != null) return hud;
        if (activity.isFinishing()) return null;
        TextView view = new TextView(activity);
        view.setTextColor(Color.BLACK);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f);
        int padH = Math.round(dp(18f));
        int padV = Math.round(dp(12f));
        view.setPadding(padH, padV, padH, padV);
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.WHITE);
        background.setStroke(Math.max(1, Math.round(dp(1.5f))), Color.BLACK);
        background.setCornerRadius(dp(12f));
        view.setBackground(background);
        view.setVisibility(View.GONE);
        activity.addContentView(view, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER));
        hud = view;
        return view;
    }

    private float dp(float value) {
        return value * activity.getResources().getDisplayMetrics().density;
    }

    private int viewportWidth() {
        View decor = activity.getWindow() != null ? activity.getWindow().getDecorView() : null;
        int width = decor != null ? decor.getWidth() : 0;
        return width > 0 ? width : activity.getResources().getDisplayMetrics().widthPixels;
    }

    private int viewportHeight() {
        View decor = activity.getWindow() != null ? activity.getWindow().getDecorView() : null;
        int height = decor != null ? decor.getHeight() : 0;
        return height > 0 ? height : activity.getResources().getDisplayMetrics().heightPixels;
    }
}
