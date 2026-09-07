import React from 'react';
import { RefreshCw, Download, PackageCheck } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { isNativeApp } from '../lib/platform';
import {
  AppUpdate,
  checkForAppUpdate,
  getCurrentAppVersion,
  type AppUpdateCheckResult,
} from '../lib/appUpdate';
import { textStyles, radii, elevation } from '../ui/tokens';
import Button from '../ui/Button';
import { useSnackbar } from '../ui/Snackbar';

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

type DownloadPhase = 'none' | 'downloading' | 'done';

/** Настройки → «Обновление приложения»: проверка GitHub-релизов, скачивание APK, установка. */
export default function AppUpdateSection() {
  const snackbar = useSnackbar();
  const [currentVersion, setCurrentVersion] = React.useState('—');
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState<AppUpdateCheckResult | null>(null);
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<DownloadPhase>('none');
  const [progress, setProgress] = React.useState<{ loaded: number; total: number } | null>(null);

  React.useEffect(() => {
    if (!isNativeApp()) return;
    void getCurrentAppVersion().then(setCurrentVersion);
  }, []);

  if (!isNativeApp()) return null;

  const handleCheck = async () => {
    setChecking(true);
    setCheckError(null);
    setResult(null);
    setPhase('none');
    setProgress(null);
    try {
      setResult(await checkForAppUpdate());
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const handleDownload = async () => {
    if (!result?.apkUrl) return;
    setPhase('downloading');
    setProgress({ loaded: 0, total: result.apkSize });
    let listener: { remove: () => Promise<void> } | null = null;
    try {
      listener = await AppUpdate.addListener('apkDownloadProgress', (event) => {
        setProgress({ loaded: event.loaded, total: event.total > 0 ? event.total : result.apkSize });
      });
      await AppUpdate.downloadApk({ url: result.apkUrl });
      setPhase('done');
    } catch (e) {
      setPhase('none');
      setProgress(null);
      snackbar.show(
        `Не удалось скачать обновление: ${e instanceof Error ? e.message : String(e)}`,
        undefined,
        'error',
      );
    } finally {
      await listener?.remove().catch(() => {});
    }
  };

  const handleInstall = async () => {
    try {
      await AppUpdate.installApk();
    } catch (e) {
      snackbar.show(
        `Не удалось запустить установку: ${e instanceof Error ? e.message : String(e)}`,
        undefined,
        'error',
      );
    }
  };

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
      : 0;

  return (
    <section className={`${radii.lg} ${theme.card} ${elevation.card} p-5 space-y-4`}>
      <div className="flex justify-between items-center">
        <h3 className={textStyles.sectionLabel}>Обновление приложения</h3>
        <span className={`${textStyles.caption} ${theme.textMuted}`}>v{currentVersion}</span>
      </div>

      {checkError && (
        <p className={`${textStyles.caption} text-[var(--app-danger)]`}>
          Не удалось проверить обновления: {checkError}
        </p>
      )}

      {result && !result.updateAvailable && (
        <p className={`${textStyles.caption} ${theme.textMuted}`}>
          Установлена последняя версия (v{result.currentVersion}).
        </p>
      )}

      {result?.updateAvailable && (
        <div className="space-y-3">
          <p className={textStyles.body}>
            Доступна новая версия: <strong>v{result.latestVersion}</strong>
            {result.apkSize > 0 ? ` (${formatMb(result.apkSize)} МБ)` : ''}
          </p>
          {result.notes && (
            <details>
              <summary className={`${textStyles.caption} ${theme.accentText} cursor-pointer select-none`}>
                Что нового
              </summary>
              <p className={`${textStyles.caption} ${theme.textMuted} whitespace-pre-wrap mt-2`}>
                {result.notes}
              </p>
            </details>
          )}
          {phase === 'downloading' && (
            <div className="space-y-1.5">
              <div className={`h-1.5 ${radii.full} ${theme.panel} overflow-hidden`}>
                <div
                  className={`h-full ${theme.progress} transition-[width] duration-200`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className={`${textStyles.caption} ${theme.textMuted}`}>
                {progress ? `${formatMb(progress.loaded)} / ${formatMb(progress.total)} МБ` : ''}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {result?.updateAvailable && phase === 'none' && (
          <Button fullWidth onClick={handleDownload}>
            <Download className="w-4 h-4 inline mr-1" aria-hidden />
            Скачать
          </Button>
        )}
        {result?.updateAvailable && phase === 'done' && (
          <Button fullWidth onClick={handleInstall}>
            <PackageCheck className="w-4 h-4 inline mr-1" aria-hidden />
            Установить
          </Button>
        )}
        <Button
          variant="secondary"
          fullWidth={!result?.updateAvailable}
          onClick={handleCheck}
          loading={checking}
          disabled={checking || phase === 'downloading'}
        >
          {checking ? (
            'Проверка…'
          ) : (
            <>
              <RefreshCw className="w-4 h-4 inline mr-1" aria-hidden />
              Проверить обновления
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
