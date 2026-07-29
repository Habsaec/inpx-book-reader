package ru.inpx.bookreader;

import android.os.Build;
import android.util.Log;
import android.view.View;

import org.lsposed.hiddenapibypass.HiddenApiBypass;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * Полная перерисовка EPD (GC16) на Onyx/BOOX без SDK JAR — через framework reflection
 * ({@code android.onyx.ViewUpdateHelper} / {@code View.invalidate(int)} / {@code View.repaintEverything}).
 */
final class OnyxEpdRefresh {
    private static final String TAG = "OnyxEpdRefresh";

    private static boolean probed;
    private static boolean supported;
    private static int gcMode = -1;
    private static Method invalidateInt;
    private static Method repaintEverything;
    private static Method epdInvalidate;
    private static Object epdGcEnum;
    private static String lastError = "";

    private OnyxEpdRefresh() {}

    static String lastError() {
        return lastError;
    }

    static synchronized boolean isSupported() {
        ensureInit();
        return supported;
    }

    /** Полный refresh (GC). Вызывать на UI-потоке. */
    static synchronized boolean fullRefresh(View view) {
        ensureInit();
        if (!supported) return false;
        lastError = "";
        try {
            if (repaintEverything != null && gcMode >= 0) {
                repaintEverything.invoke(null, gcMode);
                return true;
            }
            if (view != null && invalidateInt != null && gcMode >= 0) {
                invalidateInt.invoke(view, gcMode);
                return true;
            }
            if (view != null && epdInvalidate != null && epdGcEnum != null) {
                epdInvalidate.invoke(null, view, epdGcEnum);
                return true;
            }
            lastError = "no refresh method";
            return false;
        } catch (Throwable t) {
            lastError = t.getClass().getSimpleName() + ": " + t.getMessage();
            Log.w(TAG, "fullRefresh failed", t);
            return false;
        }
    }

    private static void ensureInit() {
        if (probed) return;
        probed = true;
        supported = false;
        if (!OnyxFrontLight.isLikelyOnyxDevice()) {
            lastError = "not onyx";
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    HiddenApiBypass.setHiddenApiExemptions("");
                } catch (Throwable ignored) {
                    HiddenApiBypass.addHiddenApiExemptions("L");
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "HiddenApiBypass", t);
        }

        try {
            Class<?> helper = Class.forName("android.onyx.ViewUpdateHelper");
            int regional = staticInt(helper, "EINK_AUTO_MODE_REGIONAL");
            int wait = staticInt(helper, "EINK_WAIT_MODE_WAIT");
            int gc16 = staticInt(helper, "EINK_WAVEFORM_MODE_GC16");
            int full = staticInt(helper, "EINK_UPDATE_MODE_FULL");
            if (regional >= 0 && wait >= 0 && gc16 >= 0 && full >= 0) {
                gcMode = regional | wait | gc16 | full;
            }
        } catch (Throwable t) {
            lastError = "ViewUpdateHelper: " + t.getMessage();
            Log.w(TAG, lastError, t);
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    repaintEverything = HiddenApiBypass.getDeclaredMethod(View.class, "repaintEverything", int.class);
                } catch (Throwable ignored) { /* */ }
                try {
                    invalidateInt = HiddenApiBypass.getDeclaredMethod(View.class, "invalidate", int.class);
                } catch (Throwable ignored) { /* */ }
            }
            if (repaintEverything == null) {
                try {
                    repaintEverything = View.class.getMethod("repaintEverything", int.class);
                } catch (Throwable ignored) { /* */ }
            }
            if (invalidateInt == null) {
                try {
                    invalidateInt = View.class.getMethod("invalidate", int.class);
                } catch (Throwable ignored) { /* */ }
            }
            if (repaintEverything != null) repaintEverything.setAccessible(true);
            if (invalidateInt != null) invalidateInt.setAccessible(true);
        } catch (Throwable t) {
            Log.w(TAG, "View methods", t);
        }

        if (gcMode < 0 || (repaintEverything == null && invalidateInt == null)) {
            tryLoadSdkEpdController();
        }

        supported = (gcMode >= 0 && (repaintEverything != null || invalidateInt != null))
            || (epdInvalidate != null && epdGcEnum != null);
        if (!supported && lastError.isEmpty()) {
            lastError = "epd api missing";
        }
        Log.i(TAG, "init supported=" + supported + " gcMode=" + gcMode
            + " repaint=" + (repaintEverything != null)
            + " invalidate=" + (invalidateInt != null)
            + " sdk=" + (epdInvalidate != null)
            + " err=" + lastError);
    }

    private static void tryLoadSdkEpdController() {
        String[] classNames = {
            "com.onyx.android.sdk.api.device.epd.EpdController",
            "com.onyx.android.sdk.device.EpdController",
        };
        for (String name : classNames) {
            try {
                Class<?> epd = Class.forName(name);
                Class<?> modeClass = null;
                for (Class<?> inner : epd.getDeclaredClasses()) {
                    if ("UpdateMode".equals(inner.getSimpleName())) {
                        modeClass = inner;
                        break;
                    }
                }
                if (modeClass == null) {
                    try {
                        modeClass = Class.forName(name + "$UpdateMode");
                    } catch (Throwable ignored) { /* */ }
                }
                if (modeClass == null || !modeClass.isEnum()) continue;
                Object gc = null;
                for (Object c : modeClass.getEnumConstants()) {
                    if ("GC".equals(String.valueOf(c))) {
                        gc = c;
                        break;
                    }
                }
                if (gc == null) continue;
                Method m = epd.getMethod("invalidate", View.class, modeClass);
                epdInvalidate = m;
                epdGcEnum = gc;
                lastError = "";
                return;
            } catch (Throwable ignored) { /* try next */ }
        }
    }

    private static int staticInt(Class<?> cls, String field) {
        try {
            Field f = cls.getField(field);
            return f.getInt(null);
        } catch (Throwable ignored) { /* */ }
        try {
            Field f = cls.getDeclaredField(field);
            f.setAccessible(true);
            return f.getInt(null);
        } catch (Throwable ignored) {
            return -1;
        }
    }
}
