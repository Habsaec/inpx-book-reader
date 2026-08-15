package ru.inpx.bookreader;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import androidx.annotation.RequiresApi;
import androidx.documentfile.provider.DocumentFile;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import android.os.ParcelFileDescriptor;
import java.nio.charset.StandardCharsets;

public final class BookStorageAccess {

    public static final String DEFAULT_LABEL = "Download/INPXLibraryReader";
    private static final String DOWNLOADS_SCHEME = "downloads://";

    private BookStorageAccess() {}

    public static String ensureDefaultStorageUri(Context context) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                ensureDownloadsPlaceholder(context, "INPXLibraryReader");
            } catch (Exception ignored) {
                // Placeholder is optional; writes create files via MediaStore anyway.
            }
            return DOWNLOADS_SCHEME + "INPXLibraryReader";
        }

        File dir = getLegacyDownloadsDir();
        if (!dir.exists() && !dir.mkdirs()) {
            throw new Exception("Could not create storage directory");
        }
        return "file://" + dir.getAbsolutePath();
    }

    /**
     * Whether the app still has usable access to the storage URI.
     * For content:// trees: require persistable read+write permission and a live DocumentFile root.
     * Download/* SAF trees on Q+ are served via MediaStore and do not need a live SAF grant.
     */
    public static boolean hasStorageAccess(Context context, String storageUri) {
        if (storageUri == null || storageUri.trim().isEmpty()) {
            return false;
        }
        try {
            if (isDownloadsUri(storageUri)) {
                return true;
            }
            if (isFileUri(storageUri)) {
                File dir = new File(Uri.parse(storageUri).getPath());
                return dir.isDirectory() && dir.canRead() && dir.canWrite();
            }
            if (!storageUri.startsWith("content://")) {
                return false;
            }
            Uri uri = Uri.parse(storageUri);
            if (!hasPersistedTreePermission(context, uri)) {
                return false;
            }
            DocumentFile root = DocumentFile.fromTreeUri(context, uri);
            return root != null && root.exists() && root.canRead() && root.canWrite();
        } catch (SecurityException se) {
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    /** Match persisted grant for tree URI, document URI, or shared tree document id. */
    private static boolean hasPersistedTreePermission(Context context, Uri uri) {
        String wantTreeId = null;
        try {
            wantTreeId = DocumentsContract.getTreeDocumentId(uri);
        } catch (Exception ignored) {
            /* not a tree URI */
        }
        for (android.content.UriPermission perm : context.getContentResolver().getPersistedUriPermissions()) {
            if (!perm.isReadPermission() || !perm.isWritePermission()) continue;
            Uri permUri = perm.getUri();
            if (permUri.equals(uri)) return true;
            // Tree document id equality only — never string prefix (Download vs Downloads).
            if (wantTreeId != null) {
                try {
                    if (wantTreeId.equals(DocumentsContract.getTreeDocumentId(permUri))) return true;
                } catch (Exception ignored) {
                    /* perm not a tree URI */
                }
            }
        }
        return false;
    }

    private static Exception permissionRevokedError() {
        return new Exception("PERMISSION_REVOKED: доступ к папке отозван. Выберите папку в настройках.");
    }

    private static Exception asStorageError(Exception e) {
        if (e instanceof SecurityException) {
            return permissionRevokedError();
        }
        String msg = e.getMessage();
        if (msg != null && (msg.startsWith("PERMISSION_REVOKED") || msg.contains("Permission Denial"))) {
            return permissionRevokedError();
        }
        return e;
    }

    /** Fail fast when Android revoked a persisted SAF tree grant. */
    private static void requireStorageAccess(Context context, String storageUri) throws Exception {
        if (storageUri == null || storageUri.trim().isEmpty()) {
            return;
        }
        if (isDownloadsUri(storageUri) || isFileUri(storageUri)) {
            return;
        }
        if (storageUri.startsWith("content://") && !hasStorageAccess(context, storageUri)) {
            throw permissionRevokedError();
        }
    }

    private static File getLegacyDownloadsDir() {
        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        return new File(downloads, "INPXLibraryReader");
    }

    private static boolean canUseDownloadsVolume(String storageUri) {
        return isDownloadsUri(storageUri) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static void ensureDownloadsPlaceholder(Context context, String folderName) throws Exception {
        String relativePath = Environment.DIRECTORY_DOWNLOADS + "/" + folderName + "/";
        ContentResolver resolver = context.getContentResolver();
        String selection =
            MediaStore.MediaColumns.RELATIVE_PATH + "=? AND "
                + MediaStore.MediaColumns.DISPLAY_NAME + "=?";
        String[] args = new String[] { relativePath, ".inpx-reader" };

        try (Cursor cursor = resolver.query(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            new String[] { MediaStore.MediaColumns._ID },
            selection,
            args,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                return;
            }
        }

        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, ".inpx-reader");
        values.put(MediaStore.MediaColumns.MIME_TYPE, "text/plain");
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new Exception("Could not initialize storage directory");
        }
    }

    public static boolean fileExists(Context context, String storageUri, String path) throws Exception {
        requireStorageAccess(context, storageUri);
        // Prefer DocumentsContract for SAF trees — DocumentFile.findFile is flaky on some OEMs/emulators.
        if (storageUri != null && storageUri.startsWith("content://")) {
            if (safDocumentExists(context, storageUri, path)) {
                return true;
            }
        }
        String downloadsFolder = effectiveDownloadsFolder(storageUri);
        if (downloadsFolder != null) {
            if (resolveDownloadsUri(context, downloadsFolder, path) != null) {
                return true;
            }
            if (persistedDownloadsFileExists(context, downloadsFolder, path)) {
                return true;
            }
            File disk = resolveDownloadsDiskFile(downloadsFolder, path);
            return canReadDownloadsDiskFile(disk);
        }
        if (isFileUri(storageUri)) {
            File file = resolveLegacyFile(storageUri, path, false);
            return file.exists();
        }
        DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(storageUri));
        DocumentFile file = resolveSafPath(root, path, false);
        return file != null && file.exists();
    }

    public static byte[] readBinaryFile(Context context, String storageUri, String path) throws Exception {
        requireStorageAccess(context, storageUri);
        Exception last = null;
        if (storageUri != null && storageUri.startsWith("content://")) {
            try {
                Uri doc = buildSafChildUri(storageUri, path);
                if (doc != null) {
                    try (InputStream in = context.getContentResolver().openInputStream(doc)) {
                        if (in != null) {
                            return readStreamBytes(in);
                        }
                    }
                }
            } catch (Exception e) {
                last = asStorageError(e);
            }
            try {
                return readSafBinary(context, storageUri, path);
            } catch (Exception e) {
                last = asStorageError(e);
            }
        }
        String downloadsFolder = effectiveDownloadsFolder(storageUri);
        if (downloadsFolder != null) {
            try {
                return readDownloadsBinary(context, downloadsFolder, path);
            } catch (Exception e) {
                if (last != null) e.addSuppressed(last);
                throw e;
            }
        }
        if (isFileUri(storageUri)) {
            return readLegacyBinary(storageUri, path);
        }
        if (last != null) throw last;
        throw new Exception("File not found");
    }

    public static String readTextFile(Context context, String storageUri, String path) throws Exception {
        requireStorageAccess(context, storageUri);
        Exception last = null;
        if (storageUri != null && storageUri.startsWith("content://")) {
            try {
                Uri doc = buildSafChildUri(storageUri, path);
                if (doc != null) {
                    InputStream raw = context.getContentResolver().openInputStream(doc);
                    if (raw != null) {
                        return readUtf8Stream(raw);
                    }
                }
            } catch (Exception e) {
                last = asStorageError(e);
            }
            try {
                return readSafText(context, storageUri, path);
            } catch (Exception e) {
                last = asStorageError(e);
            }
        }
        String downloadsFolder = effectiveDownloadsFolder(storageUri);
        if (downloadsFolder != null) {
            try {
                return readDownloadsText(context, downloadsFolder, path);
            } catch (Exception e) {
                if (last != null) e.addSuppressed(last);
                throw asStorageError(e);
            }
        }
        if (isFileUri(storageUri)) {
            return readLegacyText(storageUri, path);
        }
        if (last != null) throw last;
        throw new Exception("File not found");
    }

    public static void writeBinaryFile(Context context, String storageUri, String path, byte[] bytes)
        throws Exception {
        requireStorageAccess(context, storageUri);
        String downloadsFolder = effectiveDownloadsFolder(storageUri);
        if (downloadsFolder != null) {
            writeDownloadsFile(context, downloadsFolder, path, bytes, mimeForPath(path));
            return;
        }
        if (isFileUri(storageUri)) {
            writeLegacyFile(storageUri, path, bytes);
            return;
        }
        try {
            writeSafBinaryFile(context, storageUri, path, bytes);
        } catch (SecurityException se) {
            throw permissionRevokedError();
        } catch (Exception safErr) {
            // Only fall back to MediaStore for trees that map under Download/*.
            String fallbackFolder = downloadsFolderFromSafUri(storageUri);
            if (fallbackFolder != null) {
                writeDownloadsFile(context, fallbackFolder, path, bytes, mimeForPath(path));
                return;
            }
            if (!hasStorageAccess(context, storageUri)) {
                throw permissionRevokedError();
            }
            throw safErr;
        }
    }

    public static void writeTextFile(Context context, String storageUri, String path, String content)
        throws Exception {
        requireStorageAccess(context, storageUri);
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        String downloadsFolder = effectiveDownloadsFolder(storageUri);
        if (downloadsFolder != null) {
            writeDownloadsFile(context, downloadsFolder, path, bytes, mimeForPath(path));
            return;
        }
        if (isFileUri(storageUri)) {
            writeLegacyFile(storageUri, path, bytes);
            return;
        }
        try {
            writeSafTextFile(context, storageUri, path, bytes);
        } catch (SecurityException se) {
            throw permissionRevokedError();
        } catch (Exception safErr) {
            String fallbackFolder = downloadsFolderFromSafUri(storageUri);
            if (fallbackFolder != null) {
                writeDownloadsFile(context, fallbackFolder, path, bytes, mimeForPath(path));
                return;
            }
            if (!hasStorageAccess(context, storageUri)) {
                throw permissionRevokedError();
            }
            throw safErr;
        }
    }

    public static void deleteFile(Context context, String storageUri, String path) throws Exception {
        requireStorageAccess(context, storageUri);
        String downloadsFolder = effectiveDownloadsFolder(storageUri);
        if (downloadsFolder != null) {
            deleteDownloadsFile(context, downloadsFolder, path);
            return;
        }
        if (isFileUri(storageUri)) {
            deleteLegacyFile(storageUri, path);
            return;
        }
        try {
            deleteSafFile(context, storageUri, path);
        } catch (SecurityException se) {
            throw permissionRevokedError();
        } catch (Exception safErr) {
            // Only MediaStore-delete when this tree maps under Download/* — never nuke default library.
            String fallbackFolder = downloadsFolderFromSafUri(storageUri);
            if (fallbackFolder != null) {
                deleteDownloadsFile(context, fallbackFolder, path);
                return;
            }
            if (!hasStorageAccess(context, storageUri)) {
                throw permissionRevokedError();
            }
            throw safErr;
        }
    }

    private static boolean isDownloadsUri(String storageUri) {
        return storageUri != null && storageUri.startsWith(DOWNLOADS_SCHEME);
    }

    private static boolean isFileUri(String storageUri) {
        return storageUri != null && storageUri.startsWith("file://");
    }

    private static String baseFolder(String storageUri) {
        return storageUri.substring(DOWNLOADS_SCHEME.length());
    }

    /**
     * SAF tree under Download/&lt;folder&gt; → folder name for MediaStore/disk path.
     * Example: content://.../tree/primary%3ADownload%2FINPXLibraryReader
     */
    private static String downloadsFolderFromSafUri(String storageUri) {
        if (storageUri == null || !storageUri.startsWith("content://")) {
            return null;
        }
        try {
            Uri uri = Uri.parse(storageUri);
            String last = uri.getLastPathSegment();
            if (last == null || last.isEmpty()) {
                return null;
            }
            String docId = Uri.decode(last);
            if (docId.startsWith("primary:")) {
                docId = docId.substring("primary:".length());
            }
            while (docId.endsWith("/")) {
                docId = docId.substring(0, docId.length() - 1);
            }
            String downloads = Environment.DIRECTORY_DOWNLOADS;
            if (docId.equals(downloads) || docId.equalsIgnoreCase("Download")) {
                return "INPXLibraryReader";
            }
            String prefix = downloads + "/";
            if (docId.startsWith(prefix)) {
                return docId.substring(prefix.length());
            }
            if (docId.toLowerCase(Locale.US).startsWith("download/")) {
                return docId.substring("download/".length());
            }
        } catch (Exception ignored) {
            /* not a Downloads tree */
        }
        return null;
    }

    static String effectiveDownloadsFolder(String storageUri) {
        if (canUseDownloadsVolume(storageUri)) {
            return baseFolder(storageUri);
        }
        // A content:// Download tree carries a persisted SAF grant. Keep using
        // that URI; mapping it back to MediaStore discards the granted access
        // and fails with EACCES after reinstall / ownership changes.
        return null;
    }

    /** Persisted SAF tree that covers Download/&lt;baseFolder&gt; — survives reinstall ownership loss. */
    static String findPersistedDownloadsTree(Context context, String baseFolder) {
        if (context == null || baseFolder == null || baseFolder.isEmpty()) return null;
        for (android.content.UriPermission perm : context.getContentResolver().getPersistedUriPermissions()) {
            if (!perm.isReadPermission()) continue;
            Uri uri = perm.getUri();
            if (uri == null) continue;
            String tree = uri.toString();
            String folder = downloadsFolderFromSafUri(tree);
            if (folder == null) continue;
            if (folder.equals(baseFolder) || folder.startsWith(baseFolder + "/")) {
                return tree;
            }
        }
        return null;
    }

    /**
     * Relative path under a persisted Download tree. Picking {@code Download} itself
     * (not the library subfolder) requires prefixing {@code INPXLibraryReader/}.
     */
    private static String safRelativePathForDownloadsTree(
        String treeUri,
        String baseFolder,
        String relativePath
    ) {
        try {
            Uri uri = Uri.parse(treeUri);
            String treeId = Uri.decode(DocumentsContract.getTreeDocumentId(uri));
            if (treeId.startsWith("primary:")) {
                treeId = treeId.substring("primary:".length());
            }
            while (treeId.endsWith("/")) {
                treeId = treeId.substring(0, treeId.length() - 1);
            }
            if (
                treeId.equals(Environment.DIRECTORY_DOWNLOADS)
                || treeId.equalsIgnoreCase("Download")
            ) {
                return baseFolder + "/" + relativePath;
            }
        } catch (Exception ignored) {
            /* use relative path as-is */
        }
        return relativePath;
    }

    private static InputStream openPersistedDownloadsStream(
        Context context,
        String baseFolder,
        String relativePath
    ) throws Exception {
        String tree = findPersistedDownloadsTree(context, baseFolder);
        if (tree == null) return null;
        String safPath = safRelativePathForDownloadsTree(tree, baseFolder, relativePath);
        Uri doc = buildSafChildUri(tree, safPath);
        if (doc != null) {
            try {
                InputStream in = context.getContentResolver().openInputStream(doc);
                if (in != null) return in;
            } catch (SecurityException ignored) {
                /* try DocumentFile walk */
            }
        }
        DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(tree));
        DocumentFile file = resolveSafPath(root, safPath, false);
        if (file == null || !file.exists()) return null;
        return context.getContentResolver().openInputStream(file.getUri());
    }

    private static boolean persistedDownloadsFileExists(
        Context context,
        String baseFolder,
        String relativePath
    ) {
        String tree = findPersistedDownloadsTree(context, baseFolder);
        if (tree == null) return false;
        String safPath = safRelativePathForDownloadsTree(tree, baseFolder, relativePath);
        if (safDocumentExists(context, tree, safPath)) return true;
        try {
            DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(tree));
            DocumentFile file = resolveSafPath(root, safPath, false);
            return file != null && file.exists();
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Probe whether a public Downloads file is actually readable (not just visible). */
    static boolean canReadDownloadsDiskFile(File disk) {
        if (disk == null || !disk.isFile() || disk.length() <= 0) return false;
        try (FileInputStream in = new FileInputStream(disk)) {
            return in.read() >= -1;
        } catch (Exception e) {
            return false;
        }
    }

    /** Direct child URI under a persisted SAF tree (avoids DocumentFile.findFile). */
    private static Uri buildSafChildUri(String treeUriStr, String relativePath) {
        try {
            String safe = normalizeRelativePath(relativePath);
            Uri tree = Uri.parse(treeUriStr);
            String treeId = DocumentsContract.getTreeDocumentId(tree);
            StringBuilder docId = new StringBuilder(treeId);
            for (String part : splitPath(safe)) {
                docId.append('/').append(part);
            }
            return DocumentsContract.buildDocumentUriUsingTree(tree, docId.toString());
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean safDocumentExists(Context context, String treeUri, String relativePath) {
        try {
            Uri doc = buildSafChildUri(treeUri, relativePath);
            if (doc == null) return false;
            try (
                Cursor c = context.getContentResolver().query(
                    doc,
                    new String[] { DocumentsContract.Document.COLUMN_DOCUMENT_ID },
                    null,
                    null,
                    null
                )
            ) {
                return c != null && c.moveToFirst();
            }
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String readUtf8Stream(InputStream raw) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (
            InputStream in = raw;
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))
        ) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (sb.length() > 0) {
                    sb.append('\n');
                }
                sb.append(line);
            }
        }
        return sb.toString();
    }

    private static String downloadsRelativeDir(String baseFolder, String relativePath) throws Exception {
        String safe = normalizeRelativePath(relativePath);
        String[] parts = splitPath(safe);
        StringBuilder dir = new StringBuilder(Environment.DIRECTORY_DOWNLOADS).append('/').append(baseFolder);
        for (int i = 0; i < parts.length - 1; i++) {
            dir.append('/').append(parts[i]);
        }
        dir.append('/');
        return dir.toString();
    }

    private static String fileNameFromPath(String relativePath) throws Exception {
        String[] parts = splitPath(normalizeRelativePath(relativePath));
        return parts[parts.length - 1];
    }

    private static String[] splitPath(String relativePath) {
        return relativePath.split("/");
    }

    /** Reject empty / "." / ".." segments so paths cannot escape the library root. */
    private static String normalizeRelativePath(String relativePath) throws Exception {
        if (relativePath == null || relativePath.isEmpty() || relativePath.indexOf('\0') >= 0) {
            throw new Exception("Invalid storage path");
        }
        String normalized = relativePath.replace('\\', '/');
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        if (normalized.isEmpty()) {
            throw new Exception("Invalid storage path");
        }
        for (String part : splitPath(normalized)) {
            if (part == null || part.isEmpty() || ".".equals(part) || "..".equals(part)) {
                throw new Exception("Invalid storage path");
            }
        }
        return normalized;
    }

    /** Prefer real book MIME — octet-stream often becomes `*.fb2.bin` on OEM MediaStore. */
    private static String mimeForPath(String relativePath) {
        String n = relativePath == null ? "" : relativePath.replace('\\', '/');
        int slash = n.lastIndexOf('/');
        String name = (slash >= 0 ? n.substring(slash + 1) : n).toLowerCase(Locale.US);
        if (name.endsWith(".json")) return "application/json";
        if (name.endsWith(".epub")) return "application/epub+zip";
        if (name.endsWith(".fb2") || name.endsWith(".fbz")) return "application/x-fictionbook+xml";
        if (name.endsWith(".txt")) return "text/plain";
        if (name.endsWith(".pdf")) return "application/pdf";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }

    static File resolveDownloadsDiskFile(String baseFolder, String relativePath)
        throws Exception {
        String safe = normalizeRelativePath(relativePath);
        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        File root = new File(downloads, baseFolder);
        File file = new File(root, safe.replace('/', File.separatorChar));
        String rootPath = root.getCanonicalPath();
        String filePath = file.getCanonicalPath();
        if (!filePath.equals(rootPath) && !filePath.startsWith(rootPath + File.separator)) {
            throw new Exception("Invalid storage path");
        }
        return file;
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static Uri queryDownloadsByNameAndDir(
        ContentResolver resolver,
        Uri collection,
        String relativeDir,
        String displayName
    ) {
        String selection =
            MediaStore.MediaColumns.RELATIVE_PATH + "=? AND "
                + MediaStore.MediaColumns.DISPLAY_NAME + "=?";
        String[] args = new String[] { relativeDir, displayName };
        try (Cursor cursor = resolver.query(
            collection,
            new String[] { MediaStore.MediaColumns._ID },
            selection,
            args,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                long id = cursor.getLong(0);
                return ContentUris.withAppendedId(collection, id);
            }
        }
        return null;
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static Uri findDownloadsUri(Context context, String baseFolder, String relativePath)
        throws Exception {
        Uri cached = cachedDownloadsUri(baseFolder, relativePath);
        if (cached != null) {
            Uri openable = ensureOpenableUri(context, cached);
            if (openable != null) return openable;
            DOWNLOADS_URI_CACHE.remove(downloadsCacheKey(baseFolder, relativePath));
        }
        ContentResolver resolver = context.getContentResolver();
        String relativeDir = downloadsRelativeDir(baseFolder, relativePath);
        String relativeDirNoSlash =
            relativeDir.endsWith("/") ? relativeDir.substring(0, relativeDir.length() - 1) : relativeDir;
        String displayName = fileNameFromPath(relativePath);

        Uri[] collections = new Uri[] {
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            MediaStore.Files.getContentUri("external"),
        };

        for (Uri collection : collections) {
            Uri hit = queryDownloadsByNameAndDir(resolver, collection, relativeDir, displayName);
            if (hit != null) return hit;
            hit = queryDownloadsByNameAndDir(resolver, collection, relativeDirNoSlash, displayName);
            if (hit != null) return hit;
            hit = queryDownloadsByNameAndDir(resolver, collection, relativeDir, displayName + ".bin");
            if (hit != null) return hit;
            hit = queryDownloadsByNameAndDir(resolver, collection, relativeDirNoSlash, displayName + ".bin");
            if (hit != null) return hit;
        }

        // Fallback: nested Cyrillic paths — match by folder prefix + display name.
        String pathPrefix = Environment.DIRECTORY_DOWNLOADS + "/" + baseFolder + "/";
        String selection =
            MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ? AND "
                + MediaStore.MediaColumns.DISPLAY_NAME + "=?";
        String[] args = new String[] { pathPrefix + "%", displayName };
        for (Uri collection : collections) {
            try (Cursor cursor = resolver.query(
                collection,
                new String[] { MediaStore.MediaColumns._ID },
                selection,
                args,
                MediaStore.MediaColumns.DATE_MODIFIED + " DESC"
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    long id = cursor.getLong(0);
                    Uri hit = ContentUris.withAppendedId(collection, id);
                    Uri openable = ensureOpenableUri(context, hit);
                    if (openable != null) return openable;
                }
            }
        }

        // Dot-диры (напр. `.inpx-reader`) MediaStore не индексирует вовсе —
        // ищем файл напрямую на диске, иначе каждая запись создаёт дубликат « (1)».
        File disk = resolveDownloadsDiskFile(baseFolder, relativePath);
        if (disk.isFile()) {
            Uri fileUri = Uri.fromFile(disk);
            if (ensureOpenableUri(context, fileUri) != null) return fileUri;
        }
        return null;
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static void writeDownloadsFile(
        Context context,
        String baseFolder,
        String relativePath,
        byte[] bytes,
        String mimeType
    ) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        Uri existing = findDownloadsUri(context, baseFolder, relativePath);

        // Перезапись существующего файла на месте. insert+delete при том же имени
        // даёт дедуп MediaStore « (1)» и потерю канонического имени — файл потом
        // не находится при проверке после перезапуска.
        if (existing != null) {
            try (OutputStream out = resolver.openOutputStream(existing, "wt")) {
                if (out == null) {
                    throw new Exception("Could not open output stream");
                }
                out.write(bytes);
            }
            rememberDownloadsUri(baseFolder, relativePath, existing);
            return;
        }

        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileNameFromPath(relativePath));
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, downloadsRelativeDir(baseFolder, relativePath));
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new Exception("Could not create file");
        }

        try {
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) {
                    throw new Exception("Could not open output stream");
                }
                out.write(bytes);
            }
            ContentValues publish = new ContentValues();
            publish.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, publish, null, null);
        } catch (Exception writeErr) {
            try {
                resolver.delete(uri, null, null);
            } catch (Exception ignored) { /* best-effort */ }
            throw writeErr;
        }

        rememberDownloadsUri(baseFolder, relativePath, uri);
        File disk = resolveDownloadsDiskFile(baseFolder, relativePath);
        File parent = disk.getParentFile();
        if (parent != null) {
            File binTwin = new File(parent, disk.getName() + ".bin");
            // Old disk twin may remain if MediaStore pointed elsewhere — leave primary to MediaStore.
            if (binTwin.isFile()) {
                //noinspection ResultOfMethodCallIgnored
                binTwin.delete();
            }
        }
    }

    /**
     * MediaScanner can index Download orphans the app cannot open (SecurityException).
     * Only return URIs we can actually read.
     */
    private static Uri ensureOpenableUri(Context context, Uri uri) {
        if (uri == null) return null;
        try (InputStream in = context.getContentResolver().openInputStream(uri)) {
            if (in != null) return uri;
        } catch (SecurityException se) {
            try {
                context.getContentResolver().delete(uri, null, null);
            } catch (Exception ignored) {
                /* cannot remove foreign MediaStore row */
            }
        } catch (Exception ignored) {
            /* not readable */
        }
        return null;
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static Uri resolveDownloadsUri(Context context, String baseFolder, String relativePath)
        throws Exception {
        Uri uri = ensureOpenableUri(context, findDownloadsUri(context, baseFolder, relativePath));
        if (uri != null) return uri;
        // Do not MediaScanner-index foreign/SAF orphans — that yields unreadable MediaStore rows.
        return null;
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static String readDownloadsText(Context context, String baseFolder, String relativePath)
        throws Exception {
        InputStream raw = openDownloadsInputStream(context, baseFolder, relativePath);
        if (raw == null) {
            throw new Exception("File not found");
        }

        StringBuilder sb = new StringBuilder();
        try (
            InputStream in = raw;
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))
        ) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (sb.length() > 0) {
                    sb.append('\n');
                }
                sb.append(line);
            }
        }
        return sb.toString();
    }

    private static byte[] readStreamBytes(InputStream in) throws Exception {
        if (in == null) {
            throw new Exception("Could not open input stream");
        }
        try (InputStream input = in) {
            byte[] buffer = new byte[8192];
            int read;
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            while ((read = input.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static InputStream openDownloadsInputStream(
        Context context,
        String baseFolder,
        String relativePath
    ) throws Exception {
        Uri uri = resolveDownloadsUri(context, baseFolder, relativePath);
        if (uri != null) {
            InputStream in = context.getContentResolver().openInputStream(uri);
            if (in != null) return in;
        }
        InputStream saf = openPersistedDownloadsStream(context, baseFolder, relativePath);
        if (saf != null) return saf;
        File disk = resolveDownloadsDiskFile(baseFolder, relativePath);
        if (canReadDownloadsDiskFile(disk)) {
            return new FileInputStream(disk);
        }
        return null;
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static byte[] readDownloadsBinary(Context context, String baseFolder, String relativePath)
        throws Exception {
        InputStream in = openDownloadsInputStream(context, baseFolder, relativePath);
        if (in == null) {
            throw new Exception("File not found");
        }
        return readStreamBytes(in);
    }

    private static byte[] readLegacyBinary(String storageUri, String relativePath) throws Exception {
        File file = resolveLegacyFile(storageUri, relativePath, false);
        if (!file.exists()) {
            throw new Exception("File not found");
        }
        try (FileInputStream in = new FileInputStream(file)) {
            return readStreamBytes(in);
        }
    }

    private static byte[] readSafBinary(Context context, String treeUri, String path) throws Exception {
        DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri));
        DocumentFile file = resolveSafPath(root, path, false);
        if (file == null || !file.exists()) {
            throw new Exception("File not found");
        }
        try (InputStream in = context.getContentResolver().openInputStream(file.getUri())) {
            return readStreamBytes(in);
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static void deleteDownloadsFile(Context context, String baseFolder, String relativePath)
        throws Exception {
        Uri uri = findDownloadsUri(context, baseFolder, relativePath);
        if (uri != null && !"file".equals(uri.getScheme())) {
            context.getContentResolver().delete(uri, null, null);
        }
        File disk = resolveDownloadsDiskFile(baseFolder, relativePath);
        if (disk.isFile()) {
            //noinspection ResultOfMethodCallIgnored
            disk.delete();
        }
        File parent = disk.getParentFile();
        if (parent != null) {
            File binTwin = new File(parent, disk.getName() + ".bin");
            if (binTwin.isFile()) {
                //noinspection ResultOfMethodCallIgnored
                binTwin.delete();
            }
        }
    }

    private static File resolveLegacyFile(String storageUri, String relativePath, boolean createParents)
        throws Exception {
        String safe = normalizeRelativePath(relativePath);
        File root = new File(storageUri.substring("file://".length()));
        File file = new File(root, safe.replace('/', File.separatorChar));
        String rootPath = root.getCanonicalPath();
        String filePath = file.getCanonicalPath();
        if (!filePath.equals(rootPath) && !filePath.startsWith(rootPath + File.separator)) {
            throw new Exception("Invalid storage path");
        }
        if (createParents) {
            File parent = file.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                throw new Exception("Could not create directory");
            }
        }
        return file;
    }

    private static void writeLegacyFile(String storageUri, String relativePath, byte[] bytes) throws Exception {
        File file = resolveLegacyFile(storageUri, relativePath, true);
        try (FileOutputStream out = new FileOutputStream(file, false)) {
            out.write(bytes);
        }
    }

    private static String readLegacyText(String storageUri, String relativePath) throws Exception {
        File file = resolveLegacyFile(storageUri, relativePath, false);
        if (!file.exists()) {
            throw new Exception("File not found");
        }

        StringBuilder sb = new StringBuilder();
        try (
            FileInputStream in = new FileInputStream(file);
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))
        ) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (sb.length() > 0) {
                    sb.append('\n');
                }
                sb.append(line);
            }
        }
        return sb.toString();
    }

    private static void deleteLegacyFile(String storageUri, String relativePath) {
        try {
            File file = resolveLegacyFile(storageUri, relativePath, false);
            if (file.exists()) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        } catch (Exception ignored) {
            /* invalid path — nothing to delete */
        }
    }

    private static DocumentFile resolveSafPath(DocumentFile root, String relativePath, boolean create) {
        if (root == null || relativePath == null || relativePath.isEmpty()) {
            return null;
        }

        final String safe;
        try {
            safe = normalizeRelativePath(relativePath);
        } catch (Exception invalid) {
            return null;
        }

        String[] parts = safe.split("/");
        DocumentFile current = root;

        for (int i = 0; i < parts.length; i++) {
            String part = parts[i];
            if (part == null || part.isEmpty()) {
                continue;
            }

            boolean isLast = i == parts.length - 1;
            if (isLast) {
                if (!create) {
                    DocumentFile found = findChild(current, part);
                    return found;
                }
                DocumentFile existing = findChild(current, part);
                if (existing != null) {
                    // Reuse existing doc — delete-then-create can lose the book if createFile fails.
                    return existing;
                }
                String mime = mimeForPath(part);
                return current.createFile(mime, part);
            }

            DocumentFile next = findChild(current, part);
            if (next == null && create) {
                next = current.createDirectory(part);
            }
            if (next == null) {
                return null;
            }
            current = next;
        }

        return null;
    }

    /** DocumentFile.findFile is exact; OEM/SAF may alter unicode or casing. */
    private static DocumentFile findChild(DocumentFile parent, String name) {
        if (parent == null || name == null) return null;
        DocumentFile exact = parent.findFile(name);
        if (exact != null) return exact;
        DocumentFile[] children = parent.listFiles();
        if (children == null) return null;
        String want = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFC);
        for (DocumentFile child : children) {
            String childName = child.getName();
            if (childName == null) continue;
            String normalized = java.text.Normalizer.normalize(childName, java.text.Normalizer.Form.NFC);
            if (normalized.equals(want) || childName.equalsIgnoreCase(name)) {
                return child;
            }
        }
        return null;
    }

    private static void writeSafBinaryFile(Context context, String treeUri, String path, byte[] bytes)
        throws Exception {
        DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri));
        DocumentFile file = resolveSafPath(root, path, true);
        if (file == null) {
            throw new Exception("Could not create file");
        }
        try (OutputStream out = context.getContentResolver().openOutputStream(file.getUri(), "wt")) {
            if (out == null) {
                throw new Exception("Could not open output stream");
            }
            out.write(bytes);
        }
    }

    private static void writeSafTextFile(Context context, String treeUri, String path, byte[] bytes)
        throws Exception {
        writeSafBinaryFile(context, treeUri, path, bytes);
    }

    private static String readSafText(Context context, String treeUri, String path) throws Exception {
        DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri));
        DocumentFile file = resolveSafPath(root, path, false);
        if (file == null || !file.exists()) {
            throw new Exception("File not found");
        }

        StringBuilder sb = new StringBuilder();
        try (
            InputStream in = context.getContentResolver().openInputStream(file.getUri());
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))
        ) {
            if (in == null) {
                throw new Exception("Could not open input stream");
            }
            String line;
            while ((line = reader.readLine()) != null) {
                if (sb.length() > 0) {
                    sb.append('\n');
                }
                sb.append(line);
            }
        }
        return sb.toString();
    }

    private static void deleteSafFile(Context context, String treeUri, String path) {
        DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri));
        DocumentFile file = resolveSafPath(root, path, false);
        if (file != null && file.exists()) {
            file.delete();
        }
    }

    public static String importContentUri(Context context, String treeUri, String contentUri)
        throws Exception {
        Uri uri = Uri.parse(contentUri);
        ContentResolver resolver = context.getContentResolver();
        String displayName = "imported-book.fb2";
        try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = cursor.getString(idx);
                    if (name != null && !name.isEmpty()) displayName = name;
                }
            }
        }
        displayName = displayName.replaceAll("[\\\\/:*?\"<>|]", "_");
        String nameOnly = displayName;
        String ext = "";
        int dot = displayName.lastIndexOf('.');
        if (dot > 0 && dot < displayName.length() - 1) {
            nameOnly = displayName.substring(0, dot);
            ext = displayName.substring(dot);
        }
        String relativePath = "Imports/" + displayName;
        DocumentFile importRoot = DocumentFile.fromTreeUri(context, Uri.parse(treeUri));
        int n = 2;
        while (importRoot != null && resolveSafPath(importRoot, relativePath, false) != null) {
            relativePath = "Imports/" + nameOnly + " (" + n + ")" + ext;
            n++;
            if (n > 200) break;
        }
        byte[] bytes;
        try (InputStream in = resolver.openInputStream(uri)) {
            bytes = readStreamBytes(in);
        }
        writeBinaryFile(context, treeUri, relativePath, bytes);
        return relativePath;
    }

    /**
     * App-private image cache under {@code files/image-cache/}.
     * Independent of SAF/Downloads — reliable offline cover/portrait storage.
     * Cap matches JS IDB cover LRU (~400 files) so browsing does not fill internal storage.
     */
    private static final int MAX_APP_IMAGE_CACHE_FILES = 400;

    private static File appImageCacheRoot(Context context) throws Exception {
        File dir = new File(context.getFilesDir(), "image-cache");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new Exception("Could not create image cache directory");
        }
        return dir;
    }

    private static File resolveAppCacheFile(Context context, String relativePath) throws Exception {
        if (relativePath == null || relativePath.isEmpty() || relativePath.contains("..")) {
            throw new Exception("Invalid cache path");
        }
        File root = appImageCacheRoot(context);
        String normalized = relativePath.replace('\\', '/');
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        File file = new File(root, normalized.replace('/', File.separatorChar));
        String rootPath = root.getCanonicalPath();
        String filePath = file.getCanonicalPath();
        if (!filePath.equals(rootPath) && !filePath.startsWith(rootPath + File.separator)) {
            throw new Exception("Invalid cache path");
        }
        return file;
    }

    private static void collectAppCacheFiles(File dir, ArrayList<File> out) {
        File[] kids = dir.listFiles();
        if (kids == null) return;
        for (File f : kids) {
            if (f.isDirectory()) {
                collectAppCacheFiles(f, out);
            } else if (f.isFile()) {
                out.add(f);
            }
        }
    }

    /** Drop oldest files by mtime when the image cache exceeds the cap. */
    private static void trimAppImageCache(Context context) {
        try {
            File root = appImageCacheRoot(context);
            ArrayList<File> files = new ArrayList<>();
            collectAppCacheFiles(root, files);
            if (files.size() <= MAX_APP_IMAGE_CACHE_FILES) return;
            Collections.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
            int toDelete = files.size() - MAX_APP_IMAGE_CACHE_FILES;
            for (int i = 0; i < toDelete; i++) {
                //noinspection ResultOfMethodCallIgnored
                files.get(i).delete();
            }
        } catch (Exception ignored) {
            /* best-effort */
        }
    }

    public static boolean appCacheFileExists(Context context, String relativePath) {
        try {
            File file = resolveAppCacheFile(context, relativePath);
            return file.isFile() && file.length() > 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    public static void writeAppCacheFile(Context context, String relativePath, byte[] bytes)
        throws Exception {
        File file = resolveAppCacheFile(context, relativePath);
        File parent = file.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new Exception("Could not create cache subdirectory");
        }
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes != null ? bytes : new byte[0]);
        }
        //noinspection ResultOfMethodCallIgnored
        file.setLastModified(System.currentTimeMillis());
        trimAppImageCache(context);
    }

    public static byte[] readAppCacheFile(Context context, String relativePath) throws Exception {
        File file = resolveAppCacheFile(context, relativePath);
        if (!file.isFile()) {
            throw new Exception("Cache file not found");
        }
        byte[] bytes;
        try (FileInputStream in = new FileInputStream(file)) {
            bytes = readStreamBytes(in);
        }
        // Touch for LRU so frequently shown covers survive trim.
        //noinspection ResultOfMethodCallIgnored
        file.setLastModified(System.currentTimeMillis());
        return bytes;
    }

    public static void deleteAppCacheFile(Context context, String relativePath) {
        try {
            File file = resolveAppCacheFile(context, relativePath);
            if (file.isFile()) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        } catch (Exception ignored) {
            /* best-effort */
        }
    }

    /** Max image size when caching covers/portraits via HTTP (guard against corrupt huge responses). */
    private static final long MAX_APP_CACHE_DOWNLOAD_BYTES = 5L * 1024L * 1024L;

    public interface DownloadProgressListener {
        void onProgress(long loaded, long total);
    }

    public static final class StorageDownloadResult {
        public final long bytesWritten;
        public final String digestSha256;
        public final int statusCode;

        public StorageDownloadResult(long bytesWritten, String digestSha256, int statusCode) {
            this.bytesWritten = bytesWritten;
            this.digestSha256 = digestSha256;
            this.statusCode = statusCode;
        }
    }

    private static final ConcurrentHashMap<String, HttpURLConnection> ACTIVE_DOWNLOADS =
        new ConcurrentHashMap<>();

    /** MediaStore URI for recently written Download/* files (scoped storage — no direct disk path). */
    private static final ConcurrentHashMap<String, Uri> DOWNLOADS_URI_CACHE = new ConcurrentHashMap<>();

    private static String downloadsCacheKey(String baseFolder, String relativePath) throws Exception {
        return baseFolder + "\0" + normalizeRelativePath(relativePath);
    }

    private static void rememberDownloadsUri(String baseFolder, String relativePath, Uri uri) {
        if (uri == null) return;
        try {
            DOWNLOADS_URI_CACHE.put(downloadsCacheKey(baseFolder, relativePath), uri);
        } catch (Exception ignored) {
            /* best-effort */
        }
    }

    private static Uri cachedDownloadsUri(String baseFolder, String relativePath) {
        try {
            return DOWNLOADS_URI_CACHE.get(downloadsCacheKey(baseFolder, relativePath));
        } catch (Exception ignored) {
            return null;
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static long mediaUriSize(Context context, Uri uri) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        try (ParcelFileDescriptor pfd = resolver.openFileDescriptor(uri, "r")) {
            if (pfd == null) throw new Exception("Could not open file");
            long size = pfd.getStatSize();
            if (size >= 0) return size;
        }
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) throw new Exception("Could not open file");
            return streamLength(in);
        }
    }

    public static void cancelActiveDownload(String jobId) {
        if (jobId == null || jobId.isEmpty()) return;
        HttpURLConnection conn = ACTIVE_DOWNLOADS.remove(jobId);
        if (conn != null) {
            try {
                conn.disconnect();
            } catch (Exception ignored) {
                /* best-effort */
            }
        }
    }

    public static String getAppCacheAbsolutePath(Context context, String relativePath) throws Exception {
        return resolveAppCacheFile(context, relativePath).getAbsolutePath();
    }

    /** App-private copies of large SAF books — file URL instead of base64 through the JS bridge. */
    private static final int MAX_BOOK_CACHE_FILES = 4;

    private static File bookCacheRoot(Context context) throws Exception {
        File dir = new File(context.getFilesDir(), "book-cache");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new Exception("Could not create book cache directory");
        }
        return dir;
    }

    private static void trimBookCache(Context context) {
        try {
            File root = bookCacheRoot(context);
            File[] kids = root.listFiles();
            if (kids == null || kids.length <= MAX_BOOK_CACHE_FILES) return;
            ArrayList<File> files = new ArrayList<>();
            for (File f : kids) {
                if (f.isFile() && !f.getName().endsWith(".tmp")) files.add(f);
            }
            if (files.size() <= MAX_BOOK_CACHE_FILES) return;
            Collections.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
            int toDelete = files.size() - MAX_BOOK_CACHE_FILES;
            for (int i = 0; i < toDelete; i++) {
                //noinspection ResultOfMethodCallIgnored
                files.get(i).delete();
            }
        } catch (Exception ignored) {
            /* best-effort */
        }
    }

    /**
     * Stream a library file into {@code files/book-cache/} (64 KiB buffer, no full-file byte[]).
     * Reuses an existing copy when the size still matches.
     */
    public static String copyStorageFileToBookCache(
        Context context,
        String storageUri,
        String relativePath
    ) throws Exception {
        requireStorageAccess(context, storageUri);
        String safe = normalizeRelativePath(relativePath);
        String name = safe;
        int slash = safe.lastIndexOf('/');
        if (slash >= 0) name = safe.substring(slash + 1);
        String ext = "";
        int dot = name.lastIndexOf('.');
        if (dot >= 0 && dot < name.length() - 1) {
            ext = name.substring(dot);
            if (ext.length() > 8) ext = "";
            ext = ext.replaceAll("[^A-Za-z0-9.]", "");
        }
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        md.update(safe.getBytes(StandardCharsets.UTF_8));
        String key = digestHex(md).substring(0, 24) + ext;
        File dest = new File(bookCacheRoot(context), key);

        long sourceSize = -1;
        try {
            sourceSize = getStorageFileSize(context, storageUri, relativePath);
        } catch (Exception ignored) {
            /* copy anyway */
        }
        if (dest.isFile() && sourceSize > 0 && dest.length() == sourceSize) {
            //noinspection ResultOfMethodCallIgnored
            dest.setLastModified(System.currentTimeMillis());
            return dest.getAbsolutePath();
        }

        InputStream in = openStorageInputStreamWithRetry(context, storageUri, relativePath);
        if (in == null) throw new Exception("File not found");
        File tmp = new File(dest.getAbsolutePath() + ".tmp");
        try (InputStream input = in; FileOutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[65536];
            int read;
            while ((read = input.read(buf)) != -1) {
                out.write(buf, 0, read);
            }
            out.getFD().sync();
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            throw e;
        }
        if (dest.exists() && !dest.delete()) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            throw new Exception("Could not replace cached book");
        }
        if (!tmp.renameTo(dest)) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            throw new Exception("Could not finalize cached book");
        }
        trimBookCache(context);
        return dest.getAbsolutePath();
    }

    public static long getStorageFileSize(Context context, String storageUri, String path) throws Exception {
        requireStorageAccess(context, storageUri);
        String downloadsFolder = effectiveDownloadsFolder(storageUri);
        if (downloadsFolder != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                Uri uri = resolveDownloadsUri(context, downloadsFolder, path);
                if (uri != null) {
                    return mediaUriSize(context, uri);
                }
            }
            File disk = resolveDownloadsDiskFile(downloadsFolder, path);
            if (disk.isFile()) return disk.length();
            throw new Exception("File not found");
        }
        if (isFileUri(storageUri)) {
            File file = resolveLegacyFile(storageUri, path, false);
            if (!file.isFile()) throw new Exception("File not found");
            return file.length();
        }
        DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(storageUri));
        DocumentFile file = resolveSafPath(root, path, false);
        if (file == null || !file.exists()) throw new Exception("File not found");
        return file.length();
    }

    public static StorageDownloadResult computeStorageFileDigest(
        Context context,
        String storageUri,
        String path
    ) throws Exception {
        requireStorageAccess(context, storageUri);
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        long size = 0;
        InputStream in = openStorageInputStreamWithRetry(context, storageUri, path);
        if (in == null) throw new Exception("File not found");
        try (InputStream input = in) {
            byte[] buf = new byte[8192];
            int read;
            while ((read = input.read(buf)) != -1) {
                md.update(buf, 0, read);
                size += read;
            }
        }
        return new StorageDownloadResult(size, digestHex(md), 200);
    }

    /** Read up to maxBytes from a stored book file (magic-byte validation). */
    public static byte[] readStorageFileHeader(
        Context context,
        String storageUri,
        String path,
        int maxBytes
    ) throws Exception {
        requireStorageAccess(context, storageUri);
        InputStream in = openStorageInputStreamWithRetry(context, storageUri, path);
        if (in == null) throw new Exception("File not found");
        try (InputStream input = in) {
            byte[] buf = new byte[Math.max(1, maxBytes)];
            int read = input.read(buf);
            if (read <= 0) return new byte[0];
            if (read == buf.length) return buf;
            byte[] out = new byte[read];
            System.arraycopy(buf, 0, out, 0, read);
            return out;
        }
    }

    public static StorageDownloadResult downloadUrlToAppCache(
        Context context,
        String url,
        String relativePath,
        Map<String, String> headers
    ) throws Exception {
        HttpURLConnection conn = openUrlConnection(url, headers, "Accept", "image/*");
        try {
            int code = conn.getResponseCode();
            if (code == 404) {
                return new StorageDownloadResult(0, "", 404);
            }
            if (code < 200 || code >= 300) {
                throw new Exception("HTTP " + code);
            }
            long total = conn.getContentLengthLong();
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            File file = resolveAppCacheFile(context, relativePath);
            File parent = file.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                throw new Exception("Could not create cache subdirectory");
            }
            long written = 0;
            try (
                InputStream in = conn.getInputStream();
                FileOutputStream out = new FileOutputStream(file)
            ) {
                byte[] buf = new byte[8192];
                int read;
                while ((read = in.read(buf)) != -1) {
                    written += read;
                    if (written > MAX_APP_CACHE_DOWNLOAD_BYTES) {
                        throw new Exception("Image too large");
                    }
                    out.write(buf, 0, read);
                    md.update(buf, 0, read);
                }
                out.flush();
            }
            if (written < 32) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
                throw new Exception("Empty image");
            }
            //noinspection ResultOfMethodCallIgnored
            file.setLastModified(System.currentTimeMillis());
            trimAppImageCache(context);
            return new StorageDownloadResult(written, digestHex(md), code);
        } finally {
            conn.disconnect();
        }
    }

    public static StorageDownloadResult downloadUrlToStorage(
        Context context,
        String url,
        String storageUri,
        String path,
        Map<String, String> headers,
        String jobId,
        DownloadProgressListener listener
    ) throws Exception {
        requireStorageAccess(context, storageUri);
        if (jobId != null && !jobId.isEmpty()) {
            // Replace any stale connection for this job (e.g. remount race).
            cancelActiveDownload(jobId);
        }
        HttpURLConnection conn = openUrlConnection(url, headers, "Accept", "*/*");
        if (jobId != null && !jobId.isEmpty()) {
            ACTIVE_DOWNLOADS.put(jobId, conn);
        }
        try {
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                String detail = "";
                try (InputStream err = conn.getErrorStream()) {
                    if (err != null) {
                        byte[] buf = readStreamBytes(err);
                        if (buf.length > 0) {
                            detail = new String(buf, 0, Math.min(buf.length, 120), StandardCharsets.UTF_8).trim();
                        }
                    }
                } catch (Exception ignored) {
                    /* ignore */
                }
                if (!detail.isEmpty()) {
                    throw new Exception("HTTP " + code + " — " + detail);
                }
                throw new Exception("HTTP " + code);
            }
            long total = conn.getContentLengthLong();
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = conn.getInputStream()) {
                long written = writeStorageFromStream(context, storageUri, path, in, md, total, listener);
                return new StorageDownloadResult(written, digestHex(md), code);
            }
        } finally {
            if (jobId != null && !jobId.isEmpty()) {
                ACTIVE_DOWNLOADS.remove(jobId);
            }
            conn.disconnect();
        }
    }

    private static HttpURLConnection openUrlConnection(
        String url,
        Map<String, String> headers,
        String extraHeaderName,
        String extraHeaderValue
    ) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(20_000);
        conn.setReadTimeout(120_000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty(extraHeaderName, extraHeaderValue);
        if (headers != null) {
            for (Map.Entry<String, String> e : headers.entrySet()) {
                if (e.getKey() != null && e.getValue() != null) {
                    conn.setRequestProperty(e.getKey(), e.getValue());
                }
            }
        }
        return conn;
    }

    /** MediaStore rows can lag briefly after IS_PENDING=0; disk mirror is immediate. */
    private static InputStream openStorageInputStreamWithRetry(Context context, String storageUri, String path)
        throws Exception {
        Exception last = null;
        for (int attempt = 0; attempt < 8; attempt++) {
            try {
                InputStream in = openStorageInputStream(context, storageUri, path);
                if (in != null) return in;
            } catch (Exception e) {
                last = e;
            }
            if (attempt < 7) {
                try {
                    Thread.sleep(40L * (attempt + 1));
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new Exception("Interrupted while opening file");
                }
            }
        }
        if (last != null) throw last;
        return null;
    }

    private static InputStream openStorageInputStream(Context context, String storageUri, String path)
        throws Exception {
        String downloadsFolder = effectiveDownloadsFolder(storageUri);
        if (downloadsFolder != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                return openDownloadsInputStream(context, downloadsFolder, path);
            }
            File disk = resolveDownloadsDiskFile(downloadsFolder, path);
            if (canReadDownloadsDiskFile(disk)) return new FileInputStream(disk);
            return null;
        }
        if (isFileUri(storageUri)) {
            File file = resolveLegacyFile(storageUri, path, false);
            if (!file.isFile()) return null;
            return new FileInputStream(file);
        }
        DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(storageUri));
        DocumentFile file = resolveSafPath(root, path, false);
        if (file == null || !file.exists()) return null;
        try {
            return context.getContentResolver().openInputStream(file.getUri());
        } catch (SecurityException se) {
            throw permissionRevokedError();
        }
    }

    private static long streamLength(InputStream in) throws Exception {
        byte[] buf = new byte[8192];
        long total = 0;
        int read;
        while ((read = in.read(buf)) != -1) {
            total += read;
        }
        return total;
    }

    private static long writeStorageFromStream(
        Context context,
        String storageUri,
        String path,
        InputStream in,
        MessageDigest md,
        long totalHint,
        DownloadProgressListener listener
    ) throws Exception {
        String downloadsFolder = effectiveDownloadsFolder(storageUri);
        if (downloadsFolder != null) {
            return writeDownloadsFromStream(context, downloadsFolder, path, in, md, totalHint, listener);
        }
        if (isFileUri(storageUri)) {
            return writeLegacyFromStream(storageUri, path, in, md, totalHint, listener);
        }
        try {
            return writeSafFromStream(context, storageUri, path, in, md, totalHint, listener);
        } catch (SecurityException se) {
            throw permissionRevokedError();
        } catch (Exception safErr) {
            String fallbackFolder = downloadsFolderFromSafUri(storageUri);
            if (fallbackFolder != null) {
                return writeDownloadsFromStream(context, fallbackFolder, path, in, md, totalHint, listener);
            }
            if (!hasStorageAccess(context, storageUri)) {
                throw permissionRevokedError();
            }
            throw safErr;
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static long writeDownloadsFromStream(
        Context context,
        String baseFolder,
        String relativePath,
        InputStream in,
        MessageDigest md,
        long totalHint,
        DownloadProgressListener listener
    ) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        Uri existing = findDownloadsUri(context, baseFolder, relativePath);

        // Перезапись существующего файла на месте — insert+delete при том же имени
        // даёт дедуп « (1)» и потерю канонического имени (книга «пропадает» после
        // перезапуска, следующая скачка плодит « (2)» и т.д.).
        if (existing != null) {
            try (OutputStream mediaOut = resolver.openOutputStream(existing, "wt")) {
                if (mediaOut == null) throw new Exception("Could not open output stream");
                long written = copyStreamDigestProgress(in, mediaOut, md, totalHint, listener);
                rememberDownloadsUri(baseFolder, relativePath, existing);
                return written;
            }
        }

        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileNameFromPath(relativePath));
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeForPath(relativePath));
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, downloadsRelativeDir(baseFolder, relativePath));
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new Exception("Could not create file");
        }

        long written;
        try {
            try (OutputStream mediaOut = resolver.openOutputStream(uri)) {
                if (mediaOut == null) throw new Exception("Could not open output stream");
                written = copyStreamDigestProgress(in, mediaOut, md, totalHint, listener);
            }
            ContentValues publish = new ContentValues();
            publish.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, publish, null, null);
        } catch (Exception writeErr) {
            try {
                resolver.delete(uri, null, null);
            } catch (Exception ignored) { /* best-effort */ }
            throw writeErr;
        }
        rememberDownloadsUri(baseFolder, relativePath, uri);
        return written;
    }

    private static long writeLegacyFromStream(
        String storageUri,
        String path,
        InputStream in,
        MessageDigest md,
        long totalHint,
        DownloadProgressListener listener
    ) throws Exception {
        File file = resolveLegacyFile(storageUri, path, true);
        File parent = file.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new Exception("Could not create directory");
        }
        try (FileOutputStream out = new FileOutputStream(file)) {
            return copyStreamDigestProgress(in, out, md, totalHint, listener);
        }
    }

    private static long writeSafFromStream(
        Context context,
        String treeUri,
        String path,
        InputStream in,
        MessageDigest md,
        long totalHint,
        DownloadProgressListener listener
    ) throws Exception {
        DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri));
        DocumentFile file = resolveSafPath(root, path, true);
        if (file == null) throw new Exception("Could not create file");
        try (OutputStream out = context.getContentResolver().openOutputStream(file.getUri(), "wt")) {
            if (out == null) throw new Exception("Could not open output stream");
            return copyStreamDigestProgress(in, out, md, totalHint, listener);
        }
    }

    private static long copyStreamDigestProgress(
        InputStream in,
        OutputStream out,
        MessageDigest md,
        long totalHint,
        DownloadProgressListener listener
    ) throws Exception {
        return copyStreamDigestProgressDual(in, out, null, md, totalHint, listener);
    }

    private static long copyStreamDigestProgressDual(
        InputStream in,
        OutputStream primaryOut,
        OutputStream mirrorOut,
        MessageDigest md,
        long totalHint,
        DownloadProgressListener listener
    ) throws Exception {
        byte[] buf = new byte[8192];
        long written = 0;
        int read;
        long lastNotifyBytes = 0;
        long lastNotifyMs = 0;
        while ((read = in.read(buf)) != -1) {
            primaryOut.write(buf, 0, read);
            if (mirrorOut != null) {
                mirrorOut.write(buf, 0, read);
            }
            md.update(buf, 0, read);
            written += read;
            if (listener != null) {
                long now = System.currentTimeMillis();
                if (written - lastNotifyBytes >= 524288 || now - lastNotifyMs >= 300) {
                    listener.onProgress(written, totalHint > 0 ? totalHint : written);
                    lastNotifyBytes = written;
                    lastNotifyMs = now;
                }
            }
        }
        primaryOut.flush();
        if (mirrorOut != null) {
            mirrorOut.flush();
        }
        if (listener != null) {
            listener.onProgress(written, totalHint > 0 ? totalHint : written);
        }
        return written;
    }

    private static String digestHex(MessageDigest md) {
        byte[] d = md.digest();
        StringBuilder sb = new StringBuilder(d.length * 2);
        for (byte b : d) {
            sb.append(String.format(Locale.US, "%02x", b));
        }
        return sb.toString();
    }
}
