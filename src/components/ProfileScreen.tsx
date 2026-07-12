import React from 'react';
import { User, Settings } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { InpxProfile } from '../lib/inpxClient';
import { ServerConfig } from '../types';
import SyncSettingsTab from './SyncSettingsTab';
import type { AppThemeMode } from '../lib/serverTheme';
import type { StorageDirectory } from '../lib/storageDirectory';
import { textStyles } from '../ui/tokens';
import { BookListSkeleton } from '../ui/Skeleton';

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
}: ProfileScreenProps) {
  const [showSettings, setShowSettings] = React.useState(true);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className={`px-4 py-3 shrink-0 border-b ${theme.header}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <User className={`w-5 h-5 shrink-0 ${theme.accentText}`} />
            <div className="min-w-0">
              <h2 className={textStyles.title}>Профиль</h2>
              {profile && isOnline && (
                <p className={`${textStyles.caption} ${theme.textMuted} truncate`}>{profile.user.username}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Настройки"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((v) => !v)}
            className={`min-h-12 min-w-12 inline-flex items-center justify-center rounded-lg ${theme.chipButton} ${theme.focusRing} ${showSettings ? theme.accentMuted : ''}`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading && !profile ? (
        <div className="px-4 py-4">
          <BookListSkeleton count={2} />
        </div>
      ) : error && !isOnline ? (
        <p className={`mx-4 mt-3 ${textStyles.caption} ${theme.textMuted}`}>Офлайн — настройки и локальные книги доступны</p>
      ) : null}

      {showSettings && (
        <SyncSettingsTab
          embedded
          storageDirectory={storageDirectory}
          onChangeStorageDirectory={onChangeStorageDirectory}
          appTheme={appTheme}
          onChangeTheme={onChangeTheme}
          isAppDark={isAppDark}
          serverConfig={serverConfig}
          onChangeServerConfig={onChangeServerConfig}
          onTestConnection={onTestConnection}
          onForgetServer={onForgetServer}
          connectionError={connectionError}
          lastSynced={lastSynced}
        />
      )}
    </div>
  );
}
