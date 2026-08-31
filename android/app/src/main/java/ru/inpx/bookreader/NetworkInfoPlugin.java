package ru.inpx.bookreader;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "NetworkInfo",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION }),
        @Permission(alias = "nearbyWifi", strings = { "android.permission.NEARBY_WIFI_DEVICES" })
    }
)
public class NetworkInfoPlugin extends Plugin {

    private ConnectivityManager.NetworkCallback callback;

    @Override
    public void load() {
        super.load();
        ConnectivityManager cm = connectivity();
        if (cm == null) return;
        callback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                notifyListeners("networkChange", currentStatus());
            }

            @Override
            public void onLost(Network network) {
                notifyListeners("networkChange", currentStatus());
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                notifyListeners("networkChange", currentStatus());
            }
        };
        try {
            if (Build.VERSION.SDK_INT >= 24) {
                cm.registerDefaultNetworkCallback(callback);
            } else {
                cm.registerNetworkCallback(new NetworkRequest.Builder().build(), callback);
            }
        } catch (Exception ignored) {
            /* optional */
        }
    }

    @Override
    protected void handleOnDestroy() {
        ConnectivityManager cm = connectivity();
        if (cm != null && callback != null) {
            try {
                cm.unregisterNetworkCallback(callback);
            } catch (Exception ignored) {
                /* already gone */
            }
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(currentStatus());
    }

    @PluginMethod
    public void requestSsidAccess(PluginCall call) {
        String alias = Build.VERSION.SDK_INT >= 33 ? "nearbyWifi" : "location";
        if (getPermissionState(alias) == PermissionState.GRANTED || hasSsidPermission()) {
            call.resolve(currentStatus());
            return;
        }
        requestPermissionForAlias(alias, call, "ssidPermissionCallback");
    }

    @PermissionCallback
    private void ssidPermissionCallback(PluginCall call) {
        call.resolve(currentStatus());
    }

    private boolean hasSsidPermission() {
        Context ctx = getContext();
        if (ctx == null) return false;
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(ctx, "android.permission.NEARBY_WIFI_DEVICES")
                == PackageManager.PERMISSION_GRANTED;
        }
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    private ConnectivityManager connectivity() {
        Context ctx = getContext();
        if (ctx == null) return null;
        return (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
    }

    private JSObject currentStatus() {
        JSObject out = new JSObject();
        out.put("transport", "none");
        out.put("ssid", "");
        ConnectivityManager cm = connectivity();
        if (cm == null) return out;
        try {
            Network active = cm.getActiveNetwork();
            if (active == null) return out;
            NetworkCapabilities caps = cm.getNetworkCapabilities(active);
            if (caps == null) return out;
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                out.put("transport", "wifi");
                out.put("ssid", readSsid(caps));
            } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                out.put("transport", "cellular");
            } else {
                out.put("transport", "other");
            }
        } catch (Exception ignored) {
            /* keep defaults */
        }
        return out;
    }

    private String readSsid(NetworkCapabilities caps) {
        if (Build.VERSION.SDK_INT >= 31 && caps != null) {
            try {
                Object info = caps.getTransportInfo();
                if (info instanceof WifiInfo) {
                    String fromCaps = cleanSsid(((WifiInfo) info).getSSID());
                    if (!fromCaps.isEmpty()) return fromCaps;
                }
            } catch (Exception ignored) {
                /* fall through */
            }
        }
        try {
            Context ctx = getContext();
            if (ctx == null) return "";
            WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm == null) return "";
            WifiInfo info = wm.getConnectionInfo();
            if (info == null) return "";
            return cleanSsid(info.getSSID());
        } catch (Exception e) {
            return "";
        }
    }

    private static String cleanSsid(String ssid) {
        if (ssid == null) return "";
        ssid = ssid.trim();
        if (ssid.equals("<unknown ssid>") || ssid.equals("0x") || ssid.equals("unknown ssid")) {
            return "";
        }
        if (ssid.length() >= 2 && ssid.startsWith("\"") && ssid.endsWith("\"")) {
            ssid = ssid.substring(1, ssid.length() - 1);
        }
        return ssid;
    }
}
