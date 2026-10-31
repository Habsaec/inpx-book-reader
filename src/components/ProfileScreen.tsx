import React from 'react';
import { ChevronRight, Users } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { InpxProfile } from '../lib/inpxClient';
import { ServerConfig } from '../types';
import SyncSettingsTab from './SyncSettingsTab';
import type { AppAppearance, AppColorSource } from '../lib/serverTheme';
import type { EinkModePref } from '../lib/einkMode';
import type { StorageDirectory } from '../lib/storageDirectory';
import { textStyles, semantic, radii, motion } from '../ui/tokens';
import type { LibrarySeg } from './mybooks/LibraryCollections';
import ReadingGoalCard from './ReadingGoalCard';
import AccountSwitcherSheet from './AccountSwitcherSheet';
import { listSavedAccounts, rememberAccount } from '../lib/accounts';
import { clearServerCredentials } from '../lib/secureServerConfig';

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
  isAppDark: boolean;
  einkMode: EinkModePref;
  onChangeEinkMode: (mode: EinkModePref) => void;
  einkDetected: boolean;
  localBookCount?: number;
  localInProgressCount?: number;
  connectionFocusEpoch?: number;
  updateFocusEpoch?: number;
  isTabActive?: boolean;
  rootEpoch?: number;
  /** Stat tiles open the matching «Мои книги» collection. */
  onOpenLibrary?: (seg: LibrarySeg) => void;
  onAuthExpired?: () => void;
}

const MEMBER_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** Service logins read as a role, not as a name. */
const SERVICE_LOGINS = new Set(['admin', 'administrator', 'root', 'user', 'guest']);

function displayName(username: string, role?: string): string {
  if (!username) return '';
  if (SERVICE_LOGINS.has(username.toLowerCase())) return role === 'admin' ? 'Администратор' : 'Читатель';
  return username;
}

/** One or two letters for the avatar: «Иван Петров» → «ИП», «habsaec» → «H». */
function initialsOf(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.charAt(0);
  return letters.toUpperCase();
}

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
  isAppDark,
  einkMode,
  onChangeEinkMode,
  einkDetected,
  localBookCount = 0,
  localInProgressCount = 0,
  connectionFocusEpoch = 0,
  updateFocusEpoch = 0,
  isTabActive = true,
  rootEpoch = 0,
  onOpenLibrary,
  onAuthExpired,
}: ProfileScreenProps) {
  const username = profile?.user?.username?.trim() || serverConfig.username?.trim() || '';
  const name = displayName(username, profile?.user?.role);
  const initial = name ? initialsOf(name) : '';
  const nameIsRole = Boolean(name && name !== username);
  const stats = profile?.userStats;
  const since = memberSince(stats?.createdAt);
  const readingCount = stats ? stats.readingCount : localInProgressCount;
  const statusNote = serverConfig.connectionStatus === 'testing'
    ? 'Подключение к серверу…'
    : !isOnline
      ? 'Офлайн — локальные настройки доступны'
      : '';
  const [statsOpen, setStatsOpen] = React.useState(false);
  const [accountsOpen, setAccountsOpen] = React.useState(false);
  /** Scrolls to the login form after «Добавить пользователя». */
  const [loginFocusEpoch, setLoginFocusEpoch] = React.useState(0);
  const handleAddAccount = async () => {
    setAccountsOpen(false);
    const snapshot = serverConfig;
    await rememberAccount(snapshot).catch(() => undefined);
    onChangeServerConfig({ username: '', password: '', deviceToken: '', deviceTokenId: '', connectionStatus: 'disconnected' });
    // No revoke: the saved account keeps its device token for switching back.
    await clearServerCredentials({ ...snapshot, deviceTokenId: '' }).catch(() => undefined);
    setLoginFocusEpoch((n) => n + 1);
  };
  const statTiles: Array<{ label: string; value: number; seg: LibrarySeg }> = [
    { label: 'На устройстве', value: localBookCount, seg: 'downloaded' },
    // The server count is the «Читаю» list; offline only the device list (sorted by last read) is there.
    { label: 'Читаете', value: readingCount, seg: stats ? 'reading' : 'downloaded' },
    ...(stats ? [{ label: 'Прочитано', value: stats.readBooksCount, seg: 'read' as const }] : []),
  ];
  const statRows: Array<{ label: string; value: number; seg: LibrarySeg }> = stats
    ? [
        { label: 'Закладки', value: stats.readerBookmarksCount, seg: 'bookmarks' },
        { label: 'Заметки', value: stats.readerAnnotationsCount, seg: 'notes' },
        { label: 'Полки', value: stats.shelvesCount + (stats.smartShelvesCount ?? 0), seg: 'shelves' },
        { label: 'Авторы', value: stats.favoriteAuthorsCount, seg: 'favorites' },
        { label: 'Серии', value: stats.favoriteSeriesCount, seg: 'favorites' },
        ...(stats.ratedCount != null ? [{ label: 'Мои оценки', value: stats.ratedCount, seg: 'rated' as const }] : []),
      ]
    : [];

  const profileHeader = (
    <div>
      <div className="flex items-center gap-4">
        {initial ? (
          <span
            className="w-16 h-16 shrink-0 rounded-full inline-flex items-center justify-center font-serif text-[1.625rem] font-semibold bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
            aria-hidden
          >
            {initial}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {name ? (
            <p className={`font-serif text-[1.375rem] leading-7 font-semibold ${theme.text} truncate`}>{name}</p>
          ) : null}
          {nameIsRole ? (
            <p className={`${textStyles.caption} ${theme.textMuted}`}>Логин {username}</p>
          ) : profile?.user?.role === 'admin' ? (
            <p className={`${textStyles.caption} ${theme.textMuted}`}>Администратор</p>
          ) : null}
          {since ? (
            <p className={`${textStyles.caption} ${theme.textMuted}`}>{since}</p>
          ) : null}
          {statusNote ? (
            <p className={`${textStyles.caption} ${theme.textMuted}`}>{statusNote}</p>
          ) : null}
        </div>
        {username || listSavedAccounts().length > 0 ? (
          <button
            type="button"
            onClick={() => setAccountsOpen(true)}
            aria-haspopup="dialog"
            className={`shrink-0 min-h-12 px-3 inline-flex items-center gap-1.5 ${radii.button} ${textStyles.captionBold} ${theme.chip} ${theme.chipHover} ${theme.focusRing} ${motion.press}`}
          >
            <Users className="w-4 h-4" aria-hidden />
            Сменить
          </button>
        ) : null}
      </div>
      <ul
        className="mt-5 grid gap-3"
        // As many columns as tiles: two tiles (no server stats yet) must not leave a hole.
        style={{ gridTemplateColumns: `repeat(${statTiles.length}, minmax(0, 1fr))` }}
      >
        {statTiles.map((tile) => (
          <li key={tile.label}>
            <button
              type="button"
              disabled={!onOpenLibrary}
              onClick={() => onOpenLibrary?.(tile.seg)}
              className={`w-full h-full p-3 text-left ${radii.lg} ${theme.card} ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
            >
              <span className={`block ${textStyles.statNumber} ${theme.text}`}>{tile.value}</span>
              <span className={`block ${textStyles.caption} ${theme.textMuted} leading-tight`}>{tile.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {statRows.length ? (
        <div className={`mt-3 overflow-hidden ${radii.lg} ${theme.card}`}>
          <button
            type="button"
            className={`w-full min-h-12 px-4 py-3 flex items-center justify-between text-left ${theme.rowPress} ${theme.focusRing} ${motion.press}`}
            aria-expanded={statsOpen}
            onClick={() => setStatsOpen((open) => !open)}
          >
            <span className={`${textStyles.bodyBold} ${theme.text}`}>Статистика</span>
            <ChevronRight
              className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-out ${statsOpen ? 'rotate-90' : ''} ${theme.textMuted}`}
              aria-hidden
            />
          </button>
          <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${statsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="min-h-0 overflow-hidden">
              <ul aria-label="Статистика">
                {statRows.map((row) => (
                  <li key={row.label}>
                    <button
                      type="button"
                      disabled={!onOpenLibrary}
                      onClick={() => onOpenLibrary?.(row.seg)}
                      className={`w-full min-h-12 px-4 py-3 flex items-center justify-between gap-3 text-left border-t ${theme.divider} ${theme.rowPress} ${theme.focusRing}`}
                    >
                      <span className={`${textStyles.body} ${theme.textMuted}`}>{row.label}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`tabular-nums ${textStyles.bodyBold} ${theme.text}`}>{row.value}</span>
                        <ChevronRight className={`w-4 h-4 ${theme.textMuted}`} aria-hidden />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
      {stats && isOnline ? (
        <ReadingGoalCard
          serverConfig={serverConfig}
          isOnline={isOnline}
          refreshKey={(isTabActive ? 1 : 0) + rootEpoch * 2 + (stats.readBooksCount || 0) * 1000}
          onAuthExpired={onAuthExpired}
        />
      ) : null}
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
        connectionFocusEpoch={connectionFocusEpoch + loginFocusEpoch}
        updateFocusEpoch={updateFocusEpoch}
        active={isTabActive}
        rootEpoch={rootEpoch}
      />
      <AccountSwitcherSheet
        open={accountsOpen}
        onClose={() => setAccountsOpen(false)}
        serverConfig={serverConfig}
        onAddAccount={() => void handleAddAccount()}
      />
    </div>
  );
}
