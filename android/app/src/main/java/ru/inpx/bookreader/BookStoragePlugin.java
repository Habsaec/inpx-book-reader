package ru.inpx.bookreader;

import android.util.Base64;
import android.os.Environment;
import android.os.StatFs;
import java.io.File;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BookStorage")
public class BookStoragePlugin extends Plugin {

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
}
