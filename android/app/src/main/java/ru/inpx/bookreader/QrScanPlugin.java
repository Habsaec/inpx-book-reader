package ru.inpx.bookreader;

import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.moduleinstall.ModuleInstall;
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

/**
 * Сканер QR через Google Code Scanner (Play Services): UI и декодер живут в Play Services,
 * в APK декодера нет и разрешение CAMERA не нужно.
 *
 * scan() → { value } | reject(code): CANCELED, MODULE_INSTALLING, UNSUPPORTED, иначе текст ошибки.
 */
@CapacitorPlugin(name = "QrScan")
public class QrScanPlugin extends Plugin {

    @PluginMethod
    public void scan(PluginCall call) {
        if (!getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
            call.reject("No camera", "UNSUPPORTED");
            return;
        }
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(getContext(), options);
        ModuleInstall.getClient(getContext())
            .areModulesAvailable(scanner)
            .addOnSuccessListener(response -> {
                if (response.areModulesAvailable()) {
                    startScan(call, scanner);
                } else {
                    installModule(call, scanner);
                }
            })
            .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage()), "UNSUPPORTED", e));
    }

    private void installModule(PluginCall call, GmsBarcodeScanner scanner) {
        ModuleInstall.getClient(getContext())
            .installModules(ModuleInstallRequest.newBuilder().addApi(scanner).build())
            .addOnSuccessListener(r -> call.reject("Scanner module installing", "MODULE_INSTALLING"))
            .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage()), "UNSUPPORTED", e));
    }

    private void startScan(PluginCall call, GmsBarcodeScanner scanner) {
        scanner
            .startScan()
            .addOnSuccessListener(barcode -> {
                JSObject out = new JSObject();
                out.put("value", barcode.getRawValue());
                call.resolve(out);
            })
            .addOnCanceledListener(() -> call.reject("Scan canceled", "CANCELED"))
            .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage()), e));
    }
}
