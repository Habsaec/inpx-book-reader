package ru.inpx.bookreader;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * In-app APK update: stream a GitHub release APK into app-private cache and
 * hand it to the system package installer via FileProvider.
 *
 * Deliberately separate from BookStoragePlugin: that download path is tuned for
 * small images (5 MB cap, image cache trimming), an APK is ~50 MB.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final long MAX_APK_BYTES = 300L * 1024L * 1024L;
    private static final String UPDATE_DIR = "app-update";
    private static final String APK_NAME = "update.apk";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private File apkFile() {
        return new File(new File(getContext().getCacheDir(), UPDATE_DIR), APK_NAME);
    }

    private static boolean isAllowedUrl(String url) {
        return url.startsWith("https://github.com/")
            || url.startsWith("https://objects.githubusercontent.com/");
    }

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !isAllowedUrl(url)) {
            call.reject("Invalid url");
            return;
        }
        executor.execute(() -> {
            HttpURLConnection conn = null;
            File file = apkFile();
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(20_000);
                conn.setReadTimeout(120_000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("Accept", "application/octet-stream");
                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    throw new Exception("HTTP " + code);
                }
                long total = conn.getContentLengthLong();
                File parent = file.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) {
                    throw new Exception("Could not create update directory");
                }
                long written = 0;
                long lastNotify = 0;
                try (
                    InputStream in = conn.getInputStream();
                    FileOutputStream out = new FileOutputStream(file)
                ) {
                    byte[] buf = new byte[65536];
                    int read;
                    while ((read = in.read(buf)) != -1) {
                        written += read;
                        if (written > MAX_APK_BYTES) {
                            throw new Exception("APK too large");
                        }
                        out.write(buf, 0, read);
                        long now = System.currentTimeMillis();
                        if (now - lastNotify >= 200) {
                            lastNotify = now;
                            JSObject progress = new JSObject();
                            progress.put("loaded", written);
                            progress.put("total", total);
                            notifyListeners("apkDownloadProgress", progress);
                        }
                    }
                    out.flush();
                }
                if (written < 1024) {
                    throw new Exception("Downloaded file is empty");
                }
                JSObject progress = new JSObject();
                progress.put("loaded", written);
                progress.put("total", total);
                notifyListeners("apkDownloadProgress", progress);
                JSObject ret = new JSObject();
                ret.put("bytesWritten", written);
                call.resolve(ret);
            } catch (Exception e) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : "Download failed", e);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        try {
            File file = apkFile();
            if (!file.exists() || file.length() < 1024) {
                call.reject("APK not downloaded");
                return;
            }
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }
}
