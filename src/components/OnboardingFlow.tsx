import React from 'react';
import { QrCode, FolderOpen, CheckCircle2, ArrowRight, Library, type LucideIcon } from 'lucide-react';
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
import { t } from '../i18n';

function StepIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className={`mb-4 inline-flex ${theme.accentText}`}>
      <Icon className="w-9 h-9" aria-hidden strokeWidth={1.5} />
    </span>
  );
}

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

const STEP_LABELS = [t('onboardingFlow.signIn'), t('common.folder'), t('common.done')] as const;

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
      setScanError(err instanceof Error ? err.message : t('common.couldNotSignInWith'));
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
    <div className={`flex-1 min-h-0 flex flex-col ${theme.bg} ${theme.text}`} style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <div className="px-[max(1.25rem,calc((100%_-_30rem)/2))] pb-4 shrink-0" style={{ paddingTop: 'max(2.5rem, var(--safe-top))' }}>
        <div className="flex gap-2 mb-3">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-1 flex-1 rounded-full ${
                n <= step ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-border)]'
              }`}
            />
          ))}
        </div>
        <p className={`${textStyles.caption} ${theme.textMuted}`}>
          {t('onboardingFlow.step', { step, label: STEP_LABELS[step - 1] })}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-[max(1.25rem,calc((100%_-_30rem)/2))] pb-8 space-y-6">
        {step === 1 && (
          <>
            <div>
              <StepIcon icon={Library} />
              <h1 className={textStyles.title}>{t('onboardingFlow.welcome')}</h1>
              <p className={`${textStyles.body} ${theme.textMuted} mt-2`}>
                {t('onboardingFlow.yourLibraryIsAlwaysWith')}
              </p>
            </div>

            {isAndroid() && (
              <Button fullWidth loading={scanning} onClick={() => void handleScanQr()}>
                <QrCode className="w-5 h-5" aria-hidden /> {t('common.scanQr')}
              </Button>
            )}

            {(scanError || connectionError) && (
              <p className={`${textStyles.caption} ${semantic.error}`} role="alert">
                {scanError || connectionError}
              </p>
            )}

            {connected && (
              <p className={`${textStyles.caption} ${semantic.success} inline-flex items-center gap-2`}>
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden /> {t('onboardingFlow.connectedToTheServer')}
              </p>
            )}

            <Button fullWidth variant="secondary" disabled={!connected} onClick={() => setStep(2)}>
              {t('onboardingFlow.next')} <ArrowRight className="w-4 h-4" aria-hidden />
            </Button>

            <button
              type="button"
              className={`w-full text-center min-h-12 ${textStyles.body} ${theme.accentText} ${theme.focusRing} ${motion.press}`}
              onClick={() => setManualLoginOpen((v) => !v)}
              aria-expanded={manualLoginOpen}
            >
              {manualLoginOpen ? t('onboardingFlow.hidePasswordSignIn') : t('onboardingFlow.signInWithLoginAnd')}
            </button>

            {manualLoginOpen && (
              <div className="space-y-4 pt-2">
                <label className={`block ${textStyles.caption} ${theme.textMuted}`}>
                  {t('common.serverAddress')}
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
                  {t('common.login')}
                  <input
                    className={`mt-2 w-full ${radii.md} px-4 py-3.5 ${theme.input} ${theme.inputFocus}`}
                    value={serverConfig.username}
                    onChange={(e) => onChangeServerConfig({ username: e.target.value })}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </label>
                <label className={`block ${textStyles.caption} ${theme.textMuted}`}>
                  {t('common.password')}
                  <input
                    type="password"
                    className={`mt-2 w-full ${radii.md} px-4 py-3.5 ${theme.input} ${theme.inputFocus}`}
                    value={serverConfig.password}
                    onChange={(e) => onChangeServerConfig({ password: e.target.value })}
                  />
                </label>
                <Button fullWidth loading={testing} onClick={onTestConnection}>
                  {t('onboardingFlow.checkTheConnection')}
                </Button>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <StepIcon icon={FolderOpen} />
              <h1 className={textStyles.title}>{t('onboardingFlow.whereToKeepBooks')}</h1>
              <p className={`${textStyles.body} ${theme.textMuted} mt-2`}>
                {t('onboardingFlow.booksAreAvailableOfflineAfter')}
              </p>
            </div>

            <div className={`p-4 ${radii.lg} ${theme.card}`}>
              <p className={`${textStyles.caption} ${theme.textMuted}`}>{t('onboardingFlow.storageFolder')}</p>
              <p className={`${textStyles.body} mt-1 break-all`}>{shortFolderName(storageDirectory)}</p>
            </div>

            <Button
              fullWidth
              loading={picking}
              variant={isValidStorageDirectory(storageDirectory) ? 'secondary' : 'primary'}
              onClick={() => void handlePick()}
            >
              <FolderOpen className="w-4 h-4" aria-hidden />
              {isValidStorageDirectory(storageDirectory) ? t('onboardingFlow.changeTheFolder') : t('common.chooseAFolder')}
            </Button>
            <Button
              fullWidth
              disabled={!isValidStorageDirectory(storageDirectory) && isAndroid()}
              onClick={() => setStep(3)}
            >
              {t('onboardingFlow.next')} <ArrowRight className="w-4 h-4" aria-hidden />
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setStep(1)}>
              {t('common.back')}
            </Button>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <StepIcon icon={CheckCircle2} />
              <h1 className={textStyles.title}>{t('onboardingFlow.allSet')}</h1>
              <p className={`${textStyles.body} ${theme.textMuted} mt-2`}>
                {t('onboardingFlow.yourLibraryIsReady')}
              </p>
            </div>
            <Button fullWidth onClick={onComplete}>
              {t('onboardingFlow.openTheLibrary')}
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setStep(2)}>
              {t('common.back')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
