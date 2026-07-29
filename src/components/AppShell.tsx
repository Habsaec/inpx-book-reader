import React from 'react';
import { Home, Library, Search, MoreHorizontal, Wifi, WifiOff, RefreshCw, Download } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { BRAND_LOCKUP_SRC } from '../lib/brand';
import { semantic } from '../ui/tokens';

/** Internal ids kept for wiring; labels are storefront-style (Яндекс Книги). */
export type AppTab = 'home' | 'catalog' | 'library' | 'profile';

interface AppShellProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  siteName: string;
  logoSrc: string | null;
  isOnline: boolean;
  isVerifyingConnection: boolean;
  isSyncing?: boolean;
  queuedCount?: number;
  pendingSyncCount?: number;
  onOpenSyncCenter: () => void;
  children: React.ReactNode;
}

export default function AppShell({
  activeTab,
  onTabChange,
  siteName,
  logoSrc,
  isOnline,
  isVerifyingConnection,
  isSyncing = false,
  queuedCount = 0,
  pendingSyncCount = 0,
  onOpenSyncCenter,
  children,
}: AppShellProps) {
  let statusLabel = 'Офлайн';
  let StatusIcon = WifiOff;
  let iconClass = `${semantic.offline}`;

  if (isSyncing) {
    statusLabel = 'Синхронизация';
    StatusIcon = RefreshCw;
    iconClass = `${theme.accentText} animate-spin`;
  } else if (queuedCount > 0) {
    statusLabel = `Очередь ${queuedCount}`;
    StatusIcon = Download;
    iconClass = theme.accentText;
  } else if (isOnline) {
    statusLabel = 'Онлайн';
    StatusIcon = Wifi;
    iconClass = semantic.success;
  } else if (isVerifyingConnection) {
    statusLabel = 'Проверка связи';
    StatusIcon = WifiOff;
    iconClass = `${semantic.offline} animate-pulse`;
  }

  const ariaParts = [statusLabel];
  if (pendingSyncCount > 0) ariaParts.push(`${pendingSyncCount} ожидают синхронизации`);
  ariaParts.push('Открыть центр синхронизации');

  return (
    <div id="main-dashboard-tabs" className={`flex flex-col h-full min-h-0 flex-1 ${theme.bg} ${theme.text}`}>
      <div
        id="dashboard-navbar"
        className={`min-h-14 landscape:max-[500px]:min-h-12 flex items-center justify-between px-4 landscape:max-[500px]:px-2 select-none shrink-0 ${theme.bg}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {logoSrc ? (
            <>
              <img src={logoSrc} alt="" className="w-7 h-7 rounded-lg object-contain shrink-0 bg-white/80" />
              <span className={`font-semibold text-sm landscape:max-[500px]:text-xs tracking-tight truncate ${theme.text}`}>
                {siteName}
              </span>
            </>
          ) : (
            <img
              src={BRAND_LOCKUP_SRC}
              alt={siteName}
              className="h-7 max-w-[11.5rem] object-contain object-left shrink-0"
            />
          )}
        </div>

        <button
          type="button"
          onClick={onOpenSyncCenter}
          aria-label={ariaParts.join('. ')}
          className={`relative inline-flex items-center justify-center min-h-12 min-w-12 rounded-full ${theme.chipButton} ${theme.focusRing}`}
        >
          <StatusIcon className={`w-5 h-5 ${iconClass}`} aria-hidden />
          {pendingSyncCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 min-w-[1rem] h-[1rem] px-0.5 rounded-full bg-[var(--app-warning)] text-white text-[9px] font-bold leading-[1rem] text-center"
              aria-hidden
            >
              {pendingSyncCount > 99 ? '99+' : pendingSyncCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>

      <div
        id="mobile-tab-navigation"
        className={`border-t px-1 flex justify-around items-stretch shrink-0 z-10 select-none ${theme.header}`}
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {(
          [
            { id: 'home' as const, label: 'Главная', icon: Home },
            { id: 'catalog' as const, label: 'Поиск', icon: Search },
            { id: 'library' as const, label: 'Библиотека', icon: Library },
            { id: 'profile' as const, label: 'Ещё', icon: MoreHorizontal },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 min-h-12 py-2 transition-colors active:scale-[0.98] ${theme.focusRing} ${
                isActive ? theme.tabActive : theme.tabInactive
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} aria-hidden />
              <span className={`tab-label text-[11px] truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
