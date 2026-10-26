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
import android.net.Uri;
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
    /** Library name + logo shown at the top of every widget (`ContinueWidget.updateLibrary`). */
    public static final String LIBRARY_PREFS = "inpx_library_widget";
    public static final String KEY_LIBRARY_NAME = "name";
    public static final String KEY_LIBRARY_LOGO = "logoPath";
    private static final int LOGO_MAX_PX = 128;
    private static final int COVER_MAX_PX = 256;
    private static final int BACKDROP_SRC = 48;
    private static final int BACKDROP_OUT = 240;
    private static final int BLUR_RADIUS = 6;
    /** Longer side of a full-bleed cover; RGB_565 keeps it near 250 KB. */
    private static final int FILL_MAX_PX = 420;

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
        int progress = Math.max(0, Math.min(100, prefs.getInt(KEY_PROGRESS, 0)));

        int[] size = portraitSizePx(context, appWidgetManager, appWidgetId);
        boolean wide = isWide(size);
        RemoteViews views = new RemoteViews(
            context.getPackageName(),
            wide ? R.layout.widget_continue_reading : R.layout.widget_continue_compact
        );
        boolean empty = title == null || title.trim().isEmpty();
        File coverFile = findCoverFile(context, bookId, coverPath, !wide);
        bindCover(views, coverFile, size, wide);
        views.setTextViewText(R.id.widget_title, empty ? context.getString(R.string.widget_continue_empty) : title);
        views.setTextViewText(R.id.widget_author, empty || author == null ? "" : author);
        views.setViewVisibility(R.id.widget_author, empty || author == null || author.isEmpty() ? View.GONE : View.VISIBLE);
        boolean showProgress = !empty && progress > 0;
        views.setViewVisibility(R.id.widget_progress_row, showProgress ? View.VISIBLE : View.GONE);
        views.setProgressBar(R.id.widget_progress, 100, progress, false);
        views.setTextViewText(R.id.widget_percent, context.getString(R.string.widget_continue_percent, progress));
        if (Build.VERSION.SDK_INT >= 31) {
            views.setBoolean(R.id.widget_root, "setClipToOutline", true);
        }

        bindLibrary(context, views, !wide);
        views.setOnClickPendingIntent(R.id.widget_root, continueIntent(context, bookId, appWidgetId));

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    /** Library name and logo row (`widget_lib_*`); hidden until the app has reported a name. */
    static void bindLibrary(Context context, RemoteViews views, boolean overCover) {
        SharedPreferences prefs = context.getSharedPreferences(LIBRARY_PREFS, Context.MODE_PRIVATE);
        String name = prefs.getString(KEY_LIBRARY_NAME, "");
        boolean show = name != null && !name.trim().isEmpty();
        views.setViewVisibility(R.id.widget_lib_row, show ? View.VISIBLE : View.GONE);
        if (overCover) views.setViewVisibility(R.id.widget_lib_scrim, show ? View.VISIBLE : View.GONE);
        if (!show) return;
        views.setTextViewText(R.id.widget_lib_name, name);
        String logoPath = prefs.getString(KEY_LIBRARY_LOGO, "");
        // An SVG logo does not decode: the name stays alone.
        Bitmap logo = logoPath == null || logoPath.isEmpty() ? null : decodeCover(new File(logoPath), LOGO_MAX_PX);
        if (logo != null) views.setImageViewBitmap(R.id.widget_lib_logo, logo);
        views.setViewVisibility(R.id.widget_lib_logo, logo != null ? View.VISIBLE : View.GONE);
    }

    /** Wide cells put the cover on the left; square and tall ones fill the widget with it. */
    static boolean isWide(int[] size) {
        return size[0] >= size[1] * 1.3f;
    }

    /**
     * Cover-first: `widget_cover` fills the widget (tall) or its full height (wide, next to a blurred
     * `widget_backdrop`). Bitmaps stay small: one RemoteViews update goes through a ~1 MB binder call.
     */
    static void bindCover(RemoteViews views, File coverFile, int[] size, boolean wide) {
        if (wide) {
            Bitmap cover = decodeCover(coverFile, COVER_MAX_PX);
            views.setImageViewBitmap(R.id.widget_backdrop, widgetBackdrop(cover, size[0], size[1]));
            if (cover != null) views.setImageViewBitmap(R.id.widget_cover, cover);
            else views.setImageViewResource(R.id.widget_cover, R.drawable.widget_cover_placeholder);
            return;
        }
        Bitmap cover = decodeCover(coverFile, FILL_MAX_PX);
        Bitmap fill = cover != null ? coverFill(cover, size[0], size[1], FILL_MAX_PX) : null;
        if (fill != null) views.setImageViewBitmap(R.id.widget_cover, fill);
        else views.setImageViewResource(R.id.widget_cover, R.drawable.widget_cover_fill_placeholder);
    }

    /** Crop to the widget's aspect (keeping the top, where titles and faces usually are), RGB_565. */
    static Bitmap coverFill(Bitmap src, int width, int height, int maxSide) {
        float target = width / (float) Math.max(1, height);
        int sw = src.getWidth();
        int sh = src.getHeight();
        int cw = sw;
        int ch = Math.round(sw / target);
        if (ch > sh) {
            ch = sh;
            cw = Math.round(sh * target);
        }
        int x = (sw - cw) / 2;
        int y = Math.round((sh - ch) * 0.25f);
        float scale = Math.min(1f, maxSide / (float) Math.max(cw, ch));
        int ow = Math.max(1, Math.round(cw * scale));
        int oh = Math.max(1, Math.round(ch * scale));
        Bitmap out = Bitmap.createBitmap(ow, oh, Bitmap.Config.RGB_565);
        Canvas canvas = new Canvas(out);
        Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
        canvas.drawBitmap(src, new android.graphics.Rect(x, y, x + cw, y + ch), new RectF(0, 0, ow, oh), paint);
        return out;
    }

    /** Portrait launchers report the real width as the min width and the real height as the max height. */
    static int[] portraitSizePx(Context context, AppWidgetManager manager, int appWidgetId) {
        float density = context.getResources().getDisplayMetrics().density;
        int wDp = 250;
        int hDp = 110;
        Bundle options = manager.getAppWidgetOptions(appWidgetId);
        if (options != null) {
            int minW = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int maxH = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            if (maxH <= 0) maxH = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            if (minW > 0) wDp = minW;
            if (maxH > 0) hDp = maxH;
        }
        return new int[] {
            Math.max(1, Math.round(wDp * density)),
            Math.max(1, Math.round(hDp * density)),
        };
    }

    public static void refreshAll(Context context) {
        refreshProvider(context, ContinueReadingWidgetProvider.class);
    }

    /** Re-renders every placed instance of a widget provider. */
    static void refreshProvider(Context context, Class<?> provider) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, provider);
        int[] ids = manager.getAppWidgetIds(component);
        if (ids == null || ids.length == 0) return;
        Intent intent = new Intent(context, provider);
        intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(intent);
    }

    /** Opens a book in the reader (empty id = the newest book the app knows). */
    static PendingIntent continueIntent(Context context, String bookId, int requestCode) {
        return continueIntent(context, bookId, requestCode, false);
    }

    /** `startTts`: the reader starts read-aloud once the book is open (TTS remote widget). */
    static PendingIntent continueIntent(Context context, String bookId, int requestCode, boolean startTts) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(LaunchIntentPlugin.ACTION_CONTINUE);
        if (bookId != null && !bookId.isEmpty()) {
            intent.putExtra(KEY_BOOK_ID, bookId);
        }
        if (startTts) intent.putExtra(LaunchIntentPlugin.EXTRA_START_TTS, true);
        // Distinct data keeps one PendingIntent per book and mode (extras alone do not make them distinct).
        intent.setData(Uri.parse("inpx-widget://book/" + Uri.encode(bookId != null ? bookId : "") + (startTts ? "?tts=1" : "")));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /** Opens an app screen: home, catalog, library, profile or search. */
    static PendingIntent openIntent(Context context, String target, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(LaunchIntentPlugin.ACTION_OPEN);
        intent.putExtra(LaunchIntentPlugin.EXTRA_TARGET, target);
        intent.setData(Uri.parse("inpx-widget://open/" + target));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    static File findCoverFile(Context context, String bookId, String coverPath) {
        return findCoverFile(context, bookId, coverPath, false);
    }

    /** `preferFull`: a cover that fills the widget looks soft when upscaled from the thumb. */
    static File findCoverFile(Context context, String bookId, String coverPath, boolean preferFull) {
        File dir = new File(context.getFilesDir(), "image-cache" + File.separator + "covers");
        String key = bookId != null && !bookId.isEmpty() ? safeFileKey(bookId) : null;
        if (preferFull && key != null) {
            File full = new File(dir, key + "_full.jpg");
            if (full.isFile()) return full;
        }
        if (coverPath != null && !coverPath.isEmpty()) {
            File direct = new File(coverPath);
            if (direct.isFile()) return direct;
        }
        if (key == null) return null;
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
        return decodeCover(file, COVER_MAX_PX);
    }

    static Bitmap decodeCover(File file, int maxPx) {
        if (file == null || !file.isFile()) return null;
        String path = file.getAbsolutePath();
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(path, bounds);
        int largest = Math.max(bounds.outWidth, bounds.outHeight);
        if (largest <= 0) return null;
        int sample = 1;
        while (largest / sample > maxPx) {
            sample *= 2;
        }
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        return BitmapFactory.decodeFile(path, opts);
    }

    static Bitmap widgetBackdrop(Bitmap cover, int widthPx, int heightPx) {
        // Blurred and stretched with fitXY anyway: a quarter of the widget size is plenty.
        int width = Math.max(1, widthPx / 4);
        int height = Math.max(1, heightPx / 4);
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
        paint.setColor(0xB31E1A16);
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

