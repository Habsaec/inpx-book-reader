package ru.inpx.bookreader;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Locale;

/**
 * Режим «домашний экран»: включение {@link LauncherHomeActivity}, системный выбор главного экрана,
 * список и запуск установленных приложений, выход в другой лаунчер (BOOX).
 */
@CapacitorPlugin(name = "LauncherHome")
public class LauncherHomePlugin extends Plugin {

    private static final int MAX_ICON_PX = 192;

    private ComponentName homeComponent() {
        return new ComponentName(getContext(), LauncherHomeActivity.class);
    }

    private static Intent homeIntent() {
        return new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
    }

    private boolean isEnabled() {
        int state = getContext().getPackageManager().getComponentEnabledSetting(homeComponent());
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    private boolean isDefaultHome() {
        PackageManager pm = getContext().getPackageManager();
        ResolveInfo info = pm.resolveActivity(homeIntent(), PackageManager.MATCH_DEFAULT_ONLY);
        if (info == null || info.activityInfo == null) return false;
        return getContext().getPackageName().equals(info.activityInfo.packageName);
    }

    private JSObject state() {
        JSObject obj = new JSObject();
        obj.put("supported", true);
        obj.put("enabled", isEnabled());
        obj.put("isDefault", isEnabled() && isDefaultHome());
        return obj;
    }

    @PluginMethod
    public void getState(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getContext().getPackageManager().setComponentEnabledSetting(
            homeComponent(),
            enabled
                ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        );
        call.resolve(state());
    }

    /** Системный экран «Главный экран» (выбор лаунчера по умолчанию). */
    @PluginMethod
    public void openHomeSettings(PluginCall call) {
        Context ctx = getContext();
        String[] actions = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
            ? new String[] { Settings.ACTION_HOME_SETTINGS, Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS, Settings.ACTION_SETTINGS }
            : new String[] { Settings.ACTION_HOME_SETTINGS, Settings.ACTION_SETTINGS };
        for (String action : actions) {
            try {
                ctx.startActivity(new Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                JSObject res = new JSObject();
                res.put("ok", true);
                res.put("action", action);
                call.resolve(res);
                return;
            } catch (ActivityNotFoundException | SecurityException ignored) {
                // next fallback
            }
        }
        JSObject res = new JSObject();
        res.put("ok", false);
        call.resolve(res);
    }

    /**
     * Запустить другой домашний экран явно (лаунчер BOOX и т.п.) — аварийный выход,
     * когда наш главный экран мешает. Onyx-лаунчер предпочитается.
     */
    @PluginMethod
    public void openOtherLauncher(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        List<ResolveInfo> list = pm.queryIntentActivities(homeIntent(), 0);
        String own = getContext().getPackageName();
        ResolveInfo best = null;
        for (ResolveInfo info : list) {
            ActivityInfo ai = info.activityInfo;
            if (ai == null || own.equals(ai.packageName)) continue;
            // «FallbackHome» настроек — заглушка на время загрузки, не лаунчер.
            if ("com.android.settings".equals(ai.packageName)) continue;
            if (best == null || ai.packageName.toLowerCase(Locale.ROOT).contains("onyx")) {
                best = info;
                if (ai.packageName.toLowerCase(Locale.ROOT).contains("onyx")) break;
            }
        }
        JSObject res = new JSObject();
        if (best == null) {
            res.put("ok", false);
            call.resolve(res);
            return;
        }
        try {
            Intent intent = homeIntent()
                .setComponent(new ComponentName(best.activityInfo.packageName, best.activityInfo.name))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            res.put("ok", true);
            res.put("label", String.valueOf(best.loadLabel(pm)));
        } catch (RuntimeException e) {
            res.put("ok", false);
        }
        call.resolve(res);
    }

    /** Установленные приложения с иконкой запуска (без самой читалки). Иконки — PNG base64. */
    @PluginMethod
    public void listApps(PluginCall call) {
        int iconPx = Math.max(32, Math.min(MAX_ICON_PX, call.getInt("iconSize", 96)));
        getBridge().execute(() -> {
            PackageManager pm = getContext().getPackageManager();
            Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> list = pm.queryIntentActivities(launcher, 0);
            String own = getContext().getPackageName();
            JSArray items = new JSArray();
            for (ResolveInfo info : list) {
                ActivityInfo ai = info.activityInfo;
                if (ai == null || own.equals(ai.packageName)) continue;
                JSObject app = new JSObject();
                app.put("packageName", ai.packageName);
                app.put("activityName", ai.name);
                app.put("label", String.valueOf(info.loadLabel(pm)));
                String icon = iconPng(info.loadIcon(pm), iconPx);
                if (icon != null) app.put("icon", "data:image/png;base64," + icon);
                items.put(app);
            }
            JSObject res = new JSObject();
            res.put("items", items);
            call.resolve(res);
        });
    }

    @PluginMethod
    public void launchApp(PluginCall call) {
        String pkg = call.getString("packageName", "");
        String activity = call.getString("activityName", "");
        JSObject res = new JSObject();
        if (pkg == null || pkg.isEmpty()) {
            res.put("ok", false);
            call.resolve(res);
            return;
        }
        PackageManager pm = getContext().getPackageManager();
        Intent intent = null;
        if (activity != null && !activity.isEmpty()) {
            Intent explicit = new Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .setComponent(new ComponentName(pkg, activity));
            if (pm.resolveActivity(explicit, 0) != null) intent = explicit;
        }
        if (intent == null) intent = pm.getLaunchIntentForPackage(pkg);
        if (intent == null) {
            res.put("ok", false);
            call.resolve(res);
            return;
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        try {
            getContext().startActivity(intent);
            res.put("ok", true);
        } catch (RuntimeException e) {
            res.put("ok", false);
        }
        call.resolve(res);
    }

    private static String iconPng(Drawable drawable, int size) {
        if (drawable == null) return null;
        try {
            Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            drawable.setBounds(0, 0, size, size);
            drawable.draw(canvas);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
            bitmap.recycle();
            return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (RuntimeException e) {
            return null;
        }
    }
}
