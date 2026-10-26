package ru.inpx.bookreader;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;
import java.io.File;

/**
 * Read-aloud remote: the same buttons as the TTS media notification ({@link TtsForegroundService})
 * plus the reader's sleep timer. While read-aloud is off it shows the current book and its play
 * button opens that book with read-aloud started.
 */
public class TtsRemoteWidgetProvider extends AppWidgetProvider {
    private static final int ACCENT = 0xFFD4AC5C;
    private static final int ON_DARK = 0xFFF2EBE0;
    /** Below this width the sleep button is dropped so play / skip keep their size. */
    private static final int SLEEP_MIN_WIDTH_DP = 230;

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(
        Context context,
        AppWidgetManager appWidgetManager,
        int appWidgetId,
        Bundle newOptions
    ) {
        updateAppWidget(context, appWidgetManager, appWidgetId);
    }

    public static void refreshAll(Context context) {
        ContinueReadingWidgetProvider.refreshProvider(context, TtsRemoteWidgetProvider.class);
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        TtsMediaState.Snapshot snap = TtsMediaState.snapshot();
        SharedPreferences prefs = context.getSharedPreferences(
            ContinueReadingWidgetProvider.PREFS_NAME,
            Context.MODE_PRIVATE
        );
        String bookId = prefs.getString(ContinueReadingWidgetProvider.KEY_BOOK_ID, "");
        String bookTitle = prefs.getString(ContinueReadingWidgetProvider.KEY_TITLE, "");
        String bookAuthor = prefs.getString(ContinueReadingWidgetProvider.KEY_AUTHOR, "");
        String coverPath = prefs.getString(ContinueReadingWidgetProvider.KEY_COVER_PATH, "");

        float density = context.getResources().getDisplayMetrics().density;
        int[] size = ContinueReadingWidgetProvider.portraitSizePx(context, appWidgetManager, appWidgetId);
        boolean wide = ContinueReadingWidgetProvider.isWide(size);
        RemoteViews views = new RemoteViews(
            context.getPackageName(),
            wide ? R.layout.widget_tts_remote_wide : R.layout.widget_tts_remote
        );

        boolean active = snap.active;
        String title = active && !snap.title.isEmpty() ? snap.title : bookTitle;
        String author = active ? snap.artist : bookAuthor;
        boolean empty = title == null || title.trim().isEmpty();

        // The reader's cover (sent with the media session) or the current book's cached one.
        File coverFile = ContinueReadingWidgetProvider.findCoverFile(context, bookId, coverPath, !wide);
        if (active && snap.cover != null && !snap.cover.isRecycled()) {
            bindLiveCover(views, snap.cover, size, wide);
        } else {
            ContinueReadingWidgetProvider.bindCover(views, coverFile, size, wide);
        }

        views.setTextViewText(R.id.widget_title, empty ? context.getString(R.string.widget_continue_empty) : title);
        views.setTextViewText(R.id.widget_author, author != null ? author : "");
        views.setViewVisibility(R.id.widget_author, author == null || author.isEmpty() ? View.GONE : View.VISIBLE);
        views.setTextViewText(
            R.id.widget_tts_status,
            context.getString(
                !active ? R.string.widget_tts_idle
                    : snap.playing ? R.string.widget_tts_playing
                    : R.string.widget_tts_paused
            )
        );

        int controls = active ? View.VISIBLE : View.GONE;
        views.setViewVisibility(R.id.widget_tts_prev, controls);
        views.setViewVisibility(R.id.widget_tts_next, controls);
        views.setViewVisibility(R.id.widget_tts_stop, controls);
        int widthDp = Math.round(size[0] / density);
        views.setViewVisibility(
            R.id.widget_tts_sleep,
            active && widthDp >= SLEEP_MIN_WIDTH_DP ? View.VISIBLE : View.GONE
        );
        views.setViewVisibility(R.id.widget_tts_play, empty && !active ? View.GONE : View.VISIBLE);

        boolean showPause = active && snap.playing;
        views.setImageViewResource(R.id.widget_tts_play, showPause ? R.drawable.widget_ic_pause : R.drawable.widget_ic_play);
        views.setContentDescription(
            R.id.widget_tts_play,
            context.getString(showPause ? R.string.widget_tts_pause : R.string.widget_tts_play)
        );

        bindSleep(views, active ? snap.sleepEndsAt : 0L);
        ContinueReadingWidgetProvider.bindLibrary(context, views, !wide);

        if (active) {
            views.setOnClickPendingIntent(R.id.widget_tts_play, serviceIntent(context, showPause
                ? TtsForegroundService.ACTION_PAUSE : TtsForegroundService.ACTION_PLAY, 1));
            views.setOnClickPendingIntent(R.id.widget_tts_prev, serviceIntent(context, TtsForegroundService.ACTION_PREV, 2));
            views.setOnClickPendingIntent(R.id.widget_tts_next, serviceIntent(context, TtsForegroundService.ACTION_NEXT, 3));
            views.setOnClickPendingIntent(R.id.widget_tts_sleep, serviceIntent(context, TtsForegroundService.ACTION_SLEEP, 4));
            views.setOnClickPendingIntent(R.id.widget_tts_stop, serviceIntent(context, TtsForegroundService.ACTION_STOP, 5));
            views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context, appWidgetId));
        } else {
            views.setOnClickPendingIntent(
                R.id.widget_tts_play,
                ContinueReadingWidgetProvider.continueIntent(context, bookId, appWidgetId * 4 + 1, true)
            );
            views.setOnClickPendingIntent(
                R.id.widget_root,
                ContinueReadingWidgetProvider.continueIntent(context, bookId, appWidgetId * 4 + 2, false)
            );
        }
        if (Build.VERSION.SDK_INT >= 31) {
            views.setBoolean(R.id.widget_root, "setClipToOutline", true);
        }
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    /** The bitmap the reader sent for the media notification; cropped / blurred like a cached cover. */
    static void bindLiveCover(RemoteViews views, Bitmap cover, int[] size, boolean wide) {
        if (wide) {
            Bitmap small = scaleDown(cover, 256);
            views.setImageViewBitmap(R.id.widget_backdrop, ContinueReadingWidgetProvider.widgetBackdrop(small, size[0], size[1]));
            views.setImageViewBitmap(R.id.widget_cover, small);
        } else {
            views.setImageViewBitmap(R.id.widget_cover, ContinueReadingWidgetProvider.coverFill(cover, size[0], size[1], 420));
        }
    }

    static Bitmap scaleDown(Bitmap src, int maxSide) {
        int largest = Math.max(src.getWidth(), src.getHeight());
        if (largest <= maxSide) return src;
        float k = maxSide / (float) largest;
        return Bitmap.createScaledBitmap(src, Math.max(1, Math.round(src.getWidth() * k)), Math.max(1, Math.round(src.getHeight() * k)), true);
    }

    /** Sleep timer: a moon in the accent colour and a live countdown (the launcher ticks it, no updates). */
    static void bindSleep(RemoteViews views, long endsAt) {
        long left = endsAt - System.currentTimeMillis();
        boolean on = endsAt > 0 && left > 0;
        views.setInt(R.id.widget_tts_sleep, "setColorFilter", on ? ACCENT : ON_DARK);
        views.setViewVisibility(R.id.widget_tts_sleep_icon, on ? View.VISIBLE : View.GONE);
        views.setInt(R.id.widget_tts_sleep_icon, "setColorFilter", ACCENT);
        // Count-down chronometers exist from API 24; older launchers just get the moon.
        boolean countdown = on && Build.VERSION.SDK_INT >= 24;
        views.setViewVisibility(R.id.widget_tts_sleep_left, countdown ? View.VISIBLE : View.GONE);
        if (countdown) {
            views.setChronometer(R.id.widget_tts_sleep_left, SystemClock.elapsedRealtime() + left, null, true);
            views.setChronometerCountDown(R.id.widget_tts_sleep_left, true);
        } else {
            views.setChronometer(R.id.widget_tts_sleep_left, SystemClock.elapsedRealtime(), null, false);
        }
    }

    static PendingIntent serviceIntent(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, TtsForegroundService.class);
        intent.setAction(action);
        // Own request codes: the media notification uses 1–4 for its actions on the same service.
        return PendingIntent.getService(
            context,
            100 + requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    static PendingIntent openAppIntent(Context context, int requestCode) {
        Intent launch = new Intent(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(
            context,
            10_000 + requestCode,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
