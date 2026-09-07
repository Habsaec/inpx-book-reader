package ru.inpx.bookreader;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.JSONArray;
import org.json.JSONObject;

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
    private static final String LATEST_PAGE_URL =
        "https://github.com/Habsaec/inpx-book-reader/releases/latest";
    private static final String RELEASES_ATOM_URL =
        "https://github.com/Habsaec/inpx-book-reader/releases.atom";
    private static final String USER_AGENT = "INPX-Book-Reader";
    private static final Pattern RELEASE_TAG =
        Pattern.compile("releases/tag/(v?\\d+\\.\\d+\\.\\d+)");
    private static final Pattern ATOM_TAG =
        Pattern.compile("Repository/\\d+/(v?\\d+\\.\\d+\\.\\d+)");
    private static final int CHECK_TIMEOUT_MS = 13_000;

    private final ExecutorService executor = Executors.newCachedThreadPool();

    /**
     * Не api.github.com: в ряде сетей (в т.ч. RU) API висит на DNS, а github.com открывается.
     * Жёсткий Future-таймаут, потому что connectTimeout не включает DNS.
     */
    @PluginMethod
    public void checkLatest(PluginCall call) {
        executor.execute(() -> {
            Future<String> future = executor.submit(this::fetchLatestReleaseJson);
            try {
                String json = future.get(CHECK_TIMEOUT_MS, TimeUnit.MILLISECONDS);
                JSObject ret = new JSObject();
                ret.put("json", json);
                call.resolve(ret);
            } catch (TimeoutException e) {
                future.cancel(true);
                call.reject("Нет доступа к GitHub. Проверьте сеть или VPN.");
            } catch (Exception e) {
                Throwable cause = e.getCause() != null ? e.getCause() : e;
                String msg = cause.getMessage();
                call.reject(
                    msg != null && !msg.isEmpty() ? msg : "Нет доступа к GitHub. Проверьте сеть или VPN.",
                    cause instanceof Exception ? (Exception) cause : e
                );
            }
        });
    }

    private String fetchLatestReleaseJson() throws Exception {
        String tag = tagFromLatestRedirect();
        if (tag == null) tag = tagFromAtomFeed();
        if (tag == null) {
            throw new Exception("Нет доступа к GitHub. Проверьте сеть или VPN.");
        }
        return releaseJson(tag);
    }

    private static String tagFromLatestRedirect() {
        HttpURLConnection conn = null;
        try {
            conn = openGet(LATEST_PAGE_URL, false);
            int code = conn.getResponseCode();
            String loc = conn.getHeaderField("Location");
            String tag = parseTag(loc);
            if (tag != null) return tag;
            tag = parseTag(conn.getURL().toString());
            if (tag != null) return tag;
            if (code >= 200 && code < 300) {
                return parseTag(readUtf8(conn.getInputStream(), 32_768));
            }
            return null;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String tagFromAtomFeed() {
        HttpURLConnection conn = null;
        try {
            conn = openGet(RELEASES_ATOM_URL, true);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;
            String body = readUtf8(conn.getInputStream(), 65_536);
            Matcher atom = ATOM_TAG.matcher(body);
            if (atom.find()) return atom.group(1);
            return parseTag(body);
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static HttpURLConnection openGet(String url, boolean followRedirects) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(6_000);
        conn.setReadTimeout(6_000);
        conn.setInstanceFollowRedirects(followRedirects);
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent", USER_AGENT);
        conn.setRequestProperty("Accept", "*/*");
        return conn;
    }

    private static String parseTag(String value) {
        if (value == null || value.isEmpty()) return null;
        Matcher m = RELEASE_TAG.matcher(value);
        return m.find() ? m.group(1) : null;
    }

    private static String releaseJson(String tag) throws Exception {
        String canonical = tag.startsWith("v") || tag.startsWith("V") ? tag : "v" + tag;
        String version = canonical.substring(1);
        String apkName = "INPX.Book.Reader." + version + ".apk";
        String apkUrl =
            "https://github.com/Habsaec/inpx-book-reader/releases/download/" + canonical + "/" + apkName;
        JSONArray assets = new JSONArray();
        // -1: сеть не ответила — считаем, что APK есть; 0/404: ассет ещё не приложен к релизу.
        long apkSize = probeAssetSize(apkUrl);
        if (apkSize != 0) {
            JSONObject apk = new JSONObject();
            apk.put("name", apkName);
            apk.put("size", Math.max(0, apkSize));
            apk.put("browser_download_url", apkUrl);
            assets.put(apk);
        }
        JSONObject release = new JSONObject();
        release.put("tag_name", canonical);
        release.put("html_url", "https://github.com/Habsaec/inpx-book-reader/releases/tag/" + canonical);
        release.put("assets", assets);
        release.put("body", "");
        return release.toString();
    }

    /** HEAD по ссылке ассета: >0 — размер, 0 — нет файла (404), -1 — не удалось проверить. */
    private static long probeAssetSize(String url) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(6_000);
            conn.setReadTimeout(6_000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestMethod("HEAD");
            conn.setRequestProperty("User-Agent", USER_AGENT);
            int code = conn.getResponseCode();
            if (code == 404) return 0;
            if (code < 200 || code >= 300) return -1;
            long len = conn.getContentLengthLong();
            return len > 0 ? len : -1;
        } catch (Exception e) {
            return -1;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readUtf8(InputStream stream, int maxChars) throws Exception {
        if (stream == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            char[] buf = new char[4096];
            int n;
            while ((n = reader.read(buf)) != -1) {
                int room = maxChars - sb.length();
                if (room <= 0) break;
                sb.append(buf, 0, Math.min(n, room));
            }
        }
        return sb.toString();
    }

    private File apkFile() {
        return new File(new File(getContext().getCacheDir(), UPDATE_DIR), APK_NAME);
    }

    private static boolean isAllowedUrl(String url) {
        return url.startsWith("https://github.com/")
            || url.startsWith("https://objects.githubusercontent.com/")
            || url.startsWith("https://release-assets.githubusercontent.com/")
            || url.startsWith("https://github-releases.githubusercontent.com/");
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
