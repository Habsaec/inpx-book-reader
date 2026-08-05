package ru.inpx.bookreader;

import android.graphics.Bitmap;

/**
 * Shared TTS Now Playing state between {@link ReaderNativePlugin} and
 * {@link TtsForegroundService} (avoids large cover payloads in Intent extras).
 */
final class TtsMediaState {

    private static final Object LOCK = new Object();
    private static String title = "";
    private static String artist = "";
    private static boolean playing;
    private static boolean active;
    private static Bitmap cover;
    private static String coverKey = "";

    private TtsMediaState() {}

    static void update(String newTitle, String newArtist, boolean newPlaying, boolean newActive) {
        synchronized (LOCK) {
            title = newTitle != null ? newTitle : "";
            artist = newArtist != null ? newArtist : "";
            playing = newPlaying;
            active = newActive;
            if (!newActive) {
                cover = null;
                coverKey = "";
            }
        }
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
    }

    static Snapshot snapshot() {
        synchronized (LOCK) {
            return new Snapshot(title, artist, playing, active, cover);
        }
    }

    static final class Snapshot {
        final String title;
        final String artist;
        final boolean playing;
        final boolean active;
        final Bitmap cover;

        Snapshot(String title, String artist, boolean playing, boolean active, Bitmap cover) {
            this.title = title;
            this.artist = artist;
            this.playing = playing;
            this.active = active;
            this.cover = cover;
        }
    }
}
