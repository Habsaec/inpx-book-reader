package ru.inpx.bookreader;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.SystemClock;

/**
 * Таймер сна озвучки: «телефон в руках» = вектор гравитации заметно отходит от своего медленного
 * среднего (на столе шум ~0.02 м/с², наклон в руке на 2° ≈ 0.34 м/с²). Тот же алгоритм, что
 * createMotionDetector в reader-shared/reader-tts.js. Работает и при выключенном экране, пока
 * идёт озвучка (foreground-сервис), — WebView `devicemotion` в это время молчит.
 */
public final class TtsMotionWatcher implements SensorEventListener {

    public interface Listener {
        void onMotion();
    }

    private static final float THRESHOLD = 0.3f;
    private static final long MIN_INTERVAL_MS = 1500L;

    private final SensorManager sensorManager;
    private final Listener listener;
    private final float[] base = new float[3];
    private boolean hasBase = false;
    private boolean running = false;
    private long lastEmitAt = 0L;

    public TtsMotionWatcher(Context context, Listener listener) {
        this.sensorManager = (SensorManager) context.getApplicationContext().getSystemService(Context.SENSOR_SERVICE);
        this.listener = listener;
    }

    /** @return false when the device has no accelerometer */
    public synchronized boolean start() {
        if (running) return true;
        if (sensorManager == null) return false;
        Sensor sensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (sensor == null) return false;
        hasBase = false;
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
        if (!hasBase) {
            base[0] = x;
            base[1] = y;
            base[2] = z;
            hasBase = true;
            return;
        }
        float dx = x - base[0];
        float dy = y - base[1];
        float dz = z - base[2];
        double d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        base[0] = base[0] * 0.9f + x * 0.1f;
        base[1] = base[1] * 0.9f + y * 0.1f;
        base[2] = base[2] * 0.9f + z * 0.1f;
        if (d <= THRESHOLD) return;
        long now = SystemClock.elapsedRealtime();
        if (now - lastEmitAt < MIN_INTERVAL_MS) return;
        lastEmitAt = now;
        if (listener != null) listener.onMotion();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { /* */ }
}
