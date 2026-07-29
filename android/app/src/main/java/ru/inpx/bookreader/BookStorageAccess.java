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
import java.util.Locale;
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

    public static boolean fileExists(Context context, String storageUri, String path) {
        try {
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
                File disk = resolveDownloadsDiskFile(downloadsFolder, path);
                return disk.isFile() && disk.length() > 0;
            }
            if (isFileUri(storageUri)) {
                File file = resolveLegacyFile(storageUri, path, false);
                return file.exists();
            }
            DocumentFile root = DocumentFile.fromTreeUri(context, Uri.parse(storageUri));
            DocumentFile file = resolveSafPath(root, path, false);
            if (file != null && file.exists()) {
                return true;
            }
            File disk = resolveDownloadsDiskFile("INPXLibraryReader", path);
            return disk.isFile() && disk.length() > 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    public static byte[] readBinaryFile(Context context, String storageUri, String path) throws Exception {
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
                last = e;
            }
            try {
                return readSafBinary(context, storageUri, path);
            } catch (Exception e) {
                last = e;
            }
        }
        String downloadsFolder = effectiveDownloadsFolder(storageUri);
        if (downloadsFolder == null && isFileUri(storageUri)) {
            return readLegacyBinary(storageUri, path);
        }
        try {
            return readDownloadsBinary(
                context,
                downloadsFolder != null ? downloadsFolder : "INPXLibraryReader",
                path
            );
        } catch (Exception e) {
            if (last != null) e.addSuppressed(last);
            throw e;
        }
    }

    public static String readTextFile(Context context, String storageUri, String path) throws Exception {
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
                last = e;
            }
            try {
                return readSafText(context, storageUri, path);
            } catch (Exception e) {
                last = e;
            }
        }
        String downloadsFolder = effectiveDownloadsFolder(storageUri);
        if (downloadsFolder == null && isFileUri(storageUri)) {
            return readLegacyText(storageUri, path);
        }
        try {
            return readDownloadsText(
                context,
                downloadsFolder != null ? downloadsFolder : "INPXLibraryReader",
                path
            );
        } catch (Exception e) {
            if (last != null) e.addSuppressed(last);
            throw e;
        }
    }

    public static void writeBinaryFile(Context context, String storageUri, String path, byte[] bytes)
        throws Exception {
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
        } catch (Exception safErr) {
            writeDownloadsFile(context, "INPXLibraryReader", path, bytes, mimeForPath(path));
        }
    }

    public static void writeTextFile(Context context, String storageUri, String path, String content)
        throws Exception {
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
        } catch (Exception safErr) {
            writeDownloadsFile(context, "INPXLibraryReader", path, bytes, mimeForPath(path));
        }
    }

    public static void deleteFile(Context context, String storageUri, String path) throws Exception {
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
        } catch (Exception ignored) {
            /* fall through */
        }
        deleteDownloadsFile(context, "INPXLibraryReader", path);
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

    private static String effectiveDownloadsFolder(String storageUri) {
        if (canUseDownloadsVolume(storageUri)) {
            return baseFolder(storageUri);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return downloadsFolderFromSafUri(storageUri);
        }
        return null;
    }

    /** Direct child URI under a persisted SAF tree (avoids DocumentFile.findFile). */
    private static Uri buildSafChildUri(String treeUriStr, String relativePath) {
        try {
            Uri tree = Uri.parse(treeUriStr);
            String treeId = DocumentsContract.getTreeDocumentId(tree);
            StringBuilder docId = new StringBuilder(treeId);
            for (String part : splitPath(relativePath)) {
                if (part == null || part.isEmpty()) continue;
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

    /** Prefer real book MIME — octet-stream often becomes `*.fb2.bin` on OEM MediaStore. */
    private static String mimeForPath(String relativePath) {
        String name = fileNameFromPath(relativePath).toLowerCase(Locale.US);
        if (name.endsWith(".json")) return "application/json";
        if (name.endsWith(".epub")) return "application/epub+zip";
        if (name.endsWith(".fb2") || name.endsWith(".fbz")) return "application/x-fictionbook+xml";
        if (name.endsWith(".txt")) return "text/plain";
        if (name.endsWith(".pdf")) return "application/pdf";
        return "application/octet-stream";
    }

    private static File resolveDownloadsDiskFile(String baseFolder, String relativePath) {
        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        return new File(downloads, baseFolder + "/" + relativePath.replace('\\', '/'));
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
    private static Uri queryDownloadsFuzzy(
        ContentResolver resolver,
        Uri collection,
        String baseFolder,
        String displayName
    ) {
        // RELATIVE_PATH may omit trailing slash or nest differently per OEM.
        String like = Environment.DIRECTORY_DOWNLOADS + "/" + baseFolder + "%";
        String selection =
            MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ? AND ("
                + MediaStore.MediaColumns.DISPLAY_NAME + "=? OR "
                + MediaStore.MediaColumns.DISPLAY_NAME + "=?)";
        String[] args = new String[] { like, displayName, displayName + ".bin" };
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
    private static Uri findDownloadsUri(Context context, String baseFolder, String relativePath) {
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
            // octet-stream writes sometimes land as Title.fb2.bin
            hit = queryDownloadsByNameAndDir(resolver, collection, relativeDir, displayName + ".bin");
            if (hit != null) return hit;
            hit = queryDownloadsByNameAndDir(resolver, collection, relativeDirNoSlash, displayName + ".bin");
            if (hit != null) return hit;
            hit = queryDownloadsFuzzy(resolver, collection, baseFolder, displayName);
            if (hit != null) return hit;
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
        if (existing != null) {
            resolver.delete(existing, null, null);
        }
        // MediaStore delete may leave an orphan on disk; remove before rewrite.
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
    private static Uri resolveDownloadsUri(Context context, String baseFolder, String relativePath) {
        Uri uri = ensureOpenableUri(context, findDownloadsUri(context, baseFolder, relativePath));
        if (uri != null) return uri;
        // Do not MediaScanner-index foreign/SAF orphans — that yields unreadable MediaStore rows.
        return null;
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private static String readDownloadsText(Context context, String baseFolder, String relativePath)
        throws Exception {
        Uri uri = resolveDownloadsUri(context, baseFolder, relativePath);
        InputStream raw = null;
        if (uri != null) {
            raw = context.getContentResolver().openInputStream(uri);
        } else {
            File disk = resolveDownloadsDiskFile(baseFolder, relativePath);
            if (disk.isFile()) {
                raw = new FileInputStream(disk);
            }
        }
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
    private static byte[] readDownloadsBinary(Context context, String baseFolder, String relativePath)
        throws Exception {
        Uri uri = resolveDownloadsUri(context, baseFolder, relativePath);
        if (uri != null) {
            try (InputStream in = context.getContentResolver().openInputStream(uri)) {
                return readStreamBytes(in);
            }
        }
        File disk = resolveDownloadsDiskFile(baseFolder, relativePath);
        if (disk.isFile() && disk.length() > 0) {
            try (FileInputStream in = new FileInputStream(disk)) {
                return readStreamBytes(in);
            }
        }
        throw new Exception("File not found");
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
    private static void deleteDownloadsFile(Context context, String baseFolder, String relativePath) {
        Uri uri = findDownloadsUri(context, baseFolder, relativePath);
        if (uri != null) {
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
                    DocumentFile found = findChild(current, part);
                    return found;
                }
                DocumentFile existing = findChild(current, part);
                if (existing != null) {
                    existing.delete();
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
