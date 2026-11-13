package ru.inpx.bookreader;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * «Домашний экран» (лаунчер для читалок вроде BOOX): невидимый трамплин с фильтром HOME.
 *
 * Компонент выключен в манифесте и включается в «Профиль → Внешний вид → Домашний экран»
 * ({@link LauncherHomePlugin#setEnabled}). Нажатие «Домой» запускает его в домашнем таске системы;
 * он сразу выводит обычный таск приложения ({@link MainActivity}, singleTask) на главную вкладку
 * и закрывается. HOME не вешается на саму MainActivity: тогда система могла бы создать второй
 * экземпляр WebView в своём домашнем таске.
 */
public class LauncherHomeActivity extends Activity {

    public static final String EXTRA_LAUNCHER_HOME = "launcherHome";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent open = new Intent(this, MainActivity.class)
            .setAction(LaunchIntentPlugin.ACTION_OPEN)
            .putExtra(LaunchIntentPlugin.EXTRA_TARGET, "home")
            .putExtra(EXTRA_LAUNCHER_HOME, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(open);
        } catch (RuntimeException ignored) {
            // Не должно случаться: MainActivity — наша же activity.
        }
        overridePendingTransition(0, 0);
        finish();
    }
}
