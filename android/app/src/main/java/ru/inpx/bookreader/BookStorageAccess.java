package ru.inpx.bookreader;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.documentfile.provider.DocumentFile;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
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

    private static File getLegacyDownloadsDir() {
        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        return new File(downloads, "INPXLibraryReader");
    }

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

    public static boolean fileExists(Context context, String storageUri, String path) {
        try {
            if (isDownloadsUri(storageUri)) {
                return findDownloadsUri(context, baseFolder(storageUri), path) != null;
            }
            if (isFileUri(storageUri)) {
                File file = resolveLegacyFile(storageUri, path, false);
                return file.exists();
            }
            DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(storageUri));
            DocumentFile file = resolveSafPath(root, path, false);
            return file != null && file.exists();
        } catch (Exception ignored) {
            return false;
        }
    }

    public static void writeBinaryFile(Context context, String storageUri, String path, byte[] bytes)
        throws Exception {
        if (isDownloadsUri(storageUri)) {
            writeDownloadsFile(context, baseFolder(storageUri), path, bytes, "application/octet-stream");
            return;
        }
        if (isFileUri(storageUri)) {
            writeLegacyFile(storageUri, path, bytes);
            return;
        }
        writeSafBinaryFile(context, storageUri, path, bytes);
    }

    public static void writeTextFile(Context context, String storageUri, String path, String content)
        throws Exception {
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        if (isDownloadsUri(storageUri)) {
            writeDownloadsFile(context, baseFolder(storageUri), path, bytes, "application/json");
            return;
        }
        if (isFileUri(storageUri)) {
            writeLegacyFile(storageUri, path, bytes);
            return;
        }
        writeSafTextFile(context, storageUri, path, bytes);
    }

    public static String readTextFile(Context context, String storageUri, String path) throws Exception {
        if (isDownloadsUri(storageUri)) {
            return readDownloadsText(context, baseFolder(storageUri), path);
        }
        if (isFileUri(storageUri)) {
            return readLegacyText(storageUri, path);
        }
        return readSafText(context, storageUri, path);
    }

    public static byte[] readBinaryFile(Context context, String storageUri, String path) throws Exception {
        if (isDownloadsUri(storageUri)) {
            return readDownloadsBinary(context, baseFolder(storageUri), path);
        }
        if (isFileUri(storageUri)) {
            return readLegacyBinary(storageUri, path);
        }
        return readSafBinary(context, storageUri, path);
    }

    public static void deleteFile(Context context, String storageUri, String path) throws Exception {
        if (isDownloadsUri(storageUri)) {
            deleteDownloadsFile(context, baseFolder(storageUri), path);
            return;
        }
        if (isFileUri(storageUri)) {
            deleteLegacyFile(storageUri, path);
            return;
        }
        deleteSafFile(context, storageUri, path);
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

    private static String downloadsRelativeDir(String baseFolder, String relativePath) {
        String[] parts = splitPath(relativePath);
        StringBuilder dir = new StringBuilder(Environment.DIRECTORY_DOWNLOADS).append('/').append(baseFolder);
        for (int i = 0; i < parts.length - 1; i++) {
            dir.append('/').append(parts[i]);
        }
        dir.append('/');
        return dir.toString();
    }

    private static String fileNameFromPath(String relativePath) {
        String[] parts = splitPath(relativePath);
        return parts[parts.length - 1];
    }

    private static String[] splitPath(String relativePath) {
        return relativePath.split("/");
    }

    private static Uri findDownloadsUri(Context context, String baseFolder, String relativePath) {
        ContentResolver resolver = context.getContentResolver();
        String relativeDir = downloadsRelativeDir(baseFolder, relativePath);
        String displayName = fileNameFromPath(relativePath);
        String selection =
            MediaStore.MediaColumns.RELATIVE_PATH + "=? AND "
                + MediaStore.MediaColumns.DISPLAY_NAME + "=?";
        String[] args = new String[] { relativeDir, displayName };

        try (Cursor cursor = resolver.query(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            new String[] { MediaStore.MediaColumns._ID },
            selection,
            args,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                long id = cursor.getLong(0);
                return ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, id);
            }
        }
        return null;
    }

    private static void writeDownloadsFile(
        Context context,
        String baseFolder,
        String relativePath,
        byte[] bytes,
        String mimeType
    ) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        Uri existing = findDownloadsUri(context, baseFolder, relativePath);
        if (existing != null) {
            resolver.delete(existing, null, null);
        }

        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileNameFromPath(relativePath));
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, downloadsRelativeDir(baseFolder, relativePath));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        }

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new Exception("Could not create file");
        }

        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) {
                throw new Exception("Could not open output stream");
            }
            out.write(bytes);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues publish = new ContentValues();
            publish.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, publish, null, null);
        }
    }

    private static String readDownloadsText(Context context, String baseFolder, String relativePath)
        throws Exception {
        Uri uri = findDownloadsUri(context, baseFolder, relativePath);
        if (uri == null) {
            throw new Exception("File not found");
        }

        StringBuilder sb = new StringBuilder();
        try (
            InputStream in = context.getContentResolver().openInputStream(uri);
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

    private static byte[] readDownloadsBinary(Context context, String baseFolder, String relativePath)
        throws Exception {
        Uri uri = findDownloadsUri(context, baseFolder, relativePath);
        if (uri == null) {
            throw new Exception("File not found");
        }
        try (InputStream in = context.getContentResolver().openInputStream(uri)) {
            return readStreamBytes(in);
        }
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

    private static void deleteDownloadsFile(Context context, String baseFolder, String relativePath) {
        Uri uri = findDownloadsUri(context, baseFolder, relativePath);
        if (uri != null) {
            context.getContentResolver().delete(uri, null, null);
        }
    }

    private static File resolveLegacyFile(String storageUri, String relativePath, boolean createParents)
        throws Exception {
        String rootPath = storageUri.substring("file://".length());
        File file = new File(rootPath, relativePath.replace('/', File.separatorChar));
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
        File file = new File(storageUri.substring("file://".length()), relativePath.replace('/', File.separatorChar));
        if (file.exists()) {
            file.delete();
        }
    }

    private static DocumentFile resolveSafPath(DocumentFile root, String relativePath, boolean create) {
        if (root == null || relativePath == null || relativePath.isEmpty()) {
            return null;
        }

        String[] parts = relativePath.split("/");
        DocumentFile current = root;

        for (int i = 0; i < parts.length; i++) {
            String part = parts[i];
            if (part == null || part.isEmpty()) {
                continue;
            }

            boolean isLast = i == parts.length - 1;
            if (isLast) {
                if (!create) {
                    return current.findFile(part);
                }
                DocumentFile existing = current.findFile(part);
                if (existing != null) {
                    existing.delete();
                }
                String mime = part.endsWith(".json") ? "application/json" : "application/octet-stream";
                return current.createFile(mime, part);
            }

            DocumentFile next = current.findFile(part);
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

    private static void writeSafBinaryFile(Context context, String treeUri, String path, byte[] bytes)
        throws Exception {
        DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(treeUri));
        DocumentFile file = resolveSafPath(root, path, true);
        if (file == null) {
            throw new Exception("Could not create file");
        }
        try (OutputStream out = context.getContentResolver().openOutputStream(file.getUri())) {
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
        String relativePath = "Imports/" + displayName;
        byte[] bytes;
        try (InputStream in = resolver.openInputStream(uri)) {
            bytes = readStreamBytes(in);
        }
        writeBinaryFile(context, treeUri, relativePath, bytes);
        return relativePath;
    }
}
