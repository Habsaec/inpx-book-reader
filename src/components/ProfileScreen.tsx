import React from 'react';
import { ChevronRight } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { InpxProfile } from '../lib/inpxClient';
import { ServerConfig } from '../types';
import SyncSettingsTab from './SyncSettingsTab';
import type { AppAppearance, AppColorSource } from '../lib/serverTheme';
import type { EinkModePref } from '../lib/einkMode';
import type { StorageDirectory } from '../lib/storageDirectory';
import { textStyles, semantic, radii, motion } from '../ui/tokens';

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
  localBookCount?: number;
  localInProgressCount?: number;
  connectionFocusEpoch?: number;
}

const MEMBER_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function memberSince(createdAt: string | null | undefined): string {
  if (!createdAt) return '';
  const parsed = new Date(createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return '';
  const month = MEMBER_MONTHS[parsed.getMonth()];
  return month ? `в библиотеке с ${month} ${parsed.getFullYear()}` : '';
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
  const username = profile?.user.username?.trim() || serverConfig.username?.trim() || '';
  const initial = username ? username.charAt(0).toUpperCase() : '';
  const stats = profile?.userStats;
  const since = memberSince(stats?.createdAt);
  const readingCount = stats ? stats.readingCount : localInProgressCount;
  const statusNote = serverConfig.connectionStatus === 'testing'
    ? 'Подключение к серверу…'
    : !isOnline
      ? 'Офлайн — локальные настройки доступны'
      : '';
  const [statsOpen, setStatsOpen] = React.useState(false);
  const statRows = [
    { label: 'На устройстве', value: localBookCount },
    { label: 'Читаете', value: readingCount },
    ...(stats
      ? [
          { label: 'Прочитано', value: stats.readBooksCount },
          { label: 'Закладки', value: stats.readerBookmarksCount },
          { label: 'Заметки', value: stats.readerAnnotationsCount },
          { label: 'Полки', value: stats.shelvesCount },
          { label: 'Авторы', value: stats.favoriteAuthorsCount },
          { label: 'Серии', value: stats.favoriteSeriesCount },
        ]
      : []),
  ];

  const profileHeader = (
    <div>
      <div className="flex items-center gap-3">
        {initial ? (
          <span
            className={`w-10 h-10 shrink-0 rounded-full inline-flex items-center justify-center ${theme.avatarBg} ${textStyles.bodyBold} ${theme.text}`}
            aria-hidden
          >
            {initial}
          </span>
        ) : null}
        <div className="min-w-0">
          {username ? (
            <p className={`${textStyles.bodyBold} ${theme.text} truncate`}>{username}</p>
          ) : null}
          {profile?.user.role === 'admin' ? (
            <p className={`${textStyles.caption} ${theme.textMuted}`}>Администратор</p>
          ) : null}
          {statusNote ? (
            <p className={`${textStyles.caption} ${theme.textMuted}`}>{statusNote}</p>
          ) : null}
        </div>
      </div>
      {since ? (
        <p className={`${textStyles.caption} ${theme.textMuted} mt-2`}>{since}</p>
      ) : null}
      <div className={`mt-4 overflow-hidden border ${theme.divider} ${radii.md}`}>
        <button
          type="button"
          className={`w-full px-4 py-3 flex items-center justify-between text-left ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
          aria-expanded={statsOpen}
          onClick={() => setStatsOpen((open) => !open)}
        >
          <span className={`${textStyles.body} ${theme.text}`}>Статистика</span>
          <ChevronRight
            className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-out ${statsOpen ? 'rotate-90' : ''} ${theme.textMuted}`}
            aria-hidden
          />
        </button>
        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${statsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="min-h-0 overflow-hidden">
            <table className="w-full border-separate border-spacing-0">
              <caption className="sr-only">Статистика</caption>
              <tbody>
                {statRows.map((row) => (
                  <tr key={row.label}>
                    <th
                      scope="row"
                      className={`px-4 py-3 text-left font-normal border-t ${theme.divider} ${textStyles.body} ${theme.textMuted}`}
                    >
                      {row.label}
                    </th>
                    <td
                      className={`px-4 py-3 text-right tabular-nums border-t ${theme.divider} ${textStyles.bodyBold} ${theme.text}`}
                    >
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {error && isOnline && !loading ? (
        <p className={`mt-4 ${textStyles.caption} ${semantic.error}`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <SyncSettingsTab
        embedded
        scrollHeader={profileHeader}
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
        connectionFocusEpoch={connectionFocusEpoch}
      />
    </div>
  );
}
