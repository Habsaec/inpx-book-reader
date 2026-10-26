package ru.inpx.bookreader;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;

/**
 * Shared TTS Now Playing state between {@link ReaderNativePlugin} and
 * {@link TtsForegroundService} (avoids large cover payloads in Intent extras).
 * Every change re-renders the read-aloud remote widget ({@link TtsRemoteWidgetProvider}).
 */
final class TtsMediaState {

    private static final Object LOCK = new Object();
    private static final long WIDGET_REFRESH_DELAY_MS = 250;
    private static String title = "";
    private static String artist = "";
    private static boolean playing;
    private static boolean active;
    private static Bitmap cover;
    private static String coverKey = "";
    /** Wall-clock end of the reader's sleep timer; 0 = off. */
    private static long sleepEndsAt;
    private static Context appContext;
    private static Handler mainHandler;
    private static final Runnable REFRESH_WIDGET = () -> {
        Context ctx = appContext;
        if (ctx != null) TtsRemoteWidgetProvider.refreshAll(ctx);
    };

    private TtsMediaState() {}

    static void attach(Context context) {
        synchronized (LOCK) {
            if (appContext == null && context != null) appContext = context.getApplicationContext();
        }
    }

    static void update(String newTitle, String newArtist, boolean newPlaying, boolean newActive) {
        boolean changed;
        synchronized (LOCK) {
            String t = newTitle != null ? newTitle : "";
            String a = newArtist != null ? newArtist : "";
            changed = !t.equals(title) || !a.equals(artist) || playing != newPlaying || active != newActive;
            title = t;
            artist = a;
            playing = newPlaying;
            active = newActive;
            if (!newActive) {
                cover = null;
                coverKey = "";
                sleepEndsAt = 0;
            }
        }
        if (changed) scheduleWidgetRefresh();
    }

    static void setCover(Bitmap bitmap, String key) {
        synchronized (LOCK) {
            if (!active) {
                cover = null;
                coverKey = "";
                return;
            }
            if (key != null && key.equals(coverKey) && cover != null) {
                return;
            }
            cover = bitmap;
            coverKey = key != null ? key : "";
        }
        scheduleWidgetRefresh();
    }

    static void setSleepEndsAt(long endsAt) {
        long value = Math.max(0, endsAt);
        synchronized (LOCK) {
            // Re-armed while the phone moves: small shifts are not worth a widget redraw.
            if (Math.abs(value - sleepEndsAt) < 1000 && (value == 0) == (sleepEndsAt == 0)) return;
            sleepEndsAt = value;
        }
        scheduleWidgetRefresh();
    }

    static Snapshot snapshot() {
        synchronized (LOCK) {
            return new Snapshot(title, artist, playing, active, cover, sleepEndsAt);
        }
    }

    private static void scheduleWidgetRefresh() {
        if (appContext == null) return;
        synchronized (LOCK) {
            if (mainHandler == null) mainHandler = new Handler(Looper.getMainLooper());
        }
        mainHandler.removeCallbacks(REFRESH_WIDGET);
        mainHandler.postDelayed(REFRESH_WIDGET, WIDGET_REFRESH_DELAY_MS);
    }

    static final class Snapshot {
        final String title;
        final String artist;
        final boolean playing;
        final boolean active;
        final Bitmap cover;
        final long sleepEndsAt;

        Snapshot(String title, String artist, boolean playing, boolean active, Bitmap cover, long sleepEndsAt) {
            this.title = title;
            this.artist = artist;
            this.playing = playing;
            this.active = active;
            this.cover = cover;
            this.sleepEndsAt = sleepEndsAt;
        }
    }
}
