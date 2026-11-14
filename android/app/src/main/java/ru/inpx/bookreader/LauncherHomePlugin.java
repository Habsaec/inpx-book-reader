package ru.inpx.bookreader;

import android.app.role.RoleManager;
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
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Locale;

/**
 * Режим «домашний экран» ({@link LauncherHomeActivity} всегда включён): состояние, системный выбор главного экрана,
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

    /**
     * The HOME activity is enabled in the manifest (always offered, like any launcher). Builds before
     * that switched it on / off at runtime; a stored «disabled» from them would hide it for good, so it
     * goes back to the manifest value. A stored «enabled» equals the manifest and is left alone:
     * touching a home component's state can make the system pick the default home again.
     */
    @Override
    public void load() {
        super.load();
        try {
            PackageManager pm = getContext().getPackageManager();
            if (pm.getComponentEnabledSetting(homeComponent()) == PackageManager.COMPONENT_ENABLED_STATE_DISABLED) {
                pm.setComponentEnabledSetting(
                    homeComponent(),
                    PackageManager.COMPONENT_ENABLED_STATE_DEFAULT,
                    PackageManager.DONT_KILL_APP
                );
            }
        } catch (RuntimeException ignored) {
            // never block the app start on this
        }
    }

    private boolean isEnabled() {
        return getContext().getPackageManager().getComponentEnabledSetting(homeComponent())
            != PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
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
        // BOOX: the launcher's per-app auto-freeze disables the whole package after a few idle minutes
        // and Android then drops the HOME role — the settings screen warns about it.
        obj.put("onyx", OnyxFrontLight.isLikelyOnyxDevice());
        // Other firmwares kill background apps through Android's battery optimisation.
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        obj.put("unrestricted", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        obj.put("canRequestRole", roleRequestAvailable());
        obj.put("canOpenFreeze", freezeSettingsIntent() != null);
        return obj;
    }

    @PluginMethod
    public void getState(PluginCall call) {
        call.resolve(state());
    }

    private boolean roleRequestAvailable() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false;
        RoleManager rm = getContext().getSystemService(RoleManager.class);
        return rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME);
    }

    /**
     * Android 10+: the system's own «Сделать … главным экраном?» dialog — one tap, no trip through
     * Settings. Older systems (or a firmware without the dialog) get the Settings screen instead.
     */
    @PluginMethod
    public void requestHomeRole(PluginCall call) {
        if (isEnabled() && isDefaultHome()) {
            call.resolve(state());
            return;
        }
        if (roleRequestAvailable()) {
            RoleManager rm = getContext().getSystemService(RoleManager.class);
            try {
                startActivityForResult(call, rm.createRequestRoleIntent(RoleManager.ROLE_HOME), "homeRoleResult");
                return;
            } catch (RuntimeException ignored) {
                // fall back to Settings below
            }
        }
        openHomeSettings(call);
    }

    @ActivityCallback
    private void homeRoleResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        call.resolve(state());
    }

    /** The system «Разрешить работу в фоне без ограничений?» dialog (battery optimisation off). */
    @PluginMethod
    public void requestUnrestricted(PluginCall call) {
        Intent ask = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            .setData(Uri.parse("package:" + getContext().getPackageName()));
        try {
            startActivityForResult(call, ask, "unrestrictedResult");
        } catch (RuntimeException first) {
            try {
                startActivityForResult(call, new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), "unrestrictedResult");
            } catch (RuntimeException second) {
                call.resolve(state());
            }
        }
    }

    @ActivityCallback
    private void unrestrictedResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        call.resolve(state());
    }

    /**
     * BOOX: the launcher's app-freeze list (the snowflake on its «Приложения» screen). Candidates are
     * tried in order; null when this firmware has none of them.
     */
    private Intent freezeSettingsIntent() {
        if (!OnyxFrontLight.isLikelyOnyxDevice()) return null;
        PackageManager pm = getContext().getPackageManager();
        for (String[] c : FREEZE_SCREENS) {
            Intent intent = new Intent(c[1]);
            if (c[0] != null) intent.setComponent(new ComponentName("com.onyx", c[0]));
            ResolveInfo info = pm.resolveActivity(intent, 0);
            if (info != null && info.activityInfo != null && info.activityInfo.exported) return intent;
        }
        return null;
    }

    /**
     * { activity class (null = implicit), action }, tried in order — the same choice BOOX makes itself
     * (com.onyx EACStatusChangedReceiver.y, read from the FW 4.2 dex): phones / tablets get the implicit
     * onyx.settings.action.APP_FREEZE_MANAGEMENT; e-readers (Go 7: nothing resolves it) get its settings
     * container (exported, maps the action to a page in code, so the component is named explicitly) with
     * com.onyx.app.freeze.page = «Настройки приостановки», the snowflake screen. The container rejects
     * APP_FREEZE_MANAGEMENT («Illegal intent action …»). Last resort: «Управление приложениями», one tap
     * from it.
     */
    private static final String[][] FREEZE_SCREENS = {
        { null, "onyx.settings.action.APP_FREEZE_MANAGEMENT" },
        { "com.onyx.common.setting.ui.SettingContainerActivity", "com.onyx.app.freeze.page" },
        { "com.onyx.common.setting.ui.SettingContainerActivity", "onyx.settings.action.application" },
    };

    @PluginMethod
    public void openFreezeSettings(PluginCall call) {
        JSObject res = new JSObject();
        Intent intent = freezeSettingsIntent();
        if (intent == null) {
            res.put("ok", false);
            call.resolve(res);
            return;
        }
        try {
            getContext().startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            res.put("ok", true);
        } catch (RuntimeException e) {
            res.put("ok", false);
        }
        call.resolve(res);
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

    /** BOOX: «open a suspended app» — its launcher unfreezes the package, then starts it (snowflake tap). */
    private static final String ACTION_OPEN_FROZEN_APP = "onyx.action.open_frozen_app";

    /** The whole package is switched off — on BOOX that is its app suspension («приостановка»). */
    private static boolean isPackageOff(PackageManager pm, ActivityInfo ai) {
        if (ai.applicationInfo != null && !ai.applicationInfo.enabled) return true;
        try {
            int state = pm.getApplicationEnabledSetting(ai.packageName);
            return state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_USER
                || state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_UNTIL_USED;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * Установленные приложения с иконкой запуска (без самой читалки). Иконки — PNG base64.
     * Приостановленные BOOX приложения (пакет выключен) Android сам не отдаёт — они пропадали из
     * списка после каждой приостановки; MATCH_DISABLED_COMPONENTS возвращает их с пометкой frozen.
     */
    @PluginMethod
    public void listApps(PluginCall call) {
        int iconPx = Math.max(32, Math.min(MAX_ICON_PX, call.getInt("iconSize", 96)));
        getBridge().execute(() -> {
            PackageManager pm = getContext().getPackageManager();
            Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> list = pm.queryIntentActivities(launcher, PackageManager.MATCH_DISABLED_COMPONENTS);
            String own = getContext().getPackageName();
            JSArray items = new JSArray();
            java.util.HashSet<String> seen = new java.util.HashSet<>();
            for (ResolveInfo info : list) {
                ActivityInfo ai = info.activityInfo;
                if (ai == null || own.equals(ai.packageName)) continue;
                boolean off = isPackageOff(pm, ai);
                // A component switched off on purpose inside a running app is not a launcher entry.
                if (!off && !ai.enabled) continue;
                if (!seen.add(ai.packageName + "/" + ai.name)) continue;
                JSObject app = new JSObject();
                app.put("packageName", ai.packageName);
                app.put("activityName", ai.name);
                app.put("label", String.valueOf(info.loadLabel(pm)));
                if (off) app.put("frozen", true);
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
        if (OnyxFrontLight.isLikelyOnyxDevice() && isPackageOffByName(pm, pkg)) {
            // Suspended by BOOX: ask its launcher to unfreeze and start it, exactly like a tap on the
            // snowflake icon (EACStatusChangedReceiver reads args_pkg / args_class / args_user_id).
            Intent unfreeze = new Intent(ACTION_OPEN_FROZEN_APP)
                .setPackage("com.onyx")
                .putExtra("args_pkg", pkg)
                .putExtra("args_user_id", android.os.Process.myUid() / 100000);
            if (activity != null && !activity.isEmpty()) unfreeze.putExtra("args_class", activity);
            getContext().sendBroadcast(unfreeze);
            res.put("ok", true);
            res.put("unfrozen", true);
            call.resolve(res);
            return;
        }
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

    private static boolean isPackageOffByName(PackageManager pm, String pkg) {
        try {
            int state = pm.getApplicationEnabledSetting(pkg);
            return state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_USER
                || state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_UNTIL_USED
                || state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
        } catch (IllegalArgumentException e) {
            return false;
        }
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
