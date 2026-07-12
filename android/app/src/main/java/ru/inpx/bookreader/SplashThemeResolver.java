package ru.inpx.bookreader;

import android.content.Context;
import android.content.res.Configuration;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import java.util.Calendar;

/**
 * Resolves splash background (light/dark) from saved app theme in SQLite app_meta.
 * Mirrors {@code resolveIsDark} in src/lib/serverTheme.ts for cold start.
 */
public final class SplashThemeResolver {

    private static final String DB_FILE = "inpx_readerSQLite.db";
    private static final String THEME_KEY = "app_theme";

    private SplashThemeResolver() {}

    public static boolean useDarkSplash(Context context) {
        String mode = readAppThemeMode(context);
        if (mode == null || mode.isEmpty()) {
            return isSystemDark(context);
        }
        switch (mode) {
            case "dark":
                return true;
            case "light":
            case "sepia":
                return false;
            case "auto":
                return isAutoDark();
            case "system":
            case "server":
            default:
                return isSystemDark(context);
        }
    }

    public static int splashBackgroundColor(boolean dark) {
        return dark ? 0xFF1E1A16 : 0xFFF5F1E8;
    }

    private static boolean isSystemDark(Context context) {
        int nightMode =
            context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }

    private static boolean isAutoDark() {
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        return hour >= 20 || hour < 7;
    }

    private static String readAppThemeMode(Context context) {
        File dbFile = new File(context.getApplicationInfo().dataDir, "databases/" + DB_FILE);
        if (!dbFile.isFile()) return null;
        SQLiteDatabase db = null;
        Cursor cursor = null;
        try {
            db = SQLiteDatabase.openDatabase(dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            cursor = db.rawQuery("SELECT value FROM app_meta WHERE key = ?", new String[] { THEME_KEY });
            if (cursor.moveToFirst()) {
                return cursor.getString(0);
            }
        } catch (Exception ignored) {
            /* first launch or DB not ready */
        } finally {
            if (cursor != null) cursor.close();
            if (db != null) db.close();
        }
        return null;
    }
}
