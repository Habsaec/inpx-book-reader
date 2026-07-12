import React from 'react';
import { Home, Library, Star, User, BookOpen } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { BRAND_LOCKUP_SRC } from '../lib/brand';
import { semantic } from '../ui/tokens';

export type AppTab = 'home' | 'catalog' | 'library' | 'profile';

interface AppShellProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  siteName: string;
  logoSrc: string | null;
  isOnline: boolean;
  isVerifyingConnection: boolean;
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
  onOpenSyncCenter,
  children,
}: AppShellProps) {
  return (
    <div id="main-dashboard-tabs" className={`flex flex-col h-full min-h-0 flex-1 ${theme.bg} ${theme.text} select-none`}>
      <div
        id="dashboard-navbar"
        className={`h-14 landscape:max-[500px]:h-9 flex items-center justify-between px-4 landscape:max-[500px]:px-2 select-none shrink-0 border-b ${theme.header}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {logoSrc ? (
            <>
              <img src={logoSrc} alt="" className="w-7 h-7 rounded-lg object-contain shrink-0 bg-white/80" />
              <span className={`font-extrabold text-sm landscape:max-[500px]:text-xs tracking-tight truncate ${theme.text}`}>
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
          aria-label={
            isOnline
              ? 'Онлайн. Синхронизация'
              : isVerifyingConnection
                ? 'Проверка подключения. Синхронизация'
                : 'Офлайн. Синхронизация'
          }
          className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${theme.chip} border-[color:var(--app-border)] ${theme.chipButton} ${theme.focusRing}`}
        >
          <Star
            className={`w-3.5 h-3.5 ${
              isOnline
                ? `${semantic.success} fill-[var(--app-success)]`
                : `${semantic.offline} fill-[var(--app-offline)]${isVerifyingConnection ? ' animate-pulse' : ''}`
            }`}
          />
          <span className="landscape:max-[500px]:hidden">
            {isOnline ? 'Онлайн' : isVerifyingConnection ? 'Проверка…' : 'Офлайн'}
          </span>
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
            { id: 'catalog' as const, label: 'Каталог', icon: BookOpen },
            { id: 'library' as const, label: 'Мои книги', icon: Library },
            { id: 'profile' as const, label: 'Профиль', icon: User },
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
              className={`flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 min-h-12 py-2 transition-colors active:scale-[0.98] ${theme.focusRing} ${isActive ? theme.tabActive : theme.tabInactive}`}
            >
              <Icon className="w-5 h-5" aria-hidden />
              <span className="text-xs font-bold truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
