package ru.inpx.bookreader;

import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

import com.getcapacitor.JSObject;

import org.lsposed.hiddenapibypass.HiddenApiBypass;

import java.io.File;
import java.io.FileOutputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * Onyx/BOOX frontlight — порт логики KOReader {@code OnyxSdkLightsController}
 * (тот же DeviceController, что использует AlReaderX / CoolReader на новых BOOX).
 *
 * <p>Приоритет детекции (как в KOReader BrightnessDetector):
 * <ol>
 *   <li>{@code checkCTM} / max(type 6) → CTM: {@code setLightValue(7)} яркость, {@code setLightValue(6)} температура</li>
 *   <li>{@code hasFLBrightness} → FL: type 1</li>
 *   <li>{@code hasCTMBrightness} → cold/warm: types 3/2 через setCold/setWarm</li>
 * </ol>
 *
 * <p>Шкала — сырые int 0..max с устройства, не localStorage и не «проценты» UI.
 */
final class OnyxFrontLight {
    private static final String TAG = "OnyxFrontLight";

    private static final int LIGHT_TYPE_FL = 1;
    private static final int LIGHT_TYPE_CTM_WARM = 2;
    private static final int LIGHT_TYPE_CTM_COLD = 3;
    private static final int LIGHT_TYPE_CTM_ALL = 4;
    private static final int LIGHT_TYPE_TEMP = 6;
    private static final int LIGHT_TYPE_CTM_BR = 7;

    private enum Mode {
        NONE,
        /** KOReader CTM: types 7 + 6 via setLightValue */
        CTM,
        /** KOReader FL: type 1 */
        FL,
        /** KOReader WARM_AND_COLD: types 3 + 2 via setCold/setWarm */
        WARM_AND_COLD,
        SYSFS,
    }

    private static final String[] SYSFS_BRIGHTNESS = {
        "/sys/class/backlight/onyx_bl_br/brightness",
        "/sys/class/backlight/white/brightness",
        "/sys/class/backlight/pwm-backlight.0/brightness",
    };
    private static final String[] SYSFS_WARMTH = {
        "/sys/class/backlight/onyx_bl_ct/brightness",
        "/sys/class/backlight/warm/brightness",
    };

    /** Канал: raw == index в шкале 0..max (как у KOReader). */
    private static final class Channel {
        /** volatile: нативный жест читает значения с UI-потока, пишет — writer. */
        volatile int max = 0;
        volatile int raw = 0;

        int steps() {
            return Math.max(1, max + 1);
        }

        float normalized() {
            if (max <= 0) return raw > 0 ? 1f : 0f;
            return clamp01(raw / (float) max);
        }

        void setNormalized(float level) {
            if (max <= 0) {
                raw = level > 0.5f ? 1 : 0;
                return;
            }
            raw = Math.round(clamp01(level) * max);
            raw = Math.max(0, Math.min(max, raw));
        }

        /** @return true если значение изменилось */
        boolean adjust(int delta) {
            if (delta == 0 || max < 0) return false;
            int next = raw + delta;
            next = Math.max(0, Math.min(max, next));
            if (next == raw) return false;
            raw = next;
            return true;
        }

        void setRaw(int value) {
            raw = Math.max(0, Math.min(max, value));
        }
    }

    private static boolean exemptionsApplied;
    private static boolean probed;
    private static volatile boolean available;
    private static volatile boolean warmthAvailable;
    private static Mode mode = Mode.NONE;
    private static Class<?> controllerClass;
    private static boolean hasSetLightValue;
    private static boolean hasSetCold;
    private static boolean hasSetWarm;
    private static boolean hasSetFrontLight;
    private static boolean hasOpenFrontLight;
    private static boolean hasCloseFrontLight;
    private static boolean hasIsLightOn;
    private static String sysfsBrightnessPath;
    private static String sysfsWarmthPath;
    private static String lastError = "";
    private static String status = "idle";
    private static String detection = "";
    private static volatile long lastWriteMs;

    private static final Channel brightness = new Channel();
    private static final Channel warmth = new Channel();
    /** Последнее записанное — не дёргать DeviceController/sysfs зря (меньше системной шкалы BOOX). */
    private static int lastWrittenBrightness = Integer.MIN_VALUE;
    private static int lastWrittenWarmth = Integer.MIN_VALUE;
    private static boolean writeViaSysfs;
    /**
     * После первого успешного sysfs — больше не звать DeviceController (оверлей + touchcancel).
     * Флаги раздельные: node яркости часто есть, а node температуры нет, и общий флаг
     * молча отключал бы запись температуры вообще.
     */
    private static boolean sysfsBrightnessConfirmed;
    private static boolean sysfsWarmthConfirmed;
    /**
     * Запись frontlight вне UI-потока: DeviceController/sysfs на UI блокирует WebView,
     * touchmove перестаёт доходить — свайп «замирает» после пары шагов.
     */
    private static final ExecutorService WRITE_EXEC = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "onyx-frontlight");
        t.setDaemon(true);
        t.setPriority(Thread.NORM_PRIORITY - 1);
        return t;
    });
    private static Integer queuedBrightnessRaw;
    private static Integer queuedWarmthRaw;
    private static Consumer<JSObject> queuedWriteCallback;
    private static boolean writeDrainScheduled;

    private OnyxFrontLight() {}

    static String lastError() {
        return lastError;
    }

    static String status() {
        return status;
    }

    /** Длительность последней аппаратной записи: по ней видно, тормозит ли жест железо. */
    static long lastWriteMs() {
        return lastWriteMs;
    }

    static boolean isLikelyOnyxDevice() {
        String m = String.valueOf(Build.MANUFACTURER).toLowerCase(Locale.US);
        String b = String.valueOf(Build.BRAND).toLowerCase(Locale.US);
        String model = String.valueOf(Build.MODEL).toLowerCase(Locale.US);
        String product = String.valueOf(Build.PRODUCT).toLowerCase(Locale.US);
        String device = String.valueOf(Build.DEVICE).toLowerCase(Locale.US);
        return m.contains("onyx") || b.contains("boox")
            || model.contains("boox") || model.contains("onyx")
            || model.contains("go7") || product.contains("go7") || device.contains("go7")
            || model.contains("gocolor") || product.contains("gocolor");
    }

    /*
     * Снимок состояния без блокировки: нативный жест живёт на UI-потоке и не должен
     * ждать поток записи, который держит монитор класса всю аппаратную запись.
     */

    static boolean availableFast() {
        return available;
    }

    static boolean warmthAvailableFast() {
        return warmthAvailable;
    }

    static int brightnessRawFast() {
        return brightness.raw;
    }

    static int brightnessMaxFast() {
        return brightness.max;
    }

    static int warmthRawFast() {
        return warmth.raw;
    }

    static int warmthMaxFast() {
        return warmth.max;
    }

    static synchronized boolean isAvailable(Context context) {
        if (!isLikelyOnyxDevice()) return false;
        ensureInit(context.getApplicationContext());
        return available;
    }

    static void applyHiddenApiExemptions() {
        if (exemptionsApplied) return;
        exemptionsApplied = true;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            status = "bypass=n/a";
            return;
        }
        try {
            boolean ok = HiddenApiBypass.setHiddenApiExemptions("");
            if (!ok) ok = HiddenApiBypass.addHiddenApiExemptions("L");
            status = ok ? "bypass=ok" : "bypass=false";
        } catch (Throwable t) {
            lastError = "HiddenApiBypass: " + t.getMessage();
            status = "bypass=fail";
            Log.w(TAG, lastError, t);
        }
    }

    static synchronized boolean setLevel(Context context, float level) {
        if (!isLikelyOnyxDevice()) return false;
        ensureInit(context.getApplicationContext());
        if (!available) return false;
        brightness.setNormalized(level);
        return writeBrightness(context.getApplicationContext());
    }

    static synchronized float getLevel(Context context) {
        if (!isLikelyOnyxDevice()) return -1f;
        ensureInit(context.getApplicationContext());
        if (!available) return -1f;
        syncBrightnessFromDevice(context.getApplicationContext());
        return brightness.normalized();
    }

    static synchronized boolean hasWarmth(Context context) {
        if (!isLikelyOnyxDevice()) return false;
        ensureInit(context.getApplicationContext());
        return warmthAvailable;
    }

    static synchronized boolean setWarmth(Context context, float level) {
        if (!isLikelyOnyxDevice()) return false;
        ensureInit(context.getApplicationContext());
        if (!warmthAvailable) return false;
        warmth.setNormalized(level);
        return writeWarmth(context.getApplicationContext());
    }

    static synchronized float getWarmth(Context context) {
        if (!isLikelyOnyxDevice()) return -1f;
        ensureInit(context.getApplicationContext());
        if (!warmthAvailable) return -1f;
        syncWarmthFromDevice(context.getApplicationContext());
        return warmth.normalized();
    }

    /**
     * Пошаговая регулировка от текущего in-memory raw.
     * Не читаем устройство перед каждым шагом: на e-ink getLightValue отстаёт от set,
     * и повторный sync съедает накопленную дельту свайпа (нужно «несколько проходов»).
     * Актуальный raw подтягивается в {@link #toJson}/{@link #getLevel} / перед жестом.
     */
    static synchronized JSObject adjust(Context context, int brightnessDelta, int warmthDelta) {
        ensureInit(context.getApplicationContext());
        Context app = context.getApplicationContext();
        if (available) {
            if (brightnessDelta != 0 && brightness.adjust(brightnessDelta)) {
                writeBrightness(app);
            }
            if (warmthDelta != 0 && warmthAvailable && warmth.adjust(warmthDelta)) {
                writeWarmth(app);
            }
        }
        return toJson(app, false);
    }

    /** Абсолютная установка raw (для свайпа без потери шагов и с троттлингом на JS). */
    static synchronized JSObject setRaw(Context context, Integer brightnessRaw, Integer warmthRaw) {
        ensureInit(context.getApplicationContext());
        Context app = context.getApplicationContext();
        if (available) {
            if (brightnessRaw != null) {
                brightness.setRaw(brightnessRaw);
                writeBrightness(app);
            }
            if (warmthRaw != null && warmthAvailable) {
                warmth.setRaw(warmthRaw);
                writeWarmth(app);
            }
        }
        // Не syncFromDevice: getLightValue на Onyx отстаёт от set и откатывает in-memory raw.
        return toJson(app, false);
    }

    /**
     * Latest-wins очередь записи на фоне. Колбэк — с последним актуальным состоянием
     * (без sync с устройства, чтобы не съесть дельту свайпа).
     */
    static void enqueueSetRaw(Context context, Integer brightnessRaw, Integer warmthRaw,
                              Consumer<JSObject> onDone) {
        Context app = context.getApplicationContext();
        synchronized (OnyxFrontLight.class) {
            if (brightnessRaw != null) queuedBrightnessRaw = brightnessRaw;
            if (warmthRaw != null) queuedWarmthRaw = warmthRaw;
            if (onDone != null) queuedWriteCallback = onDone;
            if (writeDrainScheduled) return;
            writeDrainScheduled = true;
        }
        WRITE_EXEC.execute(() -> drainQueuedWrites(app));
    }

    static void enqueueAdjust(Context context, int brightnessDelta, int warmthDelta,
                              Consumer<JSObject> onDone) {
        Context app = context.getApplicationContext();
        WRITE_EXEC.execute(() -> {
            JSObject ret;
            synchronized (OnyxFrontLight.class) {
                ret = adjust(app, brightnessDelta, warmthDelta);
            }
            if (onDone != null) onDone.accept(ret);
        });
    }

    static void enqueueSetLevel(Context context, float level, Consumer<JSObject> onDone) {
        Context app = context.getApplicationContext();
        WRITE_EXEC.execute(() -> {
            JSObject ret;
            synchronized (OnyxFrontLight.class) {
                ensureInit(app);
                if (available) {
                    brightness.setNormalized(level);
                    writeBrightness(app);
                }
                ret = toJson(app, false);
            }
            if (onDone != null) onDone.accept(ret);
        });
    }

    static void enqueueSetWarmth(Context context, float level, Consumer<JSObject> onDone) {
        Context app = context.getApplicationContext();
        WRITE_EXEC.execute(() -> {
            JSObject ret;
            synchronized (OnyxFrontLight.class) {
                ensureInit(app);
                if (available && warmthAvailable) {
                    warmth.setNormalized(level);
                    writeWarmth(app);
                }
                ret = toJson(app, false);
            }
            if (onDone != null) onDone.accept(ret);
        });
    }

    private static void drainQueuedWrites(Context app) {
        while (true) {
            final Integer br;
            final Integer warm;
            final Consumer<JSObject> cb;
            synchronized (OnyxFrontLight.class) {
                br = queuedBrightnessRaw;
                warm = queuedWarmthRaw;
                cb = queuedWriteCallback;
                queuedBrightnessRaw = null;
                queuedWarmthRaw = null;
                queuedWriteCallback = null;
                if (br == null && warm == null) {
                    writeDrainScheduled = false;
                }
            }
            if (br == null && warm == null) {
                if (cb != null) {
                    JSObject state;
                    synchronized (OnyxFrontLight.class) {
                        state = toJson(app, false);
                    }
                    cb.accept(state);
                }
                return;
            }
            JSObject ret;
            boolean more;
            Consumer<JSObject> deferred = null;
            synchronized (OnyxFrontLight.class) {
                ret = setRaw(app, br, warm);
                more = queuedBrightnessRaw != null || queuedWarmthRaw != null;
                if (more && cb != null && queuedWriteCallback == null) {
                    // Есть более новая цель — колбэк только после финальной записи
                    queuedWriteCallback = cb;
                    deferred = cb;
                }
                if (!more) writeDrainScheduled = false;
            }
            // Каждый вызов обязан получить ответ: иначе PluginCall не резолвится
            // и очередь записи на стороне JS встаёт до таймаута моста.
            if (cb != null && cb != deferred) cb.accept(ret);
            if (!more) return;
        }
    }

    static synchronized JSObject toJson(Context context) {
        return toJson(context, true);
    }

    /** Состояние после своей записи — без чтения с устройства. */
    static synchronized JSObject toJsonAfterWrite(Context context) {
        return toJson(context.getApplicationContext(), false);
    }

    private static JSObject toJson(Context context, boolean syncFromDevice) {
        Context app = context.getApplicationContext();
        if (isLikelyOnyxDevice() && available && syncFromDevice) {
            syncBrightnessFromDevice(app);
            if (warmthAvailable) syncWarmthFromDevice(app);
        }
        JSObject o = new JSObject();
        o.put("brightness", brightness.normalized());
        o.put("warmth", warmthAvailable ? warmth.normalized() : 0.5f);
        o.put("brightnessIndex", brightness.raw);
        o.put("warmthIndex", warmth.raw);
        o.put("brightnessSteps", brightness.steps());
        o.put("warmthSteps", warmth.steps());
        o.put("brightnessMax", brightness.max);
        o.put("warmthMax", warmth.max);
        o.put("brightnessRaw", brightness.raw);
        o.put("warmthRaw", warmth.raw);
        o.put("warmthSupported", warmthAvailable);
        o.put("writeViaSysfs", writeViaSysfs);
        o.put("mode", mode.name());
        o.put("detection", detection);
        o.put("status", status);
        o.put("writeMs", lastWriteMs);
        String trace = FrontLightSwipe.lastTrace();
        if (trace != null && !trace.isEmpty()) o.put("swipeTrace", trace);
        if (lastError != null && !lastError.isEmpty()) o.put("onyxError", lastError);
        return o;
    }

    private static void ensureInit(Context context) {
        if (probed) return;
        probed = true;
        applyHiddenApiExemptions();

        try {
            controllerClass = Class.forName("android.onyx.hardware.DeviceController");
        } catch (Throwable t) {
            controllerClass = null;
            lastError = "DeviceController missing: " + t.getMessage();
        }

        discoverSysfs();

        if (controllerClass != null) {
            hasSetLightValue = hasMethod("setLightValue", int.class, int.class)
                || hasMethod("setLightValues", int.class, int.class);
            hasSetCold = hasMethod("setColdLightDeviceValue", Context.class, int.class);
            hasSetWarm = hasMethod("setWarmLightDeviceValue", Context.class, int.class);
            hasSetFrontLight = hasMethod("setFrontLightValue", Context.class, int.class);
            hasOpenFrontLight = hasMethod("openFrontLight", int.class);
            hasCloseFrontLight = hasMethod("closeFrontLight", int.class);
            hasIsLightOn = hasMethod("isLightOn", Context.class, int.class)
                || hasMethod("isLightOn", int.class);

            boolean checkCtm = Boolean.TRUE.equals(invoke("checkCTM"));
            boolean hasFl = Boolean.TRUE.equals(invoke("hasFLBrightness", context));
            boolean hasCtmBrightness = Boolean.TRUE.equals(invoke("hasCTMBrightness", context));
            int maxTemp = probeMax(LIGHT_TYPE_TEMP);
            int maxWarm = probeMax(LIGHT_TYPE_CTM_WARM);
            int maxCtmBr = probeMax(LIGHT_TYPE_CTM_BR);
            int maxCold = probeMax(LIGHT_TYPE_CTM_COLD);
            int maxFl = probeMax(LIGHT_TYPE_FL);

            detection = "checkCTM=" + checkCtm
                + " hasFL=" + hasFl
                + " hasCTM=" + hasCtmBrightness
                + " maxTemp=" + maxTemp
                + " maxCtmBr=" + maxCtmBr
                + " maxWarm=" + maxWarm
                + " maxCold=" + maxCold
                + " maxFl=" + maxFl
                + " setLight=" + hasSetLightValue
                + " setCold=" + hasSetCold;

            // Порядок как в KOReader BrightnessDetector — НЕ ставить hasCTM раньше checkCTM.
            if ((checkCtm || maxTemp > 0) && hasSetLightValue) {
                mode = Mode.CTM;
                brightness.max = maxCtmBr > 0 ? maxCtmBr : (maxTemp > 0 ? maxTemp : 255);
                warmth.max = maxTemp > 0 ? maxTemp : brightness.max;
                warmthAvailable = warmth.max > 0;
                available = true;
            } else if (hasFl && (hasSetLightValue || hasSetFrontLight)) {
                mode = Mode.FL;
                brightness.max = maxFl > 0 ? maxFl : 255;
                warmthAvailable = false;
                available = true;
            } else if ((hasCtmBrightness || maxWarm > 0) && (hasSetCold || hasSetLightValue)) {
                mode = Mode.WARM_AND_COLD;
                brightness.max = maxCold > 0 ? maxCold : 255;
                warmth.max = maxWarm > 0 ? maxWarm : brightness.max;
                warmthAvailable = warmth.max > 0;
                available = true;
            } else if (hasSetLightValue && (maxCtmBr > 0 || maxTemp > 0)) {
                mode = Mode.CTM;
                brightness.max = maxCtmBr > 0 ? maxCtmBr : 255;
                warmth.max = maxTemp > 0 ? maxTemp : 0;
                warmthAvailable = warmth.max > 0;
                available = true;
            }
        }

        if (!available && sysfsBrightnessPath != null) {
            mode = Mode.SYSFS;
            brightness.max = readSysfsMax(sysfsBrightnessPath, 255);
            if (sysfsWarmthPath != null) {
                warmth.max = readSysfsMax(sysfsWarmthPath, 32);
                warmthAvailable = warmth.max > 0;
            }
            available = true;
            detection = (detection.isEmpty() ? "" : detection + " ") + "sysfs=" + sysfsBrightnessPath;
        }

        // sysfs не поднимает системную шкалу яркости BOOX — предпочитаем для записи
        writeViaSysfs = sysfsBrightnessPath != null;
        sysfsBrightnessConfirmed = false;
        sysfsWarmthConfirmed = false;
        if (writeViaSysfs) {
            int sysMax = readSysfsMax(sysfsBrightnessPath, -1);
            if (sysMax > 0) brightness.max = sysMax;
            if (sysfsWarmthPath != null) {
                int wMax = readSysfsMax(sysfsWarmthPath, -1);
                if (wMax > 0) {
                    warmth.max = wMax;
                    warmthAvailable = true;
                }
            }
            detection = (detection.isEmpty() ? "" : detection + " ") + "write=sysfs";
        } else {
            detection = (detection.isEmpty() ? "" : detection + " ") + "write=device";
        }

        if (available) {
            syncBrightnessFromDevice(context);
            if (warmthAvailable) syncWarmthFromDevice(context);
            lastWrittenBrightness = brightness.raw;
            lastWrittenWarmth = warmth.raw;
            status = "ready mode=" + mode
                + " br=" + brightness.raw + "/" + brightness.max
                + " warm=" + warmth.raw + "/" + warmth.max
                + " " + detection;
            Log.i(TAG, status);
        } else {
            if (lastError.isEmpty()) lastError = "no Onyx light API";
            status = "unavailable: " + lastError + " " + detection;
            Log.w(TAG, status);
        }
    }

    private static void syncBrightnessFromDevice(Context context) {
        Integer v = readBrightnessRaw(context);
        if (v != null) brightness.setRaw(v);
    }

    private static void syncWarmthFromDevice(Context context) {
        Integer v = readWarmthRaw(context);
        if (v != null) warmth.setRaw(v);
    }

    private static Integer readBrightnessRaw(Context context) {
        switch (mode) {
            case CTM:
                return readLightRaw(LIGHT_TYPE_CTM_BR);
            case FL:
                Integer fl = readLightRaw(LIGHT_TYPE_FL);
                if (fl != null) return fl;
                return intOrNull(invoke("getFrontLightValue", context));
            case WARM_AND_COLD: {
                Integer fromLight = readLightRaw(LIGHT_TYPE_CTM_COLD);
                if (fromLight != null) return fromLight;
                return intOrNull(invoke("getBrightnessConfig", context, LIGHT_TYPE_CTM_COLD));
            }
            case SYSFS:
                if (sysfsBrightnessPath != null) {
                    int v = readSysfs(sysfsBrightnessPath);
                    return v >= 0 ? v : null;
                }
                break;
            default:
                break;
        }
        return null;
    }

    private static Integer readWarmthRaw(Context context) {
        switch (mode) {
            case CTM:
                return readLightRaw(LIGHT_TYPE_TEMP);
            case WARM_AND_COLD: {
                Integer fromLight = readLightRaw(LIGHT_TYPE_CTM_WARM);
                if (fromLight != null) return fromLight;
                return intOrNull(invoke("getBrightnessConfig", context, LIGHT_TYPE_CTM_WARM));
            }
            case SYSFS:
                if (sysfsWarmthPath != null) {
                    int v = readSysfs(sysfsWarmthPath);
                    return v >= 0 ? v : null;
                }
                break;
            default:
                break;
        }
        return null;
    }

    private static Integer readLightRaw(int type) {
        Object r = invoke("getLightValue", type);
        if (r == null) r = invoke("getLightValues", type);
        return intOrNull(r);
    }

    private static boolean writeBrightness(Context context) {
        int v = brightness.raw;
        if (v == lastWrittenBrightness) return true;
        long startedAt = SystemClock.uptimeMillis();
        boolean ok = false;
        // sysfs первым: DeviceController.setLightValue на BOOX показывает системную шкалу.
        // Если SELinux запрещает запись (untrusted_app → sysfs), путь бросаем сразу:
        // иначе каждый шаг жеста тратится на заведомо неудачный open и avc-денай в логе.
        if (sysfsBrightnessPath != null) {
            ok = writeSysfsQuiet(sysfsBrightnessPath, v);
            if (ok) {
                sysfsBrightnessConfirmed = true;
                writeViaSysfs = true;
            } else if (mode != Mode.SYSFS) {
                sysfsBrightnessPath = null;
            }
        }
        // После подтверждённого sysfs не падаем в DeviceController (оверлей + touchcancel).
        if (!ok && !sysfsBrightnessConfirmed) {
            switch (mode) {
                case CTM:
                    ok = setLight(context, LIGHT_TYPE_CTM_BR, v);
                    break;
                case FL:
                    ok = setLight(context, LIGHT_TYPE_FL, v);
                    if (!ok && hasSetFrontLight) ok = invokeSucceeds("setFrontLightValue", context, v);
                    break;
                case WARM_AND_COLD:
                    if (hasSetCold) ok = invokeSucceeds("setColdLightDeviceValue", context, v);
                    if (!ok) ok = setLight(context, LIGHT_TYPE_CTM_COLD, v);
                    break;
                case SYSFS:
                    ok = writeSysfsQuiet(sysfsBrightnessPath, v);
                    break;
                default:
                    break;
            }
        }
        if (ok) lastWrittenBrightness = v;
        lastWriteMs = SystemClock.uptimeMillis() - startedAt;
        status = "setBr mode=" + mode
            + (sysfsBrightnessConfirmed ? "+sysfs" : "")
            + " v=" + v + "/" + brightness.max + " ok=" + ok;
        if (!ok && lastError.isEmpty()) lastError = status;
        return ok;
    }

    private static boolean writeWarmth(Context context) {
        if (!warmthAvailable) return false;
        int v = warmth.raw;
        if (v == lastWrittenWarmth) return true;
        long startedAt = SystemClock.uptimeMillis();
        boolean ok = false;
        if (sysfsWarmthPath != null) {
            ok = writeSysfsQuiet(sysfsWarmthPath, v);
            if (ok) {
                sysfsWarmthConfirmed = true;
                writeViaSysfs = true;
            } else if (mode != Mode.SYSFS) {
                sysfsWarmthPath = null;
            }
        }
        if (!ok && !sysfsWarmthConfirmed) {
            switch (mode) {
                case CTM:
                    // TEMP не гасит панель (KOReader FrontLightSwitch.shouldCloseOnZero = false)
                    ok = setLightValueOnly(LIGHT_TYPE_TEMP, v);
                    break;
                case WARM_AND_COLD:
                    if (hasSetWarm) ok = invokeSucceeds("setWarmLightDeviceValue", context, v);
                    if (!ok) ok = setLight(context, LIGHT_TYPE_CTM_WARM, v);
                    break;
                case SYSFS:
                    ok = writeSysfsQuiet(sysfsWarmthPath, v);
                    break;
                default:
                    break;
            }
        }
        if (ok) lastWrittenWarmth = v;
        lastWriteMs = SystemClock.uptimeMillis() - startedAt;
        status = "setWarm mode=" + mode
            + (sysfsWarmthConfirmed ? "+sysfs" : "")
            + " v=" + v + "/" + warmth.max + " ok=" + ok;
        return ok;
    }

    /** KOReader OnyxDevice.setLight: open/close channel + setLightValue. */
    private static boolean setLight(Context context, int type, int value) {
        int channel = channelFor(type);
        if (value == 0) {
            if (shouldCloseOnZero(type) && hasCloseFrontLight) {
                invokeSucceeds("closeFrontLight", channel);
            }
            return setLightValueOnly(type, 0);
        }
        ensureLightOn(context, channel);
        return setLightValueOnly(type, value);
    }

    private static boolean setLightValueOnly(int type, int value) {
        if (!hasSetLightValue) return false;
        if (invokeSucceeds("setLightValue", type, value)) return true;
        return invokeSucceeds("setLightValues", type, value);
    }

    private static int channelFor(int lightType) {
        if (lightType == LIGHT_TYPE_CTM_BR || lightType == LIGHT_TYPE_TEMP) {
            return LIGHT_TYPE_CTM_ALL;
        }
        return lightType;
    }

    private static boolean shouldCloseOnZero(int lightType) {
        return lightType == LIGHT_TYPE_FL
            || lightType == LIGHT_TYPE_CTM_BR
            || lightType == LIGHT_TYPE_CTM_COLD
            || lightType == LIGHT_TYPE_CTM_WARM;
    }

    private static void ensureLightOn(Context context, int channel) {
        if (!hasOpenFrontLight) return;
        if (hasIsLightOn && isLightOn(context, channel)) return;
        invokeSucceeds("openFrontLight", channel);
    }

    private static boolean isLightOn(Context context, int channel) {
        Object r = invoke("isLightOn", context, channel);
        if (r == null) r = invoke("isLightOn", channel);
        return Boolean.TRUE.equals(r);
    }

    private static int probeMax(int type) {
        int m = intOrZero(invoke("getMaxLightValue", type));
        if (m <= 0) m = intOrZero(invoke("getMaxLightValues", type));
        return m;
    }

    private static void discoverSysfs() {
        for (String path : SYSFS_BRIGHTNESS) {
            if (new File(path).exists()) {
                sysfsBrightnessPath = path;
                break;
            }
        }
        for (String path : SYSFS_WARMTH) {
            if (new File(path).exists()) {
                sysfsWarmthPath = path;
                break;
            }
        }
    }

    private static int readSysfsMax(String path, int fallback) {
        try {
            File maxFile = new File(new File(path).getParentFile(), "max_brightness");
            if (maxFile.exists()) {
                int v = readSysfs(maxFile.getAbsolutePath());
                if (v > 0) return v;
            }
        } catch (Throwable ignored) { /* */ }
        return fallback;
    }

    private static boolean writeSysfsQuiet(String path, int value) {
        if (path == null) return false;
        try {
            writeSysfs(path, value);
            return true;
        } catch (Throwable t) {
            lastError = "sysfs: " + t.getMessage();
            return false;
        }
    }

    private static boolean hasMethod(String name, Class<?>... params) {
        if (controllerClass == null) return false;
        try {
            controllerClass.getMethod(name, params);
            return true;
        } catch (Throwable ignored) { /* */ }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                HiddenApiBypass.getDeclaredMethod(controllerClass, name, params);
                return true;
            } catch (Throwable ignored) { /* */ }
        }
        return false;
    }

    private static Object invoke(String name, Object... args) {
        if (controllerClass == null) return null;
        try {
            Object result;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                result = HiddenApiBypass.invoke(controllerClass, null, name, args);
            } else {
                Class<?>[] types = new Class<?>[args.length];
                for (int i = 0; i < args.length; i++) {
                    Object a = args[i];
                    if (a instanceof Integer) types[i] = int.class;
                    else if (a instanceof Boolean) types[i] = boolean.class;
                    else if (a instanceof Context) types[i] = Context.class;
                    else types[i] = a != null ? a.getClass() : Object.class;
                }
                result = controllerClass.getMethod(name, types).invoke(null, args);
            }
            return result;
        } catch (Throwable t) {
            Throwable cause = t.getCause() != null ? t.getCause() : t;
            lastError = name + ": " + cause.getMessage();
            return null;
        }
    }

    private static boolean invokeSucceeds(String name, Object... args) {
        if (controllerClass == null) return false;
        try {
            Object result;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                result = HiddenApiBypass.invoke(controllerClass, null, name, args);
            } else {
                result = invoke(name, args);
                if (result == null && lastError != null && lastError.startsWith(name + ":")) {
                    return false;
                }
            }
            if (result instanceof Boolean) return (Boolean) result;
            return true;
        } catch (Throwable t) {
            Throwable cause = t.getCause() != null ? t.getCause() : t;
            lastError = name + ": " + cause.getMessage();
            return false;
        }
    }

    private static int intOrZero(Object v) {
        if (v instanceof Number) return ((Number) v).intValue();
        return 0;
    }

    private static Integer intOrNull(Object v) {
        if (v instanceof Number) return ((Number) v).intValue();
        return null;
    }

    private static float clamp01(float v) {
        return Math.max(0f, Math.min(1f, v));
    }

    private static void writeSysfs(String path, int value) throws Exception {
        try (FileOutputStream out = new FileOutputStream(path)) {
            out.write(String.valueOf(value).getBytes(StandardCharsets.UTF_8));
        }
    }

    private static int readSysfs(String path) {
        try (RandomAccessFile raf = new RandomAccessFile(path, "r")) {
            String line = raf.readLine();
            if (line == null) return -1;
            return Integer.parseInt(line.trim());
        } catch (Throwable t) {
            return -1;
        }
    }
}
