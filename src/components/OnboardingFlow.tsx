import React from 'react';
import { Server, FolderOpen, CheckCircle2, ArrowRight } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, semantic } from '../ui/tokens';
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

interface OnboardingFlowProps {
  serverConfig: ServerConfig;
  onChangeServerConfig: (config: Partial<ServerConfig>) => void;
  onTestConnection: () => void;
  connectionError?: string | null;
  storageDirectory: StorageDirectory | null;
  onChangeStorageDirectory: (dir: StorageDirectory | null) => void;
  onComplete: () => void;
}

export default function OnboardingFlow({
  serverConfig,
  onChangeServerConfig,
  onTestConnection,
  connectionError,
  storageDirectory,
  onChangeStorageDirectory,
  onComplete,
}: OnboardingFlowProps) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [picking, setPicking] = React.useState(false);
  const httpWarning = insecureHttpWarning(serverConfig.url);
  const connected = serverConfig.connectionStatus === 'connected';
  const testing = serverConfig.connectionStatus === 'testing';

  React.useEffect(() => {
    if (step === 2 && isAndroid() && !isValidStorageDirectory(storageDirectory)) {
      void ensureStorageDirectory(storageDirectory).then((resolved) => {
        if (resolved) onChangeStorageDirectory(resolved);
      });
    }
  }, [step, storageDirectory, onChangeStorageDirectory]);

  React.useEffect(() => {
    if (connected && step === 1) setStep(2);
  }, [connected, step]);

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
      <div className="px-5 pt-8 pb-4 shrink-0">
        <img src={BRAND_LOCKUP_SRC} alt="INPX Reader" className="h-9 w-auto max-w-[12rem] object-contain mb-4" />
        <p className={`${textStyles.caption} ${theme.textMuted}`}>Шаг {step} из 3</p>
        <div className="flex gap-1.5 mt-2">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-[var(--app-link)]' : 'bg-[var(--app-panel-soft)]'}`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-4">
        {step === 1 && (
          <>
            <div className="flex items-center gap-2">
              <Server className={`w-5 h-5 ${theme.accentText}`} aria-hidden />
              <h1 className={textStyles.title}>Сервер библиотеки</h1>
            </div>
            <p className={`${textStyles.body} ${theme.textMuted}`}>
              Укажите адрес INPX Library Server и учётные данные.
            </p>
            <label className={`block ${textStyles.caption} ${theme.textMuted}`}>
              URL
              <input
                className={`mt-1 w-full rounded-xl border px-3 py-3 ${theme.input} ${theme.inputFocus}`}
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
                className={`mt-1 w-full rounded-xl border px-3 py-3 ${theme.input} ${theme.inputFocus}`}
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
                className={`mt-1 w-full rounded-xl border px-3 py-3 ${theme.input} ${theme.inputFocus}`}
                value={serverConfig.password}
                onChange={(e) => onChangeServerConfig({ password: e.target.value })}
              />
            </label>
            {connectionError && (
              <p className={`${textStyles.caption} ${semantic.error}`} role="alert">{connectionError}</p>
            )}
            {connected && (
              <p className={`${textStyles.caption} ${semantic.success} inline-flex items-center gap-1`}>
                <CheckCircle2 className="w-4 h-4" aria-hidden /> Подключено
              </p>
            )}
            <Button fullWidth loading={testing} onClick={onTestConnection}>
              Проверить подключение
            </Button>
            <Button
              fullWidth
              variant="secondary"
              disabled={!connected}
              onClick={() => setStep(2)}
            >
              Далее <ArrowRight className="w-4 h-4" aria-hidden />
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex items-center gap-2">
              <FolderOpen className={`w-5 h-5 ${theme.accentText}`} aria-hidden />
              <h1 className={textStyles.title}>Папка книг</h1>
            </div>
            <p className={`${textStyles.body} ${theme.textMuted}`}>
              Скачанные книги сохраняются в выбранную папку на устройстве.
            </p>
            <div>
              <p className={`${textStyles.caption} ${theme.textMuted}`}>Текущая папка</p>
              <p className={`${textStyles.bodyBold} mt-1 break-all`}>
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
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`w-5 h-5 ${semantic.success}`} aria-hidden />
              <h1 className={textStyles.title}>Готово</h1>
            </div>
            <p className={`${textStyles.body} ${theme.textMuted}`}>
              Можно искать книги, скачивать и читать офлайн. Прогресс и закладки синхронизируются с сервером.
            </p>
            <ul className={`${textStyles.body} ${theme.textMuted} space-y-2 list-disc pl-5`}>
              <li>Главная — продолжить чтение и полки</li>
              <li>Поиск — найти и скачать книгу</li>
              <li>Библиотека — файлы на устройстве</li>
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
  );
}
