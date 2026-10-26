package ru.inpx.bookreader;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LaunchIntent")
public class LaunchIntentPlugin extends Plugin {

    public static final String ACTION_CONTINUE = "ru.inpx.bookreader.action.CONTINUE_READING";
    /** Widgets: open a screen of the app; extra {@link #EXTRA_TARGET}. */
    public static final String ACTION_OPEN = "ru.inpx.bookreader.action.OPEN";
    public static final String EXTRA_TARGET = "target";
    private static final String OPEN_TARGETS = "|home|catalog|library|profile|";
    /** With {@link #ACTION_CONTINUE}: start read-aloud once the book is open. */
    public static final String EXTRA_START_TTS = "startTts";
    /** Widgets: open a book's page; extras bookId, title, author, ext. */
    public static final String ACTION_BOOK = "ru.inpx.bookreader.action.BOOK";

    private static JSObject pending;

    public static void capture(Intent intent) {
        capture(null, intent);
    }

    public static void capture(Context context, Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        Uri data = intent.getData();
        JSObject obj = new JSObject();

        if (ACTION_CONTINUE.equals(action)) {
            obj.put("action", "continue");
            String bookId = intent.getStringExtra(ContinueReadingWidgetProvider.KEY_BOOK_ID);
            if ((bookId == null || bookId.isEmpty()) && context != null) {
                SharedPreferences prefs = context.getSharedPreferences(
                    ContinueReadingWidgetProvider.PREFS_NAME,
                    Context.MODE_PRIVATE
                );
                bookId = prefs.getString(ContinueReadingWidgetProvider.KEY_BOOK_ID, "");
            }
            if (bookId != null && !bookId.isEmpty()) {
                obj.put("bookId", bookId);
            }
            if (intent.getBooleanExtra(EXTRA_START_TTS, false)) {
                obj.put("startTts", true);
            }
        } else if (ACTION_BOOK.equals(action)) {
            String bookId = intent.getStringExtra(ContinueReadingWidgetProvider.KEY_BOOK_ID);
            if (bookId == null || bookId.isEmpty()) return;
            obj.put("action", "book");
            obj.put("bookId", bookId);
            obj.put("title", stringExtra(intent, "title"));
            obj.put("author", stringExtra(intent, "author"));
            obj.put("ext", stringExtra(intent, "ext"));
        } else if (ACTION_OPEN.equals(action)) {
            String target = intent.getStringExtra(EXTRA_TARGET);
            if (target == null || !OPEN_TARGETS.contains("|" + target + "|")) return;
            obj.put("action", "open");
            obj.put("target", target);
        } else if (Intent.ACTION_VIEW.equals(action) && data != null) {
            String scheme = data.getScheme();
            if ("inpx".equals(scheme)) {
                String host = data.getHost();
                String path = data.getPath();
                if ("action".equals(host) && "/continue".equals(path)) {
                    obj.put("action", "continue");
                    if (context != null) {
                        SharedPreferences prefs = context.getSharedPreferences(
                            ContinueReadingWidgetProvider.PREFS_NAME,
                            Context.MODE_PRIVATE
                        );
                        String bookId = prefs.getString(ContinueReadingWidgetProvider.KEY_BOOK_ID, "");
                        if (bookId != null && !bookId.isEmpty()) {
                            obj.put("bookId", bookId);
                        }
                    }
                } else {
                    return;
                }
            } else if ("content".equals(scheme) || "file".equals(scheme)) {
                obj.put("action", "view");
                obj.put("uri", data.toString());
                String mime = intent.getType();
                if (mime != null) obj.put("mimeType", mime);
            } else {
                return;
            }
        } else {
            return;
        }

        pending = obj;
    }

    private static String stringExtra(Intent intent, String key) {
        String value = intent.getStringExtra(key);
        return value != null ? value : "";
    }

    /**
     * Deliver to live JS listeners only. Do not clear when nobody is listening yet —
     * cold-start widget/VIEW must survive until {@link #consumePending} from JS.
     */
    public void deliverPending() {
        if (pending == null) return;
        if (!hasListeners("launchIntent")) return;
        notifyListeners("launchIntent", pending);
        pending = null;
    }

    @PluginMethod
    public void consumePending(PluginCall call) {
        if (pending == null) {
            call.resolve(new JSObject());
            return;
        }
        call.resolve(pending);
        pending = null;
    }

    @Override
    public void load() {
        super.load();
        deliverPending();
    }
}
