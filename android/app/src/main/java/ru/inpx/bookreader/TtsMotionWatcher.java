package ru.inpx.bookreader;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.SystemClock;

/**
 * Таймер сна озвучки: «телефон в руках» = вектор гравитации отходит от своего медленного среднего
 * больше чем на {@code threshold} м/с² и держится так не меньше {@code spanMs} (рука всё время
 * покачивает телефон, а лежащий рядом на кровати получает лишь короткие толчки). Тот же алгоритм,
 * что createMotionDetector в reader-shared/reader-tts.js. Работает и при выключенном экране, пока
 * идёт озвучка (foreground-сервис), — WebView {@code devicemotion} в это время молчит.
 */
public final class TtsMotionWatcher implements SensorEventListener {

    public interface Listener {
        void onMotion();
    }

    /** Более тихие отсчёты короче этого не прерывают движение. */
    private static final long GAP_MS = 600L;
    /** Постоянная времени медленного среднего (положение, в котором телефон лежит). */
    private static final double BASE_TAU_MS = 1000.0;
    private static final long MIN_INTERVAL_MS = 1500L;

    private final SensorManager sensorManager;
    private final Listener listener;
    private final float[] base = new float[3];
    private boolean hasBase = false;
    private boolean running = false;
    private long lastSampleAt = 0L;
    private long runStart = 0L;
    private long lastHit = 0L;
    private long lastEmitAt = 0L;
    private volatile float threshold = 0.8f;
    private volatile long spanMs = 700L;

    public TtsMotionWatcher(Context context, Listener listener) {
        this.sensorManager = (SensorManager) context.getApplicationContext().getSystemService(Context.SENSOR_SERVICE);
        this.listener = listener;
    }

    /** Чувствительность из настройки читалки (TTS_MOTION_LEVELS). */
    public synchronized void configure(float threshold, long spanMs) {
        if (threshold > 0) this.threshold = threshold;
        if (spanMs >= 0) this.spanMs = spanMs;
        runStart = 0L;
    }

    /** @return false when the device has no accelerometer */
    public synchronized boolean start() {
        if (running) return true;
        if (sensorManager == null) return false;
        Sensor sensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (sensor == null) return false;
        hasBase = false;
        runStart = 0L;
        running = sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL);
        return running;
    }

    public synchronized void stop() {
        if (!running) return;
        running = false;
        try {
            sensorManager.unregisterListener(this);
        } catch (Exception ignored) { /* */ }
    }

    public synchronized boolean isRunning() {
        return running;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event == null || event.values == null || event.values.length < 3) return;
        float x = event.values[0];
        float y = event.values[1];
        float z = event.values[2];
        long now = SystemClock.elapsedRealtime();
        if (!hasBase) {
            base[0] = x;
            base[1] = y;
            base[2] = z;
            hasBase = true;
            lastSampleAt = now;
            return;
        }
        float dx = x - base[0];
        float dy = y - base[1];
        float dz = z - base[2];
        double d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        float alpha = (float) (1.0 - Math.exp(-Math.max(1L, now - lastSampleAt) / BASE_TAU_MS));
        lastSampleAt = now;
        base[0] += dx * alpha;
        base[1] += dy * alpha;
        base[2] += dz * alpha;
        if (d <= threshold) {
            if (runStart != 0L && now - lastHit > GAP_MS) runStart = 0L;
            return;
        }
        if (runStart == 0L || now - lastHit > GAP_MS) runStart = now;
        lastHit = now;
        if (now - runStart < spanMs) return;
        runStart = 0L;
        if (now - lastEmitAt < MIN_INTERVAL_MS) return;
        lastEmitAt = now;
        if (listener != null) listener.onMotion();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { /* */ }
}
