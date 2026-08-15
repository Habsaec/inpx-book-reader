package ru.inpx.bookreader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

public class TtsForegroundService extends Service {

    public static final String CHANNEL_ID = "inpx_reader_tts";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_REFRESH = "ru.inpx.bookreader.tts.REFRESH";
    public static final String ACTION_PLAY = "ru.inpx.bookreader.tts.PLAY";
    public static final String ACTION_PAUSE = "ru.inpx.bookreader.tts.PAUSE";
    public static final String ACTION_STOP = "ru.inpx.bookreader.tts.STOP";
    public static final String ACTION_PREV = "ru.inpx.bookreader.tts.PREV";
    public static final String ACTION_NEXT = "ru.inpx.bookreader.tts.NEXT";

    private PowerManager.WakeLock wakeLock;
    private MediaSessionCompat mediaSession;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "inpx:reader-tts");
            wakeLock.setReferenceCounted(false);
        }
        mediaSession = new MediaSessionCompat(this, "inpx-reader-tts");
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                handleAction(ACTION_PLAY);
            }

            @Override
            public void onPause() {
                handleAction(ACTION_PAUSE);
            }

            @Override
            public void onStop() {
                handleAction(ACTION_STOP);
            }

            @Override
            public void onSkipToPrevious() {
                handleAction(ACTION_PREV);
            }

            @Override
            public void onSkipToNext() {
                handleAction(ACTION_NEXT);
            }
        });
        mediaSession.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Sticky restart with null Intent would force a zombie Now Playing + wakelock.
        if (intent == null) {
            releaseWakeLock();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_PLAY.equals(action)
            || ACTION_PAUSE.equals(action)
            || ACTION_STOP.equals(action)
            || ACTION_PREV.equals(action)
            || ACTION_NEXT.equals(action)) {
            handleAction(action);
            return START_NOT_STICKY;
        }

        TtsMediaState.Snapshot snap = TtsMediaState.snapshot();
        // Cover refresh after stop must not resurrect Now Playing.
        // speak() may start the service before JS marks media active — keep placeholder
        // when the playback session is already live to avoid FGS without startForeground.
        if (!snap.active && ACTION_REFRESH.equals(action)
            && !TtsPlaybackManager.getInstance(this).isSessionActive()) {
            releaseWakeLock();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        // speak() may start the service before JS pushes metadata — keep a placeholder.
        if (!snap.active) {
            TtsMediaState.update(
                snap.title.isEmpty() ? "Озвучка" : snap.title,
                snap.artist,
                true,
                true
            );
            snap = TtsMediaState.snapshot();
        }

        acquireWakeLock();
        publishSessionAndNotification(snap);
        return START_NOT_STICKY;
    }

    private void handleAction(String action) {
        TtsMediaState.Snapshot before = TtsMediaState.snapshot();
        if (ACTION_PLAY.equals(action)) {
            TtsPlaybackManager.getInstance(this).resume();
            TtsMediaState.update(before.title, before.artist, true, true);
            ReaderNativePlugin.emitTtsMediaAction("play");
        } else if (ACTION_PAUSE.equals(action)) {
            TtsPlaybackManager.getInstance(this).pause();
            TtsMediaState.update(before.title, before.artist, false, true);
            ReaderNativePlugin.emitTtsMediaAction("pause");
        } else if (ACTION_STOP.equals(action)) {
            TtsPlaybackManager.getInstance(this).stop();
            TtsMediaState.update("", "", false, false);
            ReaderNativePlugin.emitTtsMediaAction("stop");
            stopForeground(true);
            stopSelf();
            return;
        } else if (ACTION_PREV.equals(action)) {
            ReaderNativePlugin.emitTtsMediaAction("prev");
        } else if (ACTION_NEXT.equals(action)) {
            ReaderNativePlugin.emitTtsMediaAction("next");
        }

        TtsMediaState.Snapshot snap = TtsMediaState.snapshot();
        if (snap.active) {
            publishSessionAndNotification(snap);
        }
    }

    private void publishSessionAndNotification(TtsMediaState.Snapshot snap) {
        if (mediaSession == null) return;

        String title = snap.title != null && !snap.title.isEmpty() ? snap.title : "Озвучка";
        String artist = snap.artist != null ? snap.artist : "";
        Bitmap cover = snap.cover;

        // duration = -1 → unknown/live: SystemUI should not enable a real seek timeline.
        // (Some skins still draw an empty --:-- row; that chrome is not app-customizable.)
        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, artist)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, -1L);
        if (cover != null && !cover.isRecycled()) {
            meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, cover);
            meta.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, cover);
        }
        mediaSession.setMetadata(meta.build());

        // No ACTION_SEEK_TO — TTS has no timeline to scrub.
        long actions = PlaybackStateCompat.ACTION_PLAY
            | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_STOP
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT;
        int state = snap.playing
            ? PlaybackStateCompat.STATE_PLAYING
            : PlaybackStateCompat.STATE_PAUSED;
        mediaSession.setPlaybackState(
            new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build()
        );
        mediaSession.setActive(true);

        Intent launch = new Intent(this, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(
            this,
            0,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(artist.isEmpty() ? "Чтение книги" : artist)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(contentPi)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setStyle(
                new MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1)
            );

        if (cover != null && !cover.isRecycled()) {
            builder.setLargeIcon(cover);
        }

        if (snap.playing) {
            builder.addAction(
                android.R.drawable.ic_media_pause,
                "Пауза",
                actionPendingIntent(ACTION_PAUSE, 1)
            );
        } else {
            builder.addAction(
                android.R.drawable.ic_media_play,
                "Играть",
                actionPendingIntent(ACTION_PLAY, 2)
            );
        }
        builder.addAction(
            android.R.drawable.ic_media_next,
            "Далее",
            actionPendingIntent(ACTION_NEXT, 3)
        );
        builder.addAction(
            android.R.drawable.ic_menu_close_clear_cancel,
            "Стоп",
            actionPendingIntent(ACTION_STOP, 4)
        );

        Notification notification = builder.build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private PendingIntent actionPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, TtsForegroundService.class);
        intent.setAction(action);
        return PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void acquireWakeLock() {
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(4L * 60L * 60L * 1000L);
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Озвучка книги",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Фоновое чтение вслух");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }
}
