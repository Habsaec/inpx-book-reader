package ru.inpx.bookreader;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** «Новое у любимых»: covers of new books by favorite authors and series; a tap opens the book's page. */
public class FollowingWidgetProvider extends AppWidgetProvider {
    public static final String PREFS_NAME = "inpx_following_widget";
    public static final String KEY_BOOKS = "books";
    static final int MAX_BOOKS = 8;
    private static final int COLS = 4;
    private static final int COVER_MAX_PX = 300;
    /** Layout constants (dp) of widget_following.xml used to size the grid. */
    private static final int PAD_H_DP = 28;
    private static final int CHROME_V_DP = 56;
    private static final int GAP_DP = 10;
    private static final int ROW_GAP_DP = 12;
    private static final int CAPTION_DP = 52;
    private static final int MIN_COVER_DP = 40;

    private static final int[] SLOTS = {
        R.id.widget_following_slot_0, R.id.widget_following_slot_1, R.id.widget_following_slot_2,
        R.id.widget_following_slot_3, R.id.widget_following_slot_4, R.id.widget_following_slot_5,
        R.id.widget_following_slot_6, R.id.widget_following_slot_7,
    };
    private static final int[] COVERS = {
        R.id.widget_following_cover_0, R.id.widget_following_cover_1, R.id.widget_following_cover_2,
        R.id.widget_following_cover_3, R.id.widget_following_cover_4, R.id.widget_following_cover_5,
        R.id.widget_following_cover_6, R.id.widget_following_cover_7,
    };
    private static final int[] TITLES = {
        R.id.widget_following_title_0, R.id.widget_following_title_1, R.id.widget_following_title_2,
        R.id.widget_following_title_3, R.id.widget_following_title_4, R.id.widget_following_title_5,
        R.id.widget_following_title_6, R.id.widget_following_title_7,
    };
    private static final int[] AUTHORS = {
        R.id.widget_following_author_0, R.id.widget_following_author_1, R.id.widget_following_author_2,
        R.id.widget_following_author_3, R.id.widget_following_author_4, R.id.widget_following_author_5,
        R.id.widget_following_author_6, R.id.widget_following_author_7,
    };

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
        ContinueReadingWidgetProvider.refreshProvider(context, FollowingWidgetProvider.class);
    }

    static JSONArray readBooks(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        try {
            return new JSONArray(prefs.getString(KEY_BOOKS, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_following);
        JSONArray books = readBooks(context);
        int count = Math.min(MAX_BOOKS, books.length());

        float density = context.getResources().getDisplayMetrics().density;
        int[] size = ContinueReadingWidgetProvider.portraitSizePx(context, appWidgetManager, appWidgetId);
        int widthDp = Math.round(size[0] / density);
        int heightDp = Math.round(size[1] / density);
        int[] grid = chooseGrid(count, widthDp, heightDp);
        int rows = grid[0];
        int cols = grid[1];

        views.setViewVisibility(R.id.widget_following_empty, count == 0 ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_following_grid, count == 0 ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_following_row_1, rows > 1 ? View.VISIBLE : View.GONE);

        float radius = 5f * density;
        Bitmap first = null;
        for (int i = 0; i < MAX_BOOKS; i++) {
            int col = i % COLS;
            int row = i / COLS;
            if (col >= cols || row >= rows) {
                views.setViewVisibility(SLOTS[i], View.GONE);
                continue;
            }
            int index = row * cols + col;
            JSONObject book = index < count ? books.optJSONObject(index) : null;
            if (book == null) {
                // Last row not full: keep the cell so its covers match the row above.
                views.setViewVisibility(SLOTS[i], View.INVISIBLE);
                continue;
            }
            String bookId = book.optString("bookId", "");
            views.setViewVisibility(SLOTS[i], View.VISIBLE);
            Bitmap cover = ContinueReadingWidgetProvider.decodeCover(
                ContinueReadingWidgetProvider.findCoverFile(context, bookId, book.optString("coverPath", "")),
                COVER_MAX_PX
            );
            if (cover != null) {
                if (first == null) first = cover;
                // Same 2:3 frame for every cover, so the row reads as one shelf.
                Bitmap framed = ContinueReadingWidgetProvider.coverFill(cover, 2, 3, COVER_MAX_PX);
                views.setImageViewBitmap(COVERS[i], ContinueReadingWidgetProvider.roundedCover(framed, radius));
            } else {
                views.setImageViewResource(COVERS[i], R.drawable.widget_cover_placeholder);
            }
            String title = book.optString("title", "");
            String author = book.optString("author", "");
            views.setTextViewText(TITLES[i], title);
            views.setTextViewText(AUTHORS[i], author);
            views.setViewVisibility(AUTHORS[i], author.isEmpty() ? View.INVISIBLE : View.VISIBLE);
            views.setContentDescription(COVERS[i], author.isEmpty() ? title : title + " — " + author);
            views.setOnClickPendingIntent(SLOTS[i], bookIntent(context, book, appWidgetId * MAX_BOOKS + i));
        }
        ContinueReadingWidgetProvider.bindLibrary(context, views, false);
        views.setImageViewBitmap(
            R.id.widget_backdrop,
            ContinueReadingWidgetProvider.widgetBackdrop(first, size[0], size[1])
        );
        if (Build.VERSION.SDK_INT >= 31) {
            views.setBoolean(R.id.widget_root, "setClipToOutline", true);
        }
        // Header and empty space: the home screen, where the full «Новое у любимых» shelf is.
        views.setOnClickPendingIntent(
            R.id.widget_root,
            ContinueReadingWidgetProvider.openIntent(context, "home", 20_000 + appWidgetId)
        );
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    /**
     * Rows × columns that show the most cover area: one row of up to 4 covers across the whole width,
     * or two rows when the widget is tall enough for them. Returns {rows, cols}.
     */
    static int[] chooseGrid(int count, int widthDp, int heightDp) {
        int n = Math.max(1, Math.min(MAX_BOOKS, count));
        float availW = widthDp - PAD_H_DP;
        float availH = heightDp - CHROME_V_DP;
        int bestRows = 1;
        int bestCols = Math.min(COLS, n);
        float bestScore = -1f;
        for (int rows = 1; rows <= 2; rows++) {
            if (rows == 2 && n < 2) break;
            int cols = Math.min(COLS, (n + rows - 1) / rows);
            float byWidth = (availW - GAP_DP * (cols - 1)) / cols;
            float byHeight = ((availH - ROW_GAP_DP * (rows - 1)) / rows - CAPTION_DP) / 1.5f;
            float cover = Math.min(byWidth, byHeight);
            if (cover < MIN_COVER_DP && rows > 1) continue;
            float score = Math.min(n, rows * cols) * cover * cover;
            if (score > bestScore) {
                bestScore = score;
                bestRows = rows;
                bestCols = cols;
            }
        }
        return new int[] { bestRows, bestCols };
    }

    static PendingIntent bookIntent(Context context, JSONObject book, int requestCode) {
        String bookId = book.optString("bookId", "");
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(LaunchIntentPlugin.ACTION_BOOK);
        intent.putExtra(ContinueReadingWidgetProvider.KEY_BOOK_ID, bookId);
        intent.putExtra("title", book.optString("title", ""));
        intent.putExtra("author", book.optString("author", ""));
        intent.putExtra("ext", book.optString("ext", ""));
        intent.setData(Uri.parse("inpx-widget://details/" + Uri.encode(bookId)));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context,
            30_000 + requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
