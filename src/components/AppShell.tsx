import React from 'react';
import { Home, Library, BookOpen, MoreHorizontal, Wifi, WifiOff, Download } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { BRAND_LOCKUP_SRC } from '../lib/brand';
import { motion, semantic, radii, elevation } from '../ui/tokens';
import DownloadQueueWidget from './DownloadQueueWidget';

/** Internal ids kept for wiring; labels are storefront-style (Яндекс Книги). */
export type AppTab = 'home' | 'catalog' | 'library' | 'profile';

interface AppShellProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  siteName: string;
  logoSrc: string | null;
  isOnline: boolean;
  isVerifyingConnection: boolean;
  queuedCount?: number;
  children: React.ReactNode;
}

export default function AppShell({
  activeTab,
  onTabChange,
  siteName,
  logoSrc,
  isOnline,
  isVerifyingConnection,
  queuedCount = 0,
  children,
}: AppShellProps) {
  let statusLabel = 'Офлайн';
  let StatusIcon = WifiOff;
  let iconClass = `${semantic.offline}`;

  if (queuedCount > 0) {
    statusLabel = `Очередь скачивания ${queuedCount}`;
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

  return (
    <div id="main-dashboard-tabs" className={`flex flex-col h-full min-h-0 flex-1 ${theme.bg} ${theme.text}`}>
      <div
        id="dashboard-navbar"
        className={`min-h-14 landscape:max-[500px]:min-h-12 flex items-center justify-between px-5 landscape:max-[500px]:px-4 select-none shrink-0 border-b border-[color:var(--app-border)] ${theme.header}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {logoSrc ? (
            <>
              <img src={logoSrc} alt="" className={`w-8 h-8 ${radii.md} object-contain shrink-0 bg-[var(--app-surface)] border border-[color:var(--app-border)]`} />
              <span className={`font-bold text-sm landscape:max-[500px]:text-xs tracking-tight truncate ${theme.text}`}>
                {siteName}
              </span>
            </>
          ) : (
            <img
              src={BRAND_LOCKUP_SRC}
              alt={siteName}
              className="h-8 max-w-[12rem] object-contain object-left shrink-0"
            />
          )}
        </div>

        <span
          className={`inline-flex items-center justify-center min-h-12 min-w-12 ${radii.full} ${theme.panel}`}
          title={statusLabel}
          aria-label={statusLabel}
          role="status"
        >
          <StatusIcon className={`w-5 h-5 ${iconClass}`} aria-hidden />
        </span>
      </div>

      {!isOnline && !isVerifyingConnection && (
        <div
          className={`px-5 py-2.5 shrink-0 text-xs font-medium leading-snug border-b ${theme.header} ${semantic.warning}`}
          role="status"
        >
          Нет связи — каталог недоступен, скачанное можно читать
        </div>
      )}

      {/* Visible on every tab while downloads run — not only on Home. */}
      {activeTab !== 'home' && <DownloadQueueWidget banner />}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>

      <div
        id="mobile-tab-navigation"
        className={`border-t border-[color:var(--app-border)] px-3 pt-2 flex justify-around items-stretch shrink-0 z-10 select-none ${theme.header} ${elevation.card}`}
        style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
      >
        {(
          [
            { id: 'home' as const, label: 'Главная', icon: Home },
            { id: 'library' as const, label: 'Мои книги', icon: BookOpen },
            { id: 'catalog' as const, label: 'Каталог', icon: Library },
            { id: 'profile' as const, label: 'Настройки', icon: MoreHorizontal },
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
              className={`relative flex flex-col items-center justify-center gap-1 min-w-0 flex-1 min-h-14 py-1.5 transition-[colors,transform] duration-200 ease-out active:scale-95 ${theme.focusRing} ${
                isActive ? theme.tabActive : theme.tabInactive
              }`}
            >
              <span
                className={`relative inline-flex items-center justify-center w-11 h-11 ${radii.full} transition-[colors,transform] duration-200 ease-out ${
                  isActive
                    ? `${theme.accentMuted} ${elevation.card}`
                    : 'bg-transparent'
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${motion.navIcon} ${isActive ? 'scale-105' : 'scale-100'}`}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  aria-hidden
                />
                {tab.id === 'home' && queuedCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[var(--app-link)] text-[10px] font-bold text-white flex items-center justify-center">
                    {queuedCount > 9 ? '9+' : queuedCount}
                  </span>
                )}
              </span>
              <span className={`tab-label text-[11px] font-semibold truncate ${isActive ? '' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
