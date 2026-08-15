package ru.inpx.bookreader;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FolderPicker")
public class FolderPickerPlugin extends Plugin {

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("cancelled");
            return;
        }

        try {
            int takeFlags =
                result.getData().getFlags()
                    & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (takeFlags == 0) {
                takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            }
            getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);
        } catch (Exception e) {
            call.reject("Не удалось закрепить постоянный доступ к папке. Выберите другую папку.");
            return;
        }

        boolean persisted = false;
        for (android.content.UriPermission perm : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (perm.getUri().equals(uri) && perm.isReadPermission() && perm.isWritePermission()) {
                persisted = true;
                break;
            }
        }
        if (!persisted) {
            try {
                getContext().getContentResolver().releasePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
            } catch (Exception ignored) { /* best-effort */ }
            call.reject("Система не сохранила доступ к папке. Выберите папку ещё раз.");
            return;
        }

        DocumentFile directory = DocumentFile.fromTreeUri(getContext(), uri);
        if (directory == null || !directory.exists() || !directory.canRead() || !directory.canWrite()) {
            try {
                getContext().getContentResolver().releasePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
            } catch (Exception ignored) { /* best-effort */ }
            call.reject("Нет доступа на чтение и запись в выбранную папку");
            return;
        }

        String label = directory.getName();
        if (label == null || label.isEmpty()) {
            label = "Папка";
        }

        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("label", label);
        call.resolve(ret);
    }
}
