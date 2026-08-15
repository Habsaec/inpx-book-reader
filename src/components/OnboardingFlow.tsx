import React from 'react';
import { Server, FolderOpen, CheckCircle2, ArrowRight, QrCode, BookOpen, Library, Home } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic, elevation, radii, motion } from '../ui/tokens';
import Button from '../ui/Button';
import type { ServerConfig } from '../types';
import {
  StorageDirectory,
  pickStorageDirectory,
  ensureStorageDirectory,
  isValidStorageDirectory,
  DEFAULT_STORAGE_LABEL,
} from '../lib/storageDirectory';
import { isAndroid } from '../lib/platform';
import { insecureHttpWarning } from '../lib/serverUrl';
import { BRAND_LOCKUP_SRC } from '../lib/brand';
import { parsePairingQrPayload, redeemPairingCode } from '../lib/inpxClient';
import { scanAppPairingQr, isQrScanCanceled } from '../lib/scanAppPairingQr';
import { useBackHandler } from '../hooks/useBackHandler';

interface OnboardingFlowProps {
  serverConfig: ServerConfig;
  onChangeServerConfig: (config: Partial<ServerConfig>) => void;
  onTestConnection: () => void;
  onPairingLogin: (result: {
    url: string;
    username: string;
    deviceToken: string;
    deviceTokenId: string;
  }) => void;
  connectionError?: string | null;
  storageDirectory: StorageDirectory | null;
  onChangeStorageDirectory: (dir: StorageDirectory | null) => void;
  onComplete: () => void;
}

const STEP_META = [
  { icon: Server, label: 'Подключение' },
  { icon: FolderOpen, label: 'Папка книг' },
  { icon: CheckCircle2, label: 'Готово' },
] as const;

function StepIcon({ step }: { step: 1 | 2 | 3 }) {
  const Icon = STEP_META[step - 1].icon;
  return (
    <span
      className={`inline-flex items-center justify-center w-14 h-14 ${radii.lg} ${theme.accentMuted} ${elevation.card}`}
      aria-hidden
    >
      <Icon className={`w-7 h-7 ${step === 3 ? semantic.success : theme.accentText}`} />
    </span>
  );
}

export default function OnboardingFlow({
  serverConfig,
  onChangeServerConfig,
  onTestConnection,
  onPairingLogin,
  connectionError,
  storageDirectory,
  onChangeStorageDirectory,
  onComplete,
}: OnboardingFlowProps) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [picking, setPicking] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);
  const [manualLoginOpen, setManualLoginOpen] = React.useState(false);
  const scanGenRef = React.useRef(0);
  const httpWarning = insecureHttpWarning(serverConfig.url);
  const connected = serverConfig.connectionStatus === 'connected';
  const testing = serverConfig.connectionStatus === 'testing';

  const handleScanQr = async () => {
    const gen = ++scanGenRef.current;
    setScanning(true);
    setScanError(null);
    try {
      const raw = await scanAppPairingQr();
      if (gen !== scanGenRef.current) return;
      const payload = parsePairingQrPayload(raw);
      const redeemed = await redeemPairingCode(payload.url, payload.code);
      if (gen !== scanGenRef.current) return;
      onPairingLogin({
        url: redeemed.serverUrl || payload.url,
        username: redeemed.username,
        deviceToken: redeemed.deviceToken,
        deviceTokenId: redeemed.deviceTokenId,
      });
    } catch (err) {
      if (gen !== scanGenRef.current) return;
      if (isQrScanCanceled(err)) return;
      setScanError(err instanceof Error ? err.message : 'Не удалось войти по QR');
    } finally {
      if (gen === scanGenRef.current) setScanning(false);
    }
  };

  React.useEffect(() => {
    if (step !== 2 || !isAndroid() || isValidStorageDirectory(storageDirectory)) return;
    let cancelled = false;
    void ensureStorageDirectory(storageDirectory)
      .then((resolved) => {
        if (!cancelled && resolved) onChangeStorageDirectory(resolved);
      })
      .catch((err) => console.warn('[OnboardingFlow] ensureStorageDirectory failed:', err));
    return () => {
      cancelled = true;
    };
  }, [step, storageDirectory, onChangeStorageDirectory]);

  React.useEffect(() => {
    if (connected && step === 1) setStep(2);
  }, [connected, step]);

  useBackHandler(() => {
    if (step <= 1) return false;
    setStep((s) => (s === 3 ? 2 : 1));
    return true;
  });

  const handlePick = async () => {
    setPicking(true);
    try {
      const picked = await pickStorageDirectory();
      if (picked) onChangeStorageDirectory(picked);
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className={`flex-1 min-h-0 flex flex-col ${theme.bg} ${theme.text}`}>
      <div className="px-6 pt-10 pb-5 shrink-0">
        <img src={BRAND_LOCKUP_SRC} alt="INPX Reader" className="h-10 w-auto max-w-[13rem] object-contain mb-6" />
        <div className="flex gap-2 mb-3">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                n <= step ? 'bg-[var(--app-link)]' : 'bg-[var(--app-panel-soft)]'
              }`}
            />
          ))}
        </div>
        <p className={`${textStyles.caption} ${theme.textMuted}`}>
          Шаг {step} из 3 · {STEP_META[step - 1].label}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <div className={`${radii.lg} ${theme.card} ${elevation.card} p-6 space-y-5 inpx-enter-y`}>
          <StepIcon step={step} />

          {step === 1 && (
            <>
              <div>
                <h1 className={textStyles.title}>Подключение</h1>
                <p className={`${textStyles.body} ${theme.textMuted} mt-2`}>
                  Отсканируйте QR из профиля на сайте библиотеки — или войдите вручную.
                </p>
              </div>

              {isAndroid() && (
                <Button fullWidth loading={scanning} onClick={() => void handleScanQr()}>
                  <QrCode className="w-5 h-5" aria-hidden /> Сканировать QR
                </Button>
              )}

              {(scanError || connectionError) && (
                <p className={`${textStyles.caption} ${semantic.error} ${semantic.errorBg} ${radii.md} px-4 py-3`} role="alert">
                  {scanError || connectionError}
                </p>
              )}

              {connected && (
                <p className={`${textStyles.caption} ${semantic.success} ${semantic.successBg} ${radii.md} px-4 py-3 inline-flex items-center gap-2 w-full`}>
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden /> Подключено к серверу
                </p>
              )}

              <Button fullWidth variant="secondary" disabled={!connected} onClick={() => setStep(2)}>
                Далее <ArrowRight className="w-4 h-4" aria-hidden />
              </Button>

              <button
                type="button"
                className={`w-full text-center ${textStyles.captionBold} ${theme.accentText} ${theme.focusRing} ${radii.button} py-3 ${motion.press}`}
                onClick={() => setManualLoginOpen((v) => !v)}
                aria-expanded={manualLoginOpen}
              >
                {manualLoginOpen ? 'Скрыть вход по паролю' : 'Войти по логину и паролю'}
              </button>

              {manualLoginOpen && (
                <div className={`space-y-4 pt-2 border-t ${theme.divider}`}>
                  <label className={`block ${textStyles.caption} ${theme.textMuted}`}>
                    URL сервера
                    <input
                      className={`mt-2 w-full ${radii.lg} px-4 py-3.5 ${theme.input} ${theme.inputFocus}`}
                      value={serverConfig.url}
                      onChange={(e) => onChangeServerConfig({ url: e.target.value })}
                      placeholder="http://192.168.1.10:3000"
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </label>
                  {httpWarning && (
                    <p className={`${textStyles.caption} ${semantic.warning} ${semantic.warningBg} ${radii.md} px-4 py-3`}>
                      {httpWarning}
                    </p>
                  )}
                  <label className={`block ${textStyles.caption} ${theme.textMuted}`}>
                    Логин
                    <input
                      className={`mt-2 w-full ${radii.lg} px-4 py-3.5 ${theme.input} ${theme.inputFocus}`}
                      value={serverConfig.username}
                      onChange={(e) => onChangeServerConfig({ username: e.target.value })}
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </label>
                  <label className={`block ${textStyles.caption} ${theme.textMuted}`}>
                    Пароль
                    <input
                      type="password"
                      className={`mt-2 w-full ${radii.lg} px-4 py-3.5 ${theme.input} ${theme.inputFocus}`}
                      value={serverConfig.password}
                      onChange={(e) => onChangeServerConfig({ password: e.target.value })}
                    />
                  </label>
                  <Button fullWidth loading={testing} onClick={onTestConnection}>
                    Проверить подключение
                  </Button>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h1 className={textStyles.title}>Папка книг</h1>
                <p className={`${textStyles.body} ${theme.textMuted} mt-2`}>
                  Скачанные книги сохраняются в выбранную папку на устройстве.
                </p>
              </div>

              <div className={`${radii.lg} ${theme.panel} p-4`}>
                <p className={`${textStyles.caption} ${theme.textMuted}`}>Текущая папка</p>
                <p className={`${textStyles.bodyBold} mt-1.5 break-all`}>
                  {storageDirectory?.label || DEFAULT_STORAGE_LABEL}
                </p>
              </div>

              <Button fullWidth loading={picking} onClick={() => void handlePick()}>
                Выбрать папку
              </Button>
              <Button
                fullWidth
                variant="secondary"
                disabled={!isValidStorageDirectory(storageDirectory) && isAndroid()}
                onClick={() => setStep(3)}
              >
                Далее <ArrowRight className="w-4 h-4" aria-hidden />
              </Button>
              <Button fullWidth variant="ghost" onClick={() => setStep(1)}>
                Назад
              </Button>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h1 className={textStyles.title}>Всё готово</h1>
                <p className={`${textStyles.body} ${theme.textMuted} mt-2`}>
                  Можно искать книги, скачивать и читать офлайн. Прогресс и закладки синхронизируются с сервером.
                </p>
              </div>

              <ul className="space-y-3">
                {[
                  { icon: Home, text: 'Главная — продолжить чтение и полки' },
                  { icon: Library, text: 'Каталог — найти и скачать книгу' },
                  { icon: BookOpen, text: 'Мои книги — файлы на устройстве' },
                ].map(({ icon: Icon, text }) => (
                  <li
                    key={text}
                    className={`flex items-start gap-3 ${radii.lg} ${theme.panel} px-4 py-3.5`}
                  >
                    <span className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl ${theme.accentMuted}`}>
                      <Icon className={`w-4 h-4 ${theme.accentText}`} aria-hidden />
                    </span>
                    <span className={`${textStyles.body} ${theme.textMuted} pt-1.5`}>{text}</span>
                  </li>
                ))}
              </ul>

              <Button fullWidth onClick={onComplete}>
                Начать
              </Button>
              <Button fullWidth variant="ghost" onClick={() => setStep(2)}>
                Назад
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
