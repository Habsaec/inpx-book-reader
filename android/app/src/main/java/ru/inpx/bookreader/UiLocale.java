package ru.inpx.bookreader;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import java.util.Locale;

/**
 * Interface language chosen in the app (Profile → Внешний вид → Язык), for notifications and widgets.
 * The WebView sends it through ReaderNative.setUiLocale; empty = follow the phone (values/ vs values-ru/).
 */
final class UiLocale {
    private static final String PREFS = "inpx_ui";
    private static final String KEY = "locale";

    private UiLocale() {}

    /** @return true when the language changed (widgets need a redraw). */
    static boolean save(Context context, String locale) {
        String value = "ru".equals(locale) || "en".equals(locale) ? locale : "";
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (value.equals(prefs.getString(KEY, ""))) return false;
        prefs.edit().putString(KEY, value).apply();
        return true;
    }

    /** Context whose resources use the in-app language (the context itself when it follows the phone). */
    static Context wrap(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String locale = prefs.getString(KEY, "");
        if (locale == null || locale.isEmpty()) return context;
        Configuration conf = new Configuration(context.getResources().getConfiguration());
        conf.setLocale(new Locale(locale));
        return context.createConfigurationContext(conf);
    }

    static String str(Context context, int id, Object... args) {
        return wrap(context).getString(id, args);
    }
}
