package ru.inpx.bookreader;

import android.content.Context;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Динамическая палитра Material You (Android 12+, API 31) для цветовой темы
 * «Система» в WebView. Ниже API 31 (или без dynamic colors) — supported=false,
 * JS остаётся на встроенной палитре.
 */
@CapacitorPlugin(name = "SystemTheme")
public class SystemThemePlugin extends Plugin {

    @PluginMethod
    public void getDynamicPalette(PluginCall call) {
        JSObject out = new JSObject();
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT < 31 || ctx == null) {
            out.put("supported", false);
            call.resolve(out);
            return;
        }
        JSObject colors = new JSObject();
        putColor(ctx, colors, "accent1_100", android.R.color.system_accent1_100);
        putColor(ctx, colors, "accent1_200", android.R.color.system_accent1_200);
        putColor(ctx, colors, "accent1_300", android.R.color.system_accent1_300);
        putColor(ctx, colors, "accent1_600", android.R.color.system_accent1_600);
        putColor(ctx, colors, "accent1_700", android.R.color.system_accent1_700);
        putColor(ctx, colors, "neutral1_10", android.R.color.system_neutral1_10);
        putColor(ctx, colors, "neutral1_50", android.R.color.system_neutral1_50);
        putColor(ctx, colors, "neutral1_100", android.R.color.system_neutral1_100);
        putColor(ctx, colors, "neutral1_800", android.R.color.system_neutral1_800);
        putColor(ctx, colors, "neutral1_900", android.R.color.system_neutral1_900);
        putColor(ctx, colors, "neutral2_200", android.R.color.system_neutral2_200);
        putColor(ctx, colors, "neutral2_400", android.R.color.system_neutral2_400);
        putColor(ctx, colors, "neutral2_500", android.R.color.system_neutral2_500);
        putColor(ctx, colors, "neutral2_700", android.R.color.system_neutral2_700);
        out.put("supported", true);
        out.put("colors", colors);
        call.resolve(out);
    }

    private static void putColor(Context ctx, JSObject target, String key, int resId) {
        int value = ctx.getColor(resId);
        target.put(key, String.format("#%06X", value & 0xFFFFFF));
    }
}
