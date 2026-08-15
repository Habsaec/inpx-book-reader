package ru.inpx.bookreader;

import android.util.Base64;
import android.os.Environment;
import android.os.StatFs;
import java.io.File;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BookStorage")
public class BookStoragePlugin extends Plugin {

    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void handleOnDestroy() {
        downloadExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    private static JSObject headersFromCall(PluginCall call) {
        JSObject headersObj = call.getObject("headers");
        JSObject out = new JSObject();
        if (headersObj == null) return out;
        Iterator<String> keys = headersObj.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String value = headersObj.getString(key);
            if (key != null && value != null) {
                out.put(key, value);
            }
        }
        return out;
    }

    private static java.util.Map<String, String> headersMap(JSObject headersObj) {
        java.util.HashMap<String, String> map = new java.util.HashMap<>();
        if (headersObj == null) return map;
        Iterator<String> keys = headersObj.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String value = headersObj.getString(key);
            if (key != null && value != null) {
                map.put(key, value);
            }
        }
        return map;
    }

    @PluginMethod
    public void getDefaultStorageDirectory(PluginCall call) {
        try {
            String uri = BookStorageAccess.ensureDefaultStorageUri(getContext());
            JSObject ret = new JSObject();
            ret.put("uri", uri);
            ret.put("label", BookStorageAccess.DEFAULT_LABEL);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void checkAccess(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            if (treeUri == null || treeUri.trim().isEmpty()) {
                call.reject("Missing treeUri");
                return;
            }
            boolean ok = BookStorageAccess.hasStorageAccess(getContext(), treeUri);
            JSObject ret = new JSObject();
            ret.put("ok", ok);
            if (!ok) {
                ret.put("code", "REVOKED");
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void fileExists(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            String path = call.getString("path");
            if (treeUri == null || path == null) {
                call.reject("Missing arguments");
                return;
            }
            boolean exists = BookStorageAccess.fileExists(getContext(), treeUri, path);
            JSObject ret = new JSObject();
            ret.put("exists", exists);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void writeBinaryFile(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            String path = call.getString("path");
            String data = call.getString("data");
            if (treeUri == null || path == null || data == null) {
                call.reject("Missing arguments");
                return;
            }

            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            BookStorageAccess.writeBinaryFile(getContext(), treeUri, path, bytes);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void writeTextFile(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            String path = call.getString("path");
            String content = call.getString("content");
            if (treeUri == null || path == null || content == null) {
                call.reject("Missing arguments");
                return;
            }

            BookStorageAccess.writeTextFile(getContext(), treeUri, path, content);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readTextFile(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            String path = call.getString("path");
            if (treeUri == null || path == null) {
                call.reject("Missing arguments");
                return;
            }

            String content = BookStorageAccess.readTextFile(getContext(), treeUri, path);
            JSObject ret = new JSObject();
            ret.put("content", content);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readBinaryFile(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            String path = call.getString("path");
            if (treeUri == null || path == null) {
                call.reject("Missing arguments");
                return;
            }

            byte[] bytes = BookStorageAccess.readBinaryFile(getContext(), treeUri, path);
            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (OutOfMemoryError oom) {
            call.reject("Файл слишком большой, чтобы прочитать его целиком");
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            String path = call.getString("path");
            if (treeUri == null || path == null) {
                call.reject("Missing arguments");
                return;
            }

            BookStorageAccess.deleteFile(getContext(), treeUri, path);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void importContentUri(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            String contentUri = call.getString("contentUri");
            if (treeUri == null || contentUri == null) {
                call.reject("Missing arguments");
                return;
            }
            String path = BookStorageAccess.importContentUri(getContext(), treeUri, contentUri);
            JSObject ret = new JSObject();
            ret.put("relativePath", path);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getAvailableBytes(PluginCall call) {
        try {
            File path = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (path == null || (!path.exists() && !path.mkdirs())) {
                path = Environment.getDataDirectory();
            }
            StatFs stat = new StatFs(path.getPath());
            long bytes = stat.getAvailableBlocksLong() * stat.getBlockSizeLong();
            JSObject ret = new JSObject();
            ret.put("bytes", bytes);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    /** App-private cover/portrait cache (files/image-cache), not SAF. */
    @PluginMethod
    public void appCacheFileExists(PluginCall call) {
        try {
            String path = call.getString("path");
            if (path == null) {
                call.reject("Missing path");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("exists", BookStorageAccess.appCacheFileExists(getContext(), path));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void writeAppCacheFile(PluginCall call) {
        try {
            String path = call.getString("path");
            String data = call.getString("data");
            if (path == null || data == null) {
                call.reject("Missing arguments");
                return;
            }
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            BookStorageAccess.writeAppCacheFile(getContext(), path, bytes);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readAppCacheFile(PluginCall call) {
        try {
            String path = call.getString("path");
            if (path == null) {
                call.reject("Missing path");
                return;
            }
            byte[] bytes = BookStorageAccess.readAppCacheFile(getContext(), path);
            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void deleteAppCacheFile(PluginCall call) {
        try {
            String path = call.getString("path");
            if (path == null) {
                call.reject("Missing path");
                return;
            }
            BookStorageAccess.deleteAppCacheFile(getContext(), path);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getAppCacheFilePath(PluginCall call) {
        try {
            String path = call.getString("path");
            if (path == null) {
                call.reject("Missing path");
                return;
            }
            String absolutePath = BookStorageAccess.getAppCacheAbsolutePath(getContext(), path);
            JSObject ret = new JSObject();
            ret.put("absolutePath", absolutePath);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void downloadUrlToAppCache(PluginCall call) {
        try {
            String url = call.getString("url");
            String path = call.getString("path");
            if (url == null || path == null) {
                call.reject("Missing arguments");
                return;
            }
            BookStorageAccess.StorageDownloadResult result = BookStorageAccess.downloadUrlToAppCache(
                getContext(),
                url,
                path,
                headersMap(headersFromCall(call))
            );
            JSObject ret = new JSObject();
            ret.put("bytesWritten", result.bytesWritten);
            ret.put("digestSha256", result.digestSha256);
            ret.put("statusCode", result.statusCode);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void downloadUrlToStorage(PluginCall call) {
        String url = call.getString("url");
        String treeUri = call.getString("treeUri");
        String path = call.getString("path");
        String jobId = call.getString("jobId");
        if (url == null || treeUri == null || path == null) {
            call.reject("Missing arguments");
            return;
        }
        final java.util.Map<String, String> headers = headersMap(headersFromCall(call));
        downloadExecutor.execute(() -> {
            try {
                BookStorageAccess.StorageDownloadResult result = BookStorageAccess.downloadUrlToStorage(
                    getContext(),
                    url,
                    treeUri,
                    path,
                    headers,
                    jobId,
                    (loaded, total) -> {
                        JSObject progress = new JSObject();
                        progress.put("jobId", jobId != null ? jobId : "");
                        progress.put("loaded", loaded);
                        progress.put("total", total);
                        notifyListeners("storageDownloadProgress", progress);
                    }
                );
                JSObject ret = new JSObject();
                ret.put("bytesWritten", result.bytesWritten);
                ret.put("digestSha256", result.digestSha256);
                ret.put("statusCode", result.statusCode);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void cancelStorageDownload(PluginCall call) {
        String jobId = call.getString("jobId");
        BookStorageAccess.cancelActiveDownload(jobId);
        call.resolve();
    }

    /**
     * SAF tree the user already granted (even if JS forgot it and fell back to downloads://).
     */
    @PluginMethod
    public void getPersistedDownloadsTree(PluginCall call) {
        String folder = call.getString("folder");
        if (folder == null || folder.isEmpty()) {
            folder = "INPXLibraryReader";
        }
        JSObject ret = new JSObject();
        String tree = BookStorageAccess.findPersistedDownloadsTree(getContext(), folder);
        ret.put("uri", tree);
        call.resolve(ret);
    }

    /**
     * Абсолютный путь файла для downloads-backed деревьев — читалка может тянуть
     * большие книги через Capacitor file-URL без base64-копий через мост (OOM).
     */
    @PluginMethod
    public void getStorageFilePath(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            String path = call.getString("path");
            if (treeUri == null || path == null) {
                call.reject("Missing arguments");
                return;
            }
            String absolute = null;
            String downloadsFolder = BookStorageAccess.effectiveDownloadsFolder(treeUri);
            if (downloadsFolder != null) {
                java.io.File disk = BookStorageAccess.resolveDownloadsDiskFile(downloadsFolder, path);
                if (BookStorageAccess.canReadDownloadsDiskFile(disk)) {
                    absolute = disk.getAbsolutePath();
                }
            }
            JSObject ret = new JSObject();
            ret.put("absolutePath", absolute);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    /**
     * Stream a SAF/Downloads book into app-private cache and return a disk path
     * for Capacitor.convertFileSrc — never base64 the whole file (OOM on 20+ MB).
     */
    @PluginMethod
    public void copyStorageFileToBookCache(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            String path = call.getString("path");
            if (treeUri == null || path == null) {
                call.reject("Missing arguments");
                return;
            }
            String absolute = BookStorageAccess.copyStorageFileToBookCache(getContext(), treeUri, path);
            JSObject ret = new JSObject();
            ret.put("absolutePath", absolute);
            call.resolve(ret);
        } catch (OutOfMemoryError oom) {
            call.reject("Не хватило памяти, чтобы открыть файл");
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getStorageFileInfo(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            String path = call.getString("path");
            if (treeUri == null || path == null) {
                call.reject("Missing arguments");
                return;
            }
            BookStorageAccess.StorageDownloadResult result = BookStorageAccess.computeStorageFileDigest(
                getContext(),
                treeUri,
                path
            );
            JSObject ret = new JSObject();
            ret.put("size", result.bytesWritten);
            ret.put("digestSha256", result.digestSha256);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readStorageFileHeader(PluginCall call) {
        try {
            String treeUri = call.getString("treeUri");
            String path = call.getString("path");
            Integer maxBytes = call.getInt("maxBytes", 8);
            if (treeUri == null || path == null) {
                call.reject("Missing arguments");
                return;
            }
            byte[] header = BookStorageAccess.readStorageFileHeader(
                getContext(),
                treeUri,
                path,
                maxBytes != null ? maxBytes : 8
            );
            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(header, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }
}
