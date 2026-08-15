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
