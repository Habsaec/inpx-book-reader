package ru.inpx.bookreader;

import android.app.Application;
import android.content.Context;

/**
 * Ранний HiddenApiBypass — до MainActivity и любых reflection к DeviceController.
 * На BOOX 4.2 / Android 13 без этого setLightValue остаётся в blacklist.
 */
public class BookReaderApp extends Application {
    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        OnyxFrontLight.applyHiddenApiExemptions();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        OnyxFrontLight.applyHiddenApiExemptions();
    }
}
