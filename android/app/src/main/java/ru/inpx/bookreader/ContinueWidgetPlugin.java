package ru.inpx.bookreader;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "ContinueWidget")
public class ContinueWidgetPlugin extends Plugin {

    @PluginMethod
    public void updateContinueBook(PluginCall call) {
        String bookId = call.getString("bookId", "");
        String title = call.getString("title", "");
        String author = call.getString("author", "");
        String coverPath = call.getString("coverPath", "");
        Integer progress = call.getInt("progress", 0);
        Integer rating = call.getInt("rating", 0);

        SharedPreferences prefs = getContext().getSharedPreferences(
            ContinueReadingWidgetProvider.PREFS_NAME,
            0
        );
        prefs.edit()
            .putString(ContinueReadingWidgetProvider.KEY_BOOK_ID, bookId != null ? bookId : "")
            .putString(ContinueReadingWidgetProvider.KEY_TITLE, title != null ? title : "")
            .putString(ContinueReadingWidgetProvider.KEY_AUTHOR, author != null ? author : "")
            .putString(ContinueReadingWidgetProvider.KEY_COVER_PATH, coverPath != null ? coverPath : "")
            .putInt(ContinueReadingWidgetProvider.KEY_PROGRESS, progress != null ? Math.max(0, Math.min(100, progress)) : 0)
            .putInt(ContinueReadingWidgetProvider.KEY_RATING, rating != null ? Math.max(0, Math.min(5, rating)) : 0)
            .commit();

        ContinueReadingWidgetProvider.refreshAll(getContext());
        // The TTS remote shows this book while read-aloud is off.
        TtsRemoteWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    /** «Новое у любимых»: `books: [{ bookId, title, author, ext, coverPath }]`, newest first. */
    @PluginMethod
    public void updateFollowing(PluginCall call) {
        JSArray input = call.getArray("books");
        JSONArray books = new JSONArray();
        if (input != null) {
            for (int i = 0; i < input.length() && books.length() < FollowingWidgetProvider.MAX_BOOKS; i++) {
                JSONObject src = input.optJSONObject(i);
                if (src == null) continue;
                String bookId = src.optString("bookId", "");
                if (bookId.isEmpty()) continue;
                try {
                    JSONObject book = new JSONObject();
                    book.put("bookId", bookId);
                    book.put("title", src.optString("title", ""));
                    book.put("author", src.optString("author", ""));
                    book.put("ext", src.optString("ext", ""));
                    book.put("coverPath", src.optString("coverPath", ""));
                    books.put(book);
                } catch (Exception ignored) {
                    /* skip a malformed entry */
                }
            }
        }
        getContext().getSharedPreferences(FollowingWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(FollowingWidgetProvider.KEY_BOOKS, books.toString())
            .commit();
        FollowingWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    /** Library name and a cached logo file (PNG / JPEG / WebP; empty = none) for the widget headers. */
    @PluginMethod
    public void updateLibrary(PluginCall call) {
        String name = call.getString("name", "");
        String logoPath = call.getString("logoPath", "");
        getContext().getSharedPreferences(ContinueReadingWidgetProvider.LIBRARY_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(ContinueReadingWidgetProvider.KEY_LIBRARY_NAME, name != null ? name.trim() : "")
            .putString(ContinueReadingWidgetProvider.KEY_LIBRARY_LOGO, logoPath != null ? logoPath : "")
            .commit();
        ContinueReadingWidgetProvider.refreshAll(getContext());
        TtsRemoteWidgetProvider.refreshAll(getContext());
        FollowingWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    /** How many of each widget are placed, so the app skips server calls for absent ones. */
    @PluginMethod
    public void placedWidgets(PluginCall call) {
        Context context = getContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        JSObject out = new JSObject();
        out.put("continue", countPlaced(manager, context, ContinueReadingWidgetProvider.class));
        out.put("tts", countPlaced(manager, context, TtsRemoteWidgetProvider.class));
        out.put("following", countPlaced(manager, context, FollowingWidgetProvider.class));
        call.resolve(out);
    }

    private static int countPlaced(AppWidgetManager manager, Context context, Class<?> provider) {
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, provider));
        return ids != null ? ids.length : 0;
    }
}
