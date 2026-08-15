package ru.inpx.bookreader;

import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DownloadNotification")
public class DownloadNotificationPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "Загрузка книг");
        String text = call.getString("text", "Подготовка…");
        int progress = call.getInt("progress", 0);
        boolean indeterminate = call.getBoolean("indeterminate", false);

        Intent intent = new Intent(getContext(), DownloadForegroundService.class);
        intent.putExtra(DownloadForegroundService.EXTRA_TITLE, title);
        intent.putExtra(DownloadForegroundService.EXTRA_TEXT, text);
        intent.putExtra(DownloadForegroundService.EXTRA_PROGRESS, progress);
        intent.putExtra(DownloadForegroundService.EXTRA_INDETERMINATE, indeterminate);

        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to start download notification", e);
        }
    }

    @PluginMethod
    public void update(PluginCall call) {
        String title = call.getString("title", "Загрузка книг");
        String text = call.getString("text", "");
        int progress = call.getInt("progress", 0);
        boolean indeterminate = call.getBoolean("indeterminate", false);

        Intent intent = new Intent(getContext(), DownloadForegroundService.class);
        intent.putExtra(DownloadForegroundService.EXTRA_TITLE, title);
        intent.putExtra(DownloadForegroundService.EXTRA_TEXT, text);
        intent.putExtra(DownloadForegroundService.EXTRA_PROGRESS, progress);
        intent.putExtra(DownloadForegroundService.EXTRA_INDETERMINATE, indeterminate);

        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to update download notification", e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), DownloadForegroundService.class);
        getContext().stopService(intent);
        call.resolve();
    }
}
