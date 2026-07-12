package ru.inpx.bookreader;

import android.content.Context;
import android.util.AttributeSet;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.View;
import com.getcapacitor.CapacitorWebView;

public class ReaderCapacitorWebView extends CapacitorWebView {

    private static volatile boolean systemTextSelectionMenuEnabled = true;
    private static ActionMode dummyActionMode;

    public ReaderCapacitorWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public static void setSystemTextSelectionMenuEnabled(boolean enabled) {
        systemTextSelectionMenuEnabled = enabled;
    }

    public static boolean isSystemTextSelectionMenuEnabled() {
        return systemTextSelectionMenuEnabled;
    }

    private static ActionMode getDummyActionMode() {
        if (dummyActionMode != null) return dummyActionMode;
        dummyActionMode =
            new ActionMode() {
                @Override
                public void setTitle(CharSequence title) {}

                @Override
                public void setTitle(int resId) {}

                @Override
                public void setSubtitle(CharSequence subtitle) {}

                @Override
                public void setSubtitle(int resId) {}

                @Override
                public void setCustomView(View view) {}

                @Override
                public void invalidate() {}

                @Override
                public void finish() {}

                @Override
                public Menu getMenu() {
                    return null;
                }

                @Override
                public CharSequence getTitle() {
                    return null;
                }

                @Override
                public CharSequence getSubtitle() {
                    return null;
                }

                @Override
                public View getCustomView() {
                    return null;
                }

                @Override
                public MenuInflater getMenuInflater() {
                    return null;
                }
            };
        return dummyActionMode;
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback) {
        if (!systemTextSelectionMenuEnabled) {
            return getDummyActionMode();
        }
        return super.startActionMode(callback);
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback, int type) {
        if (!systemTextSelectionMenuEnabled) {
            return getDummyActionMode();
        }
        return super.startActionMode(callback, type);
    }
}
