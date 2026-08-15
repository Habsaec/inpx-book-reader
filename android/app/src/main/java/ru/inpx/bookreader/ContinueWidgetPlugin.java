package ru.inpx.bookreader;

import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
        call.resolve();
    }
}
