package ru.inpx.bookreader;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Crash-loop exit for the «Домашний экран» mode. A home screen that dies on every start leaves the
 * device without a launcher: {@link MainActivity} counts its starts until the web app reports ready,
 * and after {@link #LIMIT} starts in a row that never got there {@link LauncherHomeActivity} opens
 * another home screen (BOOX's) instead of the reader.
 */
final class LauncherBootGuard {

    private static final String PREFS = "inpx_launcher_boot";
    private static final String KEY_COUNT = "starts";
    private static final String KEY_AT = "at";
    private static final int LIMIT = 3;
    /** Starts further apart than this are unrelated (a kill in the background, a reboot next day). */
    private static final long WINDOW_MS = 5 * 60 * 1000L;

    private LauncherBootGuard() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** MainActivity is being created. Written synchronously: the crash may come right after. */
    static void onStart(Context ctx) {
        try {
            SharedPreferences p = prefs(ctx);
            long now = System.currentTimeMillis();
            long at = p.getLong(KEY_AT, 0);
            int count = Math.abs(now - at) > WINDOW_MS ? 0 : p.getInt(KEY_COUNT, 0);
            p.edit().putInt(KEY_COUNT, count + 1).putLong(KEY_AT, now).commit();
        } catch (RuntimeException ignored) {
            // the guard must never be the reason of a failed start
        }
    }

    /** The web app drew its first screen. */
    static void onReady(Context ctx) {
        try {
            SharedPreferences p = prefs(ctx);
            if (p.getInt(KEY_COUNT, 0) != 0) p.edit().putInt(KEY_COUNT, 0).apply();
        } catch (RuntimeException ignored) {
            // see onStart
        }
    }

    /** True once after LIMIT failed starts in a row; the count starts over, so the next «Домой» tries the reader again. */
    static boolean tripped(Context ctx) {
        try {
            SharedPreferences p = prefs(ctx);
            if (p.getInt(KEY_COUNT, 0) < LIMIT) return false;
            if (Math.abs(System.currentTimeMillis() - p.getLong(KEY_AT, 0)) > WINDOW_MS) return false;
            p.edit().putInt(KEY_COUNT, 0).commit();
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }
}
