import React from 'react';
import { QrCode, FolderOpen, CheckCircle2, ArrowRight } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic, radii, motion } from '../ui/tokens';
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

const STEP_LABELS = ['Вход', 'Папка', 'Готово'] as const;

function shortFolderName(dir: StorageDirectory | null): string {
  const raw = (dir?.label || DEFAULT_STORAGE_LABEL).trim();
  if (!raw) return DEFAULT_STORAGE_LABEL;
  if (/^content:\/\//i.test(raw) || raw.includes('%3A') || raw.length > 48) {
    const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || DEFAULT_STORAGE_LABEL);
  }
  return raw;
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
    <div className={`flex-1 min-h-0 flex flex-col ${theme.bg} ${theme.text}`} style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="px-5 pb-4 shrink-0" style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top, 0px))' }}>
        <div className="flex gap-2 mb-3">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-1 flex-1 rounded-full ${
                n <= step ? 'bg-[var(--app-link)]' : 'bg-[var(--app-panel-soft)]'
              }`}
            />
          ))}
        </div>
        <p className={`${textStyles.caption} ${theme.textMuted}`}>
          Шаг {step} из 3 · {STEP_LABELS[step - 1]}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-6">
        {step === 1 && (
          <>
            <div>
              <h1 className={textStyles.title}>Добро пожаловать</h1>
              <p className={`${textStyles.body} ${theme.textMuted} mt-2`}>
                Ваша библиотека всегда с собой. Подключите INPX Library Server.
              </p>
            </div>

            {isAndroid() && (
              <Button fullWidth loading={scanning} onClick={() => void handleScanQr()}>
                <QrCode className="w-5 h-5" aria-hidden /> Сканировать QR
              </Button>
            )}

            {(scanError || connectionError) && (
              <p className={`${textStyles.caption} ${semantic.error}`} role="alert">
                {scanError || connectionError}
              </p>
            )}

            {connected && (
              <p className={`${textStyles.caption} ${semantic.success} inline-flex items-center gap-2`}>
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden /> Подключено к серверу
              </p>
            )}

            <Button fullWidth variant="secondary" disabled={!connected} onClick={() => setStep(2)}>
              Далее <ArrowRight className="w-4 h-4" aria-hidden />
            </Button>

            <button
              type="button"
              className={`w-full text-center min-h-12 ${textStyles.body} ${theme.accentText} ${theme.focusRing} ${motion.press}`}
              onClick={() => setManualLoginOpen((v) => !v)}
              aria-expanded={manualLoginOpen}
            >
              {manualLoginOpen ? 'Скрыть вход по паролю' : 'Войти по логину и паролю'}
            </button>

            {manualLoginOpen && (
              <div className={`space-y-4 pt-2 border-t ${theme.divider}`}>
                <label className={`block ${textStyles.caption} ${theme.textMuted}`}>
                  Адрес сервера
                  <input
                    className={`mt-2 w-full ${radii.md} px-4 py-3.5 ${theme.input} ${theme.inputFocus}`}
                    value={serverConfig.url}
                    onChange={(e) => onChangeServerConfig({ url: e.target.value })}
                    placeholder="http://192.168.1.10:3000"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </label>
                {httpWarning && (
                  <p className={`${textStyles.caption} ${semantic.warning}`}>{httpWarning}</p>
                )}
                <label className={`block ${textStyles.caption} ${theme.textMuted}`}>
                  Логин
                  <input
                    className={`mt-2 w-full ${radii.md} px-4 py-3.5 ${theme.input} ${theme.inputFocus}`}
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
                    className={`mt-2 w-full ${radii.md} px-4 py-3.5 ${theme.input} ${theme.inputFocus}`}
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
              <h1 className={textStyles.title}>Где хранить книги?</h1>
              <p className={`${textStyles.body} ${theme.textMuted} mt-2`}>
                Книги доступны офлайн после скачивания.
              </p>
            </div>

            <div>
              <p className={`${textStyles.caption} ${theme.textMuted}`}>Папка хранения</p>
              <p className={`${textStyles.body} mt-1 break-all`}>{shortFolderName(storageDirectory)}</p>
            </div>

            <Button
              fullWidth
              loading={picking}
              variant={isValidStorageDirectory(storageDirectory) ? 'secondary' : 'primary'}
              onClick={() => void handlePick()}
            >
              <FolderOpen className="w-4 h-4" aria-hidden />
              {isValidStorageDirectory(storageDirectory) ? 'Изменить папку' : 'Выбрать папку'}
            </Button>
            <Button
              fullWidth
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
                Ваша библиотека готова.
              </p>
            </div>
            <Button fullWidth onClick={onComplete}>
              Открыть библиотеку
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setStep(2)}>
              Назад
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
