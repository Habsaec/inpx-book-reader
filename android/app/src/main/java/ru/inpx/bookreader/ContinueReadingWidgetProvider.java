package ru.inpx.bookreader;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import java.io.File;

public class ContinueReadingWidgetProvider extends AppWidgetProvider {
    public static final String PREFS_NAME = "inpx_continue_widget";
    public static final String KEY_BOOK_ID = "bookId";
    public static final String KEY_TITLE = "title";
    public static final String KEY_AUTHOR = "author";
    public static final String KEY_COVER_PATH = "coverPath";
    public static final String KEY_PROGRESS = "progress";
    public static final String KEY_RATING = "rating";
    private static final int COVER_MAX_PX = 256;
    private static final int BACKDROP_SRC = 48;
    private static final int BACKDROP_OUT = 240;
    private static final int BLUR_RADIUS = 6;

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

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String bookId = prefs.getString(KEY_BOOK_ID, "");
        String title = prefs.getString(KEY_TITLE, "");
        String author = prefs.getString(KEY_AUTHOR, "");
        String coverPath = prefs.getString(KEY_COVER_PATH, "");
        int progress = prefs.getInt(KEY_PROGRESS, 0);
        int rating = prefs.getInt(KEY_RATING, 0);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_continue_reading);
        boolean empty = title == null || title.trim().isEmpty();
        if (empty) {
            views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_continue_empty));
            views.setTextViewText(R.id.widget_author, "");
            views.setViewVisibility(R.id.widget_progress, View.GONE);
            views.setViewVisibility(R.id.widget_rating, View.GONE);
        } else {
            views.setTextViewText(R.id.widget_title, title);
            views.setTextViewText(R.id.widget_author, author != null ? author : "");
            if (rating > 0) {
                StringBuilder stars = new StringBuilder();
                for (int i = 0; i < rating; i++) stars.append('★');
                views.setTextViewText(R.id.widget_rating, stars.toString());
                views.setViewVisibility(R.id.widget_rating, View.VISIBLE);
            } else {
                views.setViewVisibility(R.id.widget_rating, View.GONE);
            }
            if (progress > 0) {
                views.setViewVisibility(R.id.widget_progress, View.VISIBLE);
                views.setProgressBar(R.id.widget_progress, 100, Math.min(100, progress), false);
            } else {
                views.setViewVisibility(R.id.widget_progress, View.GONE);
            }
        }

        Bitmap cover = decodeCover(findCoverFile(context, bookId, coverPath));
        int[] size = widgetSizePx(context, appWidgetManager, appWidgetId);
        views.setImageViewBitmap(R.id.widget_backdrop, widgetBackdrop(cover, size[0], size[1]));
        views.setViewVisibility(R.id.widget_backdrop, View.VISIBLE);
        views.setViewVisibility(R.id.widget_scrim, View.GONE);
        if (cover != null) {
            float coverRadius = 6f * context.getResources().getDisplayMetrics().density;
            views.setImageViewBitmap(R.id.widget_cover, roundedCover(cover, coverRadius));
        } else {
            views.setImageViewResource(R.id.widget_cover, R.drawable.widget_cover_placeholder);
        }
        if (Build.VERSION.SDK_INT >= 31) {
            views.setBoolean(android.R.id.background, "setClipToOutline", true);
        }

        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(LaunchIntentPlugin.ACTION_CONTINUE);
        if (bookId != null && !bookId.isEmpty()) {
            intent.putExtra(KEY_BOOK_ID, bookId);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            context,
            appWidgetId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(android.R.id.background, pending);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, ContinueReadingWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        if (ids == null || ids.length == 0) return;
        Intent intent = new Intent(context, ContinueReadingWidgetProvider.class);
        intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(intent);
    }

    static File findCoverFile(Context context, String bookId, String coverPath) {
        if (coverPath != null && !coverPath.isEmpty()) {
            File direct = new File(coverPath);
            if (direct.isFile()) return direct;
        }
        if (bookId == null || bookId.isEmpty()) return null;
        File dir = new File(context.getFilesDir(), "image-cache" + File.separator + "covers");
        String key = safeFileKey(bookId);
        File thumb = new File(dir, key + "_thumb.jpg");
        if (thumb.isFile()) return thumb;
        File full = new File(dir, key + "_full.jpg");
        if (full.isFile()) return full;
        return null;
    }

    static String safeFileKey(String bookId) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < bookId.length() && sb.length() < 180; i++) {
            char c = bookId.charAt(i);
            if (c < 32 || c == 127 || "/\\:*?\"<>|".indexOf(c) >= 0) {
                sb.append('_');
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    static Bitmap decodeCover(File file) {
        if (file == null || !file.isFile()) return null;
        String path = file.getAbsolutePath();
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(path, bounds);
        int largest = Math.max(bounds.outWidth, bounds.outHeight);
        if (largest <= 0) return null;
        int sample = 1;
        while (largest / sample > COVER_MAX_PX) {
            sample *= 2;
        }
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        return BitmapFactory.decodeFile(path, opts);
    }

    static int[] widgetSizePx(Context context, AppWidgetManager manager, int appWidgetId) {
        float density = context.getResources().getDisplayMetrics().density;
        int wDp = 250;
        int hDp = 110;
        Bundle options = manager.getAppWidgetOptions(appWidgetId);
        if (options != null) {
            int minW = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int minH = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            if (minW > 0) wDp = minW;
            if (minH > 0) hDp = minH;
        }
        return new int[] {
            Math.max(1, Math.round(wDp * density)),
            Math.max(1, Math.round(hDp * density)),
        };
    }

    static Bitmap widgetBackdrop(Bitmap cover, int width, int height) {
        Bitmap out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        canvas.drawColor(0xFF1E1A16);
        Bitmap fill = cover != null ? blurredBackdrop(cover) : null;
        if (fill == null) return out;
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        BitmapShader shader = new BitmapShader(fill, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
        shader.setLocalMatrix(centerCropMatrix(fill, width, height));
        paint.setShader(shader);
        canvas.drawRect(0, 0, width, height, paint);
        paint.setShader(null);
        paint.setColor(0x801E1A16);
        canvas.drawRect(0, 0, width, height, paint);
        return out;
    }

    static Bitmap roundedCover(Bitmap src, float radius) {
        int w = src.getWidth();
        int h = src.getHeight();
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        paint.setShader(new BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(new RectF(0, 0, w, h), radius, radius, paint);
        return out;
    }

    static Matrix centerCropMatrix(Bitmap src, int width, int height) {
        float scale = Math.max(width / (float) src.getWidth(), height / (float) src.getHeight());
        float dx = (width - src.getWidth() * scale) * 0.5f;
        float dy = (height - src.getHeight() * scale) * 0.5f;
        Matrix matrix = new Matrix();
        matrix.setScale(scale, scale);
        matrix.postTranslate(dx, dy);
        return matrix;
    }

    static Bitmap blurredBackdrop(Bitmap src) {
        if (src == null || src.getWidth() < 2 || src.getHeight() < 2) return null;
        int srcH = Math.max(32, Math.round(src.getHeight() * (BACKDROP_SRC / (float) Math.max(1, src.getWidth()))));
        Bitmap scaled = Bitmap.createScaledBitmap(src, BACKDROP_SRC, srcH, true);
        Bitmap small = scaled.getConfig() == Bitmap.Config.ARGB_8888 && scaled.isMutable()
            ? scaled
            : scaled.copy(Bitmap.Config.ARGB_8888, true);
        if (small != scaled) scaled.recycle();
        boxBlur(small, BLUR_RADIUS);
        boxBlur(small, BLUR_RADIUS);
        int outH = Math.round(srcH * (BACKDROP_OUT / (float) BACKDROP_SRC));
        Bitmap out = Bitmap.createScaledBitmap(small, BACKDROP_OUT, Math.max(outH, 1), true);
        if (out != small) small.recycle();
        return out;
    }

    static void boxBlur(Bitmap bitmap, int radius) {
        if (radius < 1) return;
        int w = bitmap.getWidth();
        int h = bitmap.getHeight();
        int[] src = new int[w * h];
        int[] dst = new int[w * h];
        bitmap.getPixels(src, 0, w, 0, 0, w, h);
        blurHorizontal(src, dst, w, h, radius);
        blurVertical(dst, src, w, h, radius);
        bitmap.setPixels(src, 0, w, 0, 0, w, h);
    }

    static void blurHorizontal(int[] src, int[] dst, int w, int h, int radius) {
        int div = radius * 2 + 1;
        for (int y = 0; y < h; y++) {
            int row = y * w;
            int r = 0;
            int g = 0;
            int b = 0;
            for (int i = -radius; i <= radius; i++) {
                int p = src[row + clamp(i, 0, w - 1)];
                r += (p >> 16) & 255;
                g += (p >> 8) & 255;
                b += p & 255;
            }
            for (int x = 0; x < w; x++) {
                dst[row + x] = 0xff000000 | ((r / div) << 16) | ((g / div) << 8) | (b / div);
                int out = src[row + clamp(x - radius, 0, w - 1)];
                int in = src[row + clamp(x + radius + 1, 0, w - 1)];
                r += ((in >> 16) & 255) - ((out >> 16) & 255);
                g += ((in >> 8) & 255) - ((out >> 8) & 255);
                b += (in & 255) - (out & 255);
            }
        }
    }

    static void blurVertical(int[] src, int[] dst, int w, int h, int radius) {
        int div = radius * 2 + 1;
        for (int x = 0; x < w; x++) {
            int r = 0;
            int g = 0;
            int b = 0;
            for (int i = -radius; i <= radius; i++) {
                int p = src[clamp(i, 0, h - 1) * w + x];
                r += (p >> 16) & 255;
                g += (p >> 8) & 255;
                b += p & 255;
            }
            for (int y = 0; y < h; y++) {
                dst[y * w + x] = 0xff000000 | ((r / div) << 16) | ((g / div) << 8) | (b / div);
                int out = src[clamp(y - radius, 0, h - 1) * w + x];
                int in = src[clamp(y + radius + 1, 0, h - 1) * w + x];
                r += ((in >> 16) & 255) - ((out >> 16) & 255);
                g += ((in >> 8) & 255) - ((out >> 8) & 255);
                b += (in & 255) - (out & 255);
            }
        }
    }

    static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}

