package ru.inpx.bookreader;

import android.content.Intent;
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
        if (intent == null) return;

        String action = intent.getAction();
        Uri data = intent.getData();
        JSObject obj = new JSObject();

        if (ACTION_CONTINUE.equals(action)) {
            obj.put("action", "continue");
        } else if (Intent.ACTION_VIEW.equals(action) && data != null) {
            String scheme = data.getScheme();
            if ("inpx".equals(scheme)) {
                String host = data.getHost();
                String path = data.getPath();
                if ("action".equals(host) && "/continue".equals(path)) {
                    obj.put("action", "continue");
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

    public void deliverPending() {
        if (pending == null) return;
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
