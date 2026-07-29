import React from 'react';
import { theme } from '../lib/appTheme';
import { InpxProfile } from '../lib/inpxClient';
import { ServerConfig } from '../types';
import SyncSettingsTab from './SyncSettingsTab';
import type { AppThemeMode } from '../lib/serverTheme';
import type { EinkModePref } from '../lib/einkMode';
import type { StorageDirectory } from '../lib/storageDirectory';
import { textStyles, semantic } from '../ui/tokens';
import { TextBlockSkeleton } from '../ui/Skeleton';

interface ProfileScreenProps {
  profile: InpxProfile | null;
  loading: boolean;
  error: string;
  isOnline: boolean;
  serverConfig: ServerConfig;
  onChangeServerConfig: (config: Partial<ServerConfig>) => void;
  onTestConnection: () => void;
  onForgetServer?: () => void;
  connectionError?: string | null;
  lastSynced: string | null;
  storageDirectory: StorageDirectory | null;
  onChangeStorageDirectory: (dir: StorageDirectory | null) => void;
  appTheme: AppThemeMode;
  onChangeTheme: (theme: AppThemeMode) => void;
  isAppDark: boolean;
  einkMode: EinkModePref;
  onChangeEinkMode: (mode: EinkModePref) => void;
  einkDetected: boolean;
}

export default function ProfileScreen({
  profile,
  loading,
  error,
  isOnline,
  serverConfig,
  onChangeServerConfig,
  onTestConnection,
  onForgetServer,
  connectionError,
  lastSynced,
  storageDirectory,
  onChangeStorageDirectory,
  appTheme,
  onChangeTheme,
  isAppDark,
  einkMode,
  onChangeEinkMode,
  einkDetected,
}: ProfileScreenProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className={`px-4 pt-3 pb-2 shrink-0 ${theme.bg}`}>
        <h2 className={textStyles.title}>Ещё</h2>
        {profile && isOnline ? (
          <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5 truncate`}>
            {profile.user.username}
            {lastSynced ? ` · синхр. ${lastSynced}` : ''}
          </p>
        ) : !isOnline ? (
          <p className={`${textStyles.caption} ${theme.textMuted} mt-0.5`}>Офлайн — локальные настройки доступны</p>
        ) : null}
      </div>

      {loading && !profile ? (
        <div className="px-4 py-4">
          <TextBlockSkeleton lines={5} />
          <div className="mt-4">
            <TextBlockSkeleton lines={4} />
          </div>
        </div>
      ) : error && isOnline && !loading ? (
        <p className={`mx-4 mt-1 px-3 py-2 rounded-xl ${semantic.errorBg} ${textStyles.caption}`} role="alert">
          {error}
        </p>
      ) : null}

      <SyncSettingsTab
        embedded
        storageDirectory={storageDirectory}
        onChangeStorageDirectory={onChangeStorageDirectory}
        appTheme={appTheme}
        onChangeTheme={onChangeTheme}
        isAppDark={isAppDark}
        einkMode={einkMode}
        onChangeEinkMode={onChangeEinkMode}
        einkDetected={einkDetected}
        serverConfig={serverConfig}
        onChangeServerConfig={onChangeServerConfig}
        onTestConnection={onTestConnection}
        onForgetServer={onForgetServer}
        connectionError={connectionError}
        lastSynced={lastSynced}
      />
    </div>
  );
}
