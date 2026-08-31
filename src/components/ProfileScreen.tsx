import React from 'react';
import { theme } from '../lib/appTheme';
import { InpxProfile } from '../lib/inpxClient';
import { ServerConfig } from '../types';
import SyncSettingsTab from './SyncSettingsTab';
import type { AppAppearance, AppColorSource } from '../lib/serverTheme';
import type { EinkModePref } from '../lib/einkMode';
import type { StorageDirectory } from '../lib/storageDirectory';
import { textStyles, semantic, radii, elevation } from '../ui/tokens';
import { TextBlockSkeleton } from '../ui/Skeleton';

interface ProfileScreenProps {
  profile: InpxProfile | null;
  loading: boolean;
  error: string;
  isOnline: boolean;
  serverConfig: ServerConfig;
  onChangeServerConfig: (config: Partial<ServerConfig>) => void;
  onTestConnection: () => void;
  onPairingLogin: (result: {
    url: string;
    username: string;
    deviceToken: string;
    deviceTokenId: string;
  }) => void;
  onForgetServer?: () => void;
  connectionError?: string | null;
  lastSynced: string | null;
  storageDirectory: StorageDirectory | null;
  onChangeStorageDirectory: (dir: StorageDirectory | null) => void;
  appearance: AppAppearance;
  onChangeAppearance: (mode: AppAppearance) => void;
  colorSource: AppColorSource;
  onChangeColorSource: (source: AppColorSource) => void;
  useServerBackground: boolean;
  onChangeUseServerBackground: (on: boolean) => void;
  hasServerBackground: boolean;
  isAppDark: boolean;
  einkMode: EinkModePref;
  onChangeEinkMode: (mode: EinkModePref) => void;
  einkDetected: boolean;
  /** Local device stats MVP */
  localBookCount?: number;
  localInProgressCount?: number;
  connectionFocusEpoch?: number;
}

export default function ProfileScreen({
  profile,
  loading,
  error,
  isOnline,
  serverConfig,
  onChangeServerConfig,
  onTestConnection,
  onPairingLogin,
  onForgetServer,
  connectionError,
  lastSynced,
  storageDirectory,
  onChangeStorageDirectory,
  appearance,
  onChangeAppearance,
  colorSource,
  onChangeColorSource,
  useServerBackground,
  onChangeUseServerBackground,
  hasServerBackground,
  isAppDark,
  einkMode,
  onChangeEinkMode,
  einkDetected,
  localBookCount = 0,
  localInProgressCount = 0,
  connectionFocusEpoch = 0,
}: ProfileScreenProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className={`px-5 pt-4 pb-3 shrink-0 ${theme.bg}`}>
        <h2 className={textStyles.title}>Настройки</h2>
        {profile && isOnline ? (
          <p className={`${textStyles.caption} ${theme.textMuted} mt-1 truncate`}>
            {profile.user.username}
          </p>
        ) : !isOnline ? (
          <p className={`${textStyles.caption} ${theme.textMuted} mt-1`}>Офлайн — локальные настройки доступны</p>
        ) : null}
        {(localBookCount > 0 || localInProgressCount > 0) && (
          <div className={`mt-3 px-4 py-3 ${radii.lg} ${theme.panel} ${elevation.card}`}>
            <p className={`${textStyles.caption} ${theme.textMuted}`}>
              На устройстве: <span className={`${textStyles.bodyBold} ${theme.text}`}>{localBookCount}</span>{' '}
              {localBookCount === 1 ? 'книга' : localBookCount < 5 ? 'книги' : 'книг'}
              {localInProgressCount > 0 ? ` · ${localInProgressCount} в процессе` : ''}
            </p>
          </div>
        )}
      </div>

      {loading && !profile ? (
        <div className="px-5 py-4">
          <TextBlockSkeleton lines={5} />
          <div className="mt-4">
            <TextBlockSkeleton lines={4} />
          </div>
        </div>
      ) : error && isOnline && !loading ? (
        <p className={`mx-5 mt-1 px-4 py-3 ${radii.lg} ${semantic.errorBg} ${textStyles.caption}`} role="alert">
          {error}
        </p>
      ) : null}

      <SyncSettingsTab
        embedded
        storageDirectory={storageDirectory}
        onChangeStorageDirectory={onChangeStorageDirectory}
        appearance={appearance}
        onChangeAppearance={onChangeAppearance}
        colorSource={colorSource}
        onChangeColorSource={onChangeColorSource}
        useServerBackground={useServerBackground}
        onChangeUseServerBackground={onChangeUseServerBackground}
        hasServerBackground={hasServerBackground}
        isAppDark={isAppDark}
        einkMode={einkMode}
        onChangeEinkMode={onChangeEinkMode}
        einkDetected={einkDetected}
        serverConfig={serverConfig}
        onChangeServerConfig={onChangeServerConfig}
        onTestConnection={onTestConnection}
        onPairingLogin={onPairingLogin}
        onForgetServer={onForgetServer}
        connectionError={connectionError}
        lastSynced={lastSynced}
        connectionFocusEpoch={connectionFocusEpoch}
      />
    </div>
  );
}
