package ru.inpx.bookreader;

import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Display;
import android.view.Surface;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.core.content.ContextCompat;
import java.io.File;
import java.io.OutputStream;

/**
 * Обложка текущей книги на экране сна BOOX.
 *
 * BOOX рисует сон своим «dream» и берёт картинку по рассылке {@code onyx.action.SCREENSAVER}
 * ({@code type} 16, {@code file} — абсолютный путь, {@code show_result_hint} false; разрешений не нужно).
 * Файл прямо в {@code /sdcard/Pictures/} используется на месте и декодируется заново при каждом
 * засыпании — поэтому мы перезаписываем свой файл (через MediaStore, без прав на хранилище), когда
 * меняется книга или прогресс, а рассылку шлём только при включении / смене пути. Файл в другой
 * папке BOOX копирует один раз и дальше не видит. Поверх картинки BOOX рисует свои часы (обновляются
 * во сне) и строку состояния внизу — под часы можно оставить место. Картинка обрезается по центру
 * под экран, поэтому рисуется ровно в размер экрана.
 */
@CapacitorPlugin(name = "SleepScreen")
public class SleepScreenPlugin extends Plugin {

    private static final String TAG = "InpxSleep";

    private static final String ACTION_SCREENSAVER = "onyx.action.SCREENSAVER";
    private static final int TYPE_SLEEP_IMAGE = 16;
    private static final String DEFAULT_IMAGE = "/system/media/standby-1.png";
    private static final String FILE_NAME = "inpx-reader-sleep.png";
    private static final String RELATIVE_DIR = "Pictures/";
    private static final String PREFS = "inpx_sleep_screen";
    private static final String KEY_APPLIED_PATH = "appliedPath";

    private static boolean supported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && OnyxFrontLight.isLikelyOnyxDevice();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject res = new JSObject();
        res.put("supported", supported());
        res.put("applied", !prefs().getString(KEY_APPLIED_PATH, "").isEmpty());
        call.resolve(res);
    }

    /** BOOX broadcasts this tens of milliseconds before its dream decodes the picture. */
    private static final String ACTION_GOING_TO_SLEEP = "com.onyx.action.ONYX_SYSTEM_GOING_TO_SLEEP";
    private static final long ROTATION_SETTLE_MS = 1500;

    /** What the current picture shows; kept so a rotation can redraw it without the JS side. */
    private volatile Spec lastSpec;
    /** Display rotation the published file was drawn for. */
    private volatile int publishedRotation = -1;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private DisplayManager.DisplayListener displayListener;
    private BroadcastReceiver sleepReceiver;
    private final Runnable rotationRedraw = this::redrawIfRotated;

    /** Draws the picture, writes it to Pictures/ and points BOOX at it (once per path). */
    @PluginMethod
    public void publish(PluginCall call) {
        if (!supported()) {
            JSObject res = new JSObject();
            res.put("ok", false);
            call.resolve(res);
            return;
        }
        final Spec spec = new Spec(call);
        getBridge().execute(() -> {
            String path = null;
            try {
                path = publishNow(spec);
            } catch (Throwable t) {
                Log.w(TAG, "publish failed", t);
            } finally {
                // Always answer: a call left hanging stalled every later update on the JS side.
                JSObject res = new JSObject();
                res.put("ok", path != null);
                if (path != null) res.put("path", path);
                call.resolve(res);
            }
        });
    }

    /** Back to BOOX's own default picture; our file is deleted. */
    @PluginMethod
    public void restore(PluginCall call) {
        JSObject res = new JSObject();
        lastSpec = null;
        publishedRotation = -1;
        stopWatching();
        if (supported()) {
            sendScreensaver(DEFAULT_IMAGE);
            deleteOwnFile();
        }
        prefs().edit().remove(KEY_APPLIED_PATH).apply();
        res.put("ok", true);
        call.resolve(res);
    }

    @Override
    protected void handleOnDestroy() {
        stopWatching();
        super.handleOnDestroy();
    }

    /**
     * Renders for the display rotation of this moment and writes the file. Runs off the main thread;
     * synchronized so a rotation redraw and a JS publish never write at the same time.
     */
    private synchronized String publishNow(Spec spec) {
        Bitmap bitmap = null;
        try {
            int rotation = displayRotation();
            int[] size = portraitScreenSize();
            bitmap = renderForRotation(spec, size[0], size[1], rotation);
            String path = writeToPictures(bitmap);
            if (path == null) {
                Log.w(TAG, "could not write the picture to Pictures/");
                return null;
            }
            SharedPreferences prefs = prefs();
            if (!path.equals(prefs.getString(KEY_APPLIED_PATH, ""))) {
                sendScreensaver(path);
                prefs.edit().putString(KEY_APPLIED_PATH, path).apply();
            }
            lastSpec = spec;
            publishedRotation = rotation;
            mainHandler.post(this::startWatching);
            Log.i(TAG, "published " + path + " layout=" + (spec.fullCover ? "cover" : "card")
                + " rotation=" + rotation + " cover=" + (spec.coverPath.isEmpty() ? "none" : "yes"));
            return path;
        } catch (RuntimeException | OutOfMemoryError e) {
            Log.w(TAG, "render / write failed", e);
            return null;
        } finally {
            if (bitmap != null) bitmap.recycle();
        }
    }

    private int displayRotation() {
        WindowManager wm = (WindowManager) getContext().getSystemService(Context.WINDOW_SERVICE);
        return wm == null ? Surface.ROTATION_0 : wm.getDefaultDisplay().getRotation();
    }

    /** Redraws the published picture when the device now sits in another rotation than it was drawn for. */
    private void redrawIfRotated() {
        final Spec spec = lastSpec;
        if (spec == null || displayRotation() == publishedRotation) return;
        getBridge().execute(() -> publishNow(spec));
    }

    private void startWatching() {
        if (displayListener == null) {
            DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
            if (dm != null) {
                displayListener = new DisplayManager.DisplayListener() {
                    @Override public void onDisplayAdded(int displayId) {}
                    @Override public void onDisplayRemoved(int displayId) {}
                    @Override public void onDisplayChanged(int displayId) {
                        if (displayId != Display.DEFAULT_DISPLAY) return;
                        // Wait until the turn settles (a cover closing can flip it at the last moment).
                        mainHandler.removeCallbacks(rotationRedraw);
                        mainHandler.postDelayed(rotationRedraw, ROTATION_SETTLE_MS);
                    }
                };
                dm.registerDisplayListener(displayListener, mainHandler);
            }
        }
        if (sleepReceiver == null) {
            sleepReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    // Last chance: a turn just before sleep that the settle delay has not covered yet.
                    mainHandler.removeCallbacks(rotationRedraw);
                    final Spec spec = lastSpec;
                    if (spec == null || displayRotation() == publishedRotation) return;
                    final PendingResult pending = goAsync();
                    new Thread(() -> {
                        try {
                            publishNow(spec);
                        } finally {
                            pending.finish();
                        }
                    }, "inpx-sleep-redraw").start();
                }
            };
            ContextCompat.registerReceiver(
                getContext(),
                sleepReceiver,
                new IntentFilter(ACTION_GOING_TO_SLEEP),
                ContextCompat.RECEIVER_EXPORTED
            );
        }
    }

    private void stopWatching() {
        mainHandler.removeCallbacks(rotationRedraw);
        mainHandler.post(() -> {
            if (displayListener != null) {
                DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
                if (dm != null) dm.unregisterDisplayListener(displayListener);
                displayListener = null;
            }
            if (sleepReceiver != null) {
                try {
                    getContext().unregisterReceiver(sleepReceiver);
                } catch (IllegalArgumentException ignored) {
                    // already gone
                }
                sleepReceiver = null;
            }
        });
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void sendScreensaver(String path) {
        Intent intent = new Intent(ACTION_SCREENSAVER)
            .putExtra("type", TYPE_SLEEP_IMAGE)
            .putExtra("file", path)
            .putExtra("show_result_hint", false);
        getContext().sendBroadcast(intent);
    }

    private int[] portraitScreenSize() {
        DisplayMetrics dm = new DisplayMetrics();
        WindowManager wm = (WindowManager) getContext().getSystemService(Context.WINDOW_SERVICE);
        if (wm != null) wm.getDefaultDisplay().getRealMetrics(dm);
        int a = Math.max(1, dm.widthPixels);
        int b = Math.max(1, dm.heightPixels);
        if (a < 200 || b < 200) return new int[] { 1264, 1680 };
        return new int[] { Math.min(a, b), Math.max(a, b) };
    }

    // ── MediaStore (own row in Pictures/, no storage permission) ──

    private Uri findOwnRow(ContentResolver cr, Uri collection) {
        String[] projection = { MediaStore.Images.Media._ID };
        String selection = MediaStore.Images.Media.DISPLAY_NAME + "=? AND " + MediaStore.Images.Media.RELATIVE_PATH + "=?";
        try (Cursor c = cr.query(collection, projection, selection, new String[] { FILE_NAME, RELATIVE_DIR }, null)) {
            if (c != null && c.moveToFirst()) {
                return Uri.withAppendedPath(collection, String.valueOf(c.getLong(0)));
            }
        }
        return null;
    }

    private String writeToPictures(Bitmap bitmap) {
        ContentResolver cr = getContext().getContentResolver();
        Uri collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri uri = findOwnRow(cr, collection);
        boolean created = false;
        if (uri == null) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, FILE_NAME);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, RELATIVE_DIR);
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            uri = cr.insert(collection, values);
            created = true;
        }
        if (uri == null) return null;
        try (OutputStream out = cr.openOutputStream(uri, "wt")) {
            if (out == null) return null;
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        } catch (Exception e) {
            Log.w(TAG, "MediaStore write failed", e);
            return null;
        }
        if (created) {
            ContentValues done = new ContentValues();
            done.put(MediaStore.Images.Media.IS_PENDING, 0);
            cr.update(uri, done, null, null);
        }
        return absolutePathOf(cr, uri);
    }

    @SuppressWarnings("deprecation")
    private String absolutePathOf(ContentResolver cr, Uri uri) {
        String[] projection = { MediaStore.Images.Media.DATA, MediaStore.Images.Media.DISPLAY_NAME };
        try (Cursor c = cr.query(uri, projection, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String data = c.getString(0);
                if (data != null && !data.isEmpty()) return data;
                String name = c.getString(1);
                if (name != null) {
                    return new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), name).getAbsolutePath();
                }
            }
        } catch (RuntimeException ignored) {
            // fall through
        }
        return new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), FILE_NAME).getAbsolutePath();
    }

    private void deleteOwnFile() {
        try {
            ContentResolver cr = getContext().getContentResolver();
            Uri collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            Uri uri = findOwnRow(cr, collection);
            if (uri != null) cr.delete(uri, null, null);
        } catch (RuntimeException ignored) {
            // nothing to clean up
        }
    }

    // ── Rendering ──

    private static final class Spec {
        final String title;
        final String author;
        final String series;
        final int progress;
        final String coverPath;
        final boolean fullCover;
        final boolean dark;
        final boolean clockSpace;
        final boolean showProgress;

        Spec(PluginCall call) {
            title = text(call.getString("title", ""));
            author = text(call.getString("author", ""));
            series = text(call.getString("series", ""));
            Integer p = call.getInt("progress", -1);
            progress = p == null ? -1 : Math.max(-1, Math.min(100, p));
            coverPath = text(call.getString("coverPath", ""));
            fullCover = "cover".equals(call.getString("layout", "card"));
            dark = "dark".equals(call.getString("theme", "light"));
            clockSpace = Boolean.TRUE.equals(call.getBoolean("clockSpace", true));
            showProgress = Boolean.TRUE.equals(call.getBoolean("showProgress", true));
        }

        private static String text(String value) {
            return value == null ? "" : value.trim();
        }
    }

    /**
     * The picture is always the portrait design, as the device is held normally. BOOX shows the file in
     * the coordinates of the rotation it sleeps in and centre-crops it to that shape, so in landscape
     * (or upside down) the portrait drawing is turned back by the display rotation into a file of the
     * logical size: on the panel it then stands upright in portrait, whole. Display rotation R means the
     * system renders R° clockwise (device turned R° counter-clockwise), so the content turns −R°.
     */
    private static Bitmap renderForRotation(Spec spec, int pw, int ph, int rotation) {
        Bitmap portrait = render(spec, pw, ph);
        if (rotation == Surface.ROTATION_0) return portrait;
        boolean landscape = rotation == Surface.ROTATION_90 || rotation == Surface.ROTATION_270;
        int lw = landscape ? ph : pw;
        int lh = landscape ? pw : ph;
        Bitmap out = Bitmap.createBitmap(lw, lh, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        if (rotation == Surface.ROTATION_90) {
            canvas.translate(0, lh);
            canvas.rotate(-90);
        } else if (rotation == Surface.ROTATION_270) {
            canvas.translate(lw, 0);
            canvas.rotate(90);
        } else {
            canvas.translate(lw, lh);
            canvas.rotate(180);
        }
        canvas.drawBitmap(portrait, 0, 0, null);
        portrait.recycle();
        return out;
    }

    private static Bitmap render(Spec spec, int w, int h) {
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        int bg = spec.dark ? Color.BLACK : Color.WHITE;
        int fg = spec.dark ? Color.WHITE : Color.BLACK;
        canvas.drawColor(bg);
        Bitmap cover = decodeCover(spec.coverPath, w, h);
        try {
            if (spec.fullCover && cover != null) {
                drawCenterCrop(canvas, cover, new Rect(0, 0, w, h));
                return bitmap;
            }
            int side = Math.round(w * 0.08f);
            // Top: room for the BOOX clock (it is drawn over the picture and updated while asleep).
            // BOOX Digital clock + its date line end at ~24 % of the height (Go 7, FW 4.2); 22 % let the date
            // overlap the cover.
            int top = Math.round(h * (spec.clockSpace ? 0.28f : 0.06f));
            // Bottom: BOOX's status bar («Нажмите кнопку питания…», battery).
            int bottom = h - Math.round(h * 0.08f);
            int textWidth = w - 2 * side;

            TextPaint titlePaint = paint(fg, w * 0.052f, Typeface.create(Typeface.SERIF, Typeface.BOLD));
            TextPaint authorPaint = paint(fg, w * 0.036f, Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL));
            TextPaint seriesPaint = paint(fg, w * 0.030f, Typeface.create(Typeface.SANS_SERIF, Typeface.ITALIC));
            TextPaint percentPaint = paint(fg, w * 0.032f, Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));

            StaticLayout titleLayout = layout(spec.title, titlePaint, textWidth, 3);
            StaticLayout authorLayout = layout(spec.author, authorPaint, textWidth, 2);
            StaticLayout seriesLayout = layout(spec.series, seriesPaint, textWidth, 1);
            int gap = Math.round(h * 0.018f);
            int progressH = spec.showProgress && spec.progress >= 0 ? Math.round(h * 0.035f) : 0;
            int textH = height(titleLayout) + height(authorLayout) + height(seriesLayout) + progressH
                + gap * (count(titleLayout, authorLayout, seriesLayout) + (progressH > 0 ? 1 : 0));

            int coverBottom = bottom - textH - gap * 2;
            if (cover != null && coverBottom - top > h * 0.2f) {
                RectF frame = fitRect(cover.getWidth(), cover.getHeight(), side, top, w - side, coverBottom);
                canvas.drawBitmap(cover, null, frame, new Paint(Paint.FILTER_BITMAP_FLAG));
                Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
                border.setStyle(Paint.Style.STROKE);
                border.setStrokeWidth(Math.max(2f, w * 0.002f));
                border.setColor(fg);
                canvas.drawRect(frame, border);
            } else {
                // No cover (yet): the title block moves up to the middle.
                coverBottom = top + Math.max(0, (bottom - top - textH) / 2) - gap * 2;
            }

            float y = coverBottom + gap * 2;
            y = drawLayout(canvas, titleLayout, side, y, gap);
            y = drawLayout(canvas, authorLayout, side, y, gap);
            y = drawLayout(canvas, seriesLayout, side, y, gap);
            if (progressH > 0) drawProgress(canvas, spec.progress, side, y, textWidth, progressH, fg, bg, percentPaint);
            return bitmap;
        } finally {
            if (cover != null) cover.recycle();
        }
    }

    private static TextPaint paint(int color, float size, Typeface face) {
        TextPaint p = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        p.setTextSize(size);
        p.setTypeface(face);
        return p;
    }

    private static StaticLayout layout(String text, TextPaint paint, int width, int maxLines) {
        if (TextUtils.isEmpty(text)) return null;
        return StaticLayout.Builder.obtain(text, 0, text.length(), paint, width)
            .setAlignment(Layout.Alignment.ALIGN_CENTER)
            .setMaxLines(maxLines)
            .setEllipsize(TextUtils.TruncateAt.END)
            .setIncludePad(false)
            .build();
    }

    private static int height(StaticLayout layout) {
        return layout == null ? 0 : layout.getHeight();
    }

    private static int count(StaticLayout... layouts) {
        int n = 0;
        for (StaticLayout l : layouts) if (l != null) n++;
        return Math.max(0, n - 1);
    }

    private static float drawLayout(Canvas canvas, StaticLayout layout, int x, float y, int gap) {
        if (layout == null) return y;
        canvas.save();
        canvas.translate(x, y);
        layout.draw(canvas);
        canvas.restore();
        return y + layout.getHeight() + gap;
    }

    private static void drawProgress(Canvas canvas, int progress, int x, float y, int width, int height,
                                     int fg, int bg, TextPaint percentPaint) {
        String label = progress + " %";
        float labelW = percentPaint.measureText(label);
        float barH = Math.max(8f, height * 0.4f);
        float barW = width - labelW - height * 0.6f;
        float barTop = y + (height - barH) / 2f;
        RectF track = new RectF(x, barTop, x + barW, barTop + barH);
        float r = barH / 2f;
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(Math.max(2f, barH * 0.18f));
        stroke.setColor(fg);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(fg);
        if (progress > 0) {
            RectF done = new RectF(track.left, track.top, track.left + track.width() * progress / 100f, track.bottom);
            canvas.drawRoundRect(done, r, r, fill);
        }
        canvas.drawRoundRect(track, r, r, stroke);
        Paint.FontMetrics fm = percentPaint.getFontMetrics();
        float baseline = y + height / 2f - (fm.ascent + fm.descent) / 2f;
        canvas.drawText(label, x + width - labelW, baseline, percentPaint);
    }

    private static Bitmap decodeCover(String path, int maxW, int maxH) {
        if (TextUtils.isEmpty(path)) return null;
        File file = new File(path);
        if (!file.isFile()) return null;
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(path, bounds);
            int sample = 1;
            while (bounds.outWidth / (sample * 2) >= maxW && bounds.outHeight / (sample * 2) >= maxH) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            return BitmapFactory.decodeFile(path, opts);
        } catch (RuntimeException | OutOfMemoryError e) {
            return null;
        }
    }

    private static RectF fitRect(int bw, int bh, float left, float top, float right, float bottom) {
        float boxW = right - left;
        float boxH = bottom - top;
        float scale = Math.min(boxW / bw, boxH / bh);
        float w = bw * scale;
        float h = bh * scale;
        float x = left + (boxW - w) / 2f;
        float y = top + (boxH - h) / 2f;
        return new RectF(x, y, x + w, y + h);
    }

    private static void drawCenterCrop(Canvas canvas, Bitmap src, Rect dst) {
        float scale = Math.max((float) dst.width() / src.getWidth(), (float) dst.height() / src.getHeight());
        int cropW = Math.round(dst.width() / scale);
        int cropH = Math.round(dst.height() / scale);
        int x = (src.getWidth() - cropW) / 2;
        int y = (src.getHeight() - cropH) / 2;
        canvas.drawBitmap(src, new Rect(x, y, x + cropW, y + cropH), dst, new Paint(Paint.FILTER_BITMAP_FLAG));
    }
}
