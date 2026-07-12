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

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
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

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), DownloadForegroundService.class);
        getContext().stopService(intent);
        call.resolve();
    }
}
