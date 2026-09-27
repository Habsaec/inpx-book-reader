import React from 'react';
import { ChevronLeft, Home, Library, BookOpen, User, Search, X } from 'lucide-react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { theme } from '../lib/appTheme';
import { motion as motionTokens, textStyles, radii, touchMin } from '../ui/tokens';
import { useCalmMotion } from '../hooks/useCalmMotion';
import { useFollowSpring } from '../ui/useFollowSpring';
import { useBackHandler } from '../hooks/useBackHandler';
import DownloadQueueWidget from './DownloadQueueWidget';
import HomeSearchBar from './HomeSearchBar';
import { PageTitleProvider, usePageTitleTop } from '../ui/pageTitle';
import type { ServerConfig } from '../types';

/** Internal ids kept for wiring; labels are storefront-style. */
export type AppTab = 'home' | 'catalog' | 'library' | 'profile';

const TABS = [
  { id: 'home' as const, label: 'Главная', icon: Home },
  { id: 'catalog' as const, label: 'Каталог', icon: Library },
  { id: 'library' as const, label: 'Мои книги', icon: BookOpen },
  { id: 'profile' as const, label: 'Профиль', icon: User },
] as const;

interface AppShellProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  siteName: string;
  logoSrc: string | null;
  isOnline: boolean;
  isVerifyingConnection: boolean;
  onOpenConnectionSettings?: () => void;
  onOpenQueue?: () => void;
  serverConfig: ServerConfig;
  onSearchSubmit: (query: string) => void;
  onSearchAuthor: (name: string) => void;
  onSearchSeries: (name: string) => void;
  onSearchBook: (book: { id: string; title: string; authors?: string; authorsDisplay?: string }) => void;
  children: React.ReactNode;
}

export default function AppShell(props: AppShellProps) {
  return (
    <PageTitleProvider>
      <ShellFrame {...props} />
    </PageTitleProvider>
  );
}

function ShellFrame({
  activeTab,
  onTabChange,
  siteName,
  logoSrc,
  isOnline,
  isVerifyingConnection,
  onOpenConnectionSettings,
  onOpenQueue,
  serverConfig,
  onSearchSubmit,
  onSearchAuthor,
  onSearchSeries,
  onSearchBook,
  children,
}: AppShellProps) {
  const calm = useCalmMotion();
  const follow = useFollowSpring(calm);
  const indicatorX = useMotionValue(0);
  const indicatorTransform = useTransform(indicatorX, (value) => `translateX(${value}px)`);
  const tabSeen = React.useRef<AppTab | null>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const tabRef = React.useRef<HTMLDivElement>(null);
  const [chrome, setChrome] = React.useState({ header: 64, tab: 72 });
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchField, setSearchField] = React.useState(false);
  const reveal = useMotionValue(0);
  const titleGrow = useTransform(reveal, (value) => 1 - value);
  const fieldGrow = useTransform(reveal, (value) => value);
  const searchOpenRef = React.useRef(false);
  const searchZoneRef = React.useRef<HTMLDivElement>(null);
  const searchToggleRef = React.useRef<HTMLButtonElement>(null);
  const pageTitle = usePageTitleTop();
  const showOfflineBanner =
    !isOnline && !isVerifyingConnection && (activeTab === 'catalog' || activeTab === 'home');
  const showSearch = activeTab !== 'profile';
  const title = pageTitle?.title || (
    activeTab === 'home' ? siteName
      : activeTab === 'catalog' ? 'Каталог'
        : activeTab === 'library' ? 'Мои книги'
          : 'Профиль'
  );
  const onBack = pageTitle?.onBack ?? null;

  React.useLayoutEffect(() => {
    const measure = () => {
      setChrome({
        header: headerRef.current?.offsetHeight ?? 64,
        tab: tabRef.current?.offsetHeight ?? 72,
      });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (headerRef.current) ro?.observe(headerRef.current);
    if (tabRef.current) ro?.observe(tabRef.current);
    return () => ro?.disconnect();
  }, [showOfflineBanner, searchOpen]);

  const btnRefs = React.useRef<Partial<Record<AppTab, HTMLButtonElement | null>>>({});
  const [indicatorReady, setIndicatorReady] = React.useState(false);

  const measureIndicator = React.useCallback(() => {
    const list = tabRef.current;
    const btn = btnRefs.current[activeTab];
    if (!list || !btn) {
      setIndicatorReady(false);
      tabSeen.current = null;
      return;
    }
    const listRect = list.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const nextX = btnRect.left - listRect.left + (btnRect.width - 32) / 2;
    setIndicatorReady(true);
    if (tabSeen.current !== activeTab) {
      if (tabSeen.current == null) indicatorX.set(nextX);
      else follow(indicatorX, nextX);
      tabSeen.current = activeTab;
    } else {
      indicatorX.set(nextX);
    }
  }, [activeTab, follow, indicatorX]);

  React.useLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator, chrome.tab]);

  React.useLayoutEffect(() => {
    searchOpenRef.current = searchOpen;
    if (searchOpen) setSearchField(true);
    follow(reveal, searchOpen ? 1 : 0);
  }, [searchOpen, follow, reveal]);

  React.useEffect(() => {
    return reveal.on('change', (value) => {
      if (value < 0.02 && !searchOpenRef.current) setSearchField(false);
    });
  }, [reveal]);

  React.useEffect(() => {
    setSearchOpen(false);
  }, [activeTab]);

  React.useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (searchZoneRef.current?.contains(target)) return;
      if (searchToggleRef.current?.contains(target)) return;
      setSearchOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [searchOpen]);

  useBackHandler(() => {
    setSearchOpen(false);
    return true;
  }, searchOpen && showSearch);

  return (
    <div
      id="main-dashboard-tabs"
      className={`relative flex flex-col h-full min-h-0 flex-1 ${theme.bg} ${theme.text}`}
      style={{
        ['--app-header-offset' as string]: `${chrome.header}px`,
        ['--app-tab-measured' as string]: `${chrome.tab}px`,
      }}
    >
      <div className="inpx-shell-body absolute inset-0 flex flex-col min-h-0">
        {showOfflineBanner && (
          <div
            className={`inpx-shell-notice px-5 py-3 shrink-0 flex items-center gap-3 border-b border-[color:var(--app-border)] ${theme.header}`}
            role="status"
          >
            <p className={`${textStyles.body} ${theme.textMuted} flex-1 min-w-0 leading-snug`}>
              Нет связи — каталог и скачивание недоступны
            </p>
            {onOpenConnectionSettings ? (
              <button
                type="button"
                onClick={onOpenConnectionSettings}
                className={`${touchMin} shrink-0 px-3 ${textStyles.captionBold} ${theme.accentText} ${radii.button} ${theme.focusRing} ${motionTokens.press}`}
              >
                Подключить
              </button>
            ) : null}
          </div>
        )}

        <DownloadQueueWidget onOpenQueue={onOpenQueue} />

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
      </div>

      <div
        ref={headerRef}
        id="dashboard-navbar"
        className="inpx-chrome inpx-chrome-top absolute top-0 inset-x-0 z-30 min-h-16 landscape:max-[500px]:min-h-12 flex items-center px-1 select-none"
      >
        {onBack ? (
          <button
            type="button"
            aria-label="Назад"
            onClick={onBack}
            className={`w-12 h-12 shrink-0 inline-flex items-center justify-center ${radii.md} ${theme.focusRing} ${motionTokens.press}`}
          >
            <ChevronLeft className="w-6 h-6" aria-hidden />
          </button>
        ) : (
          <div className="w-3 shrink-0" aria-hidden />
        )}
        <div className="flex flex-1 min-w-0 items-center pl-2 gap-2">
          {logoSrc && !onBack ? (
            <img
              src={logoSrc}
              alt=""
              className="w-8 h-8 shrink-0 rounded-lg object-cover"
            />
          ) : null}
          <motion.h1
            aria-hidden={searchOpen}
            className={`min-w-0 overflow-hidden truncate text-base font-semibold whitespace-nowrap ${theme.text}`}
            style={{ flexGrow: titleGrow, flexBasis: 0 }}
          >
            {title}
          </motion.h1>
          {showSearch ? (
            <motion.div
              ref={searchZoneRef}
              className="inpx-search-clip relative min-w-0"
              style={{ flexGrow: fieldGrow, flexBasis: 0 }}
            >
              {searchField ? (
                <HomeSearchBar
                  serverConfig={serverConfig}
                  isOnline={isOnline}
                  inputId="shell-search"
                  autoFocus={searchOpen}
                  onDismiss={() => setSearchOpen(false)}
                  onSubmitSearch={onSearchSubmit}
                  onPickAuthor={onSearchAuthor}
                  onPickSeries={onSearchSeries}
                  onPickBook={onSearchBook}
                />
              ) : null}
            </motion.div>
          ) : null}
        </div>
        {showSearch ? (
          <button
            ref={searchToggleRef}
            type="button"
            aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск'}
            onClick={() => {
              setSearchOpen((open) => {
                const next = !open;
                if (next) setSearchField(true);
                return next;
              });
            }}
            className={`w-12 h-12 shrink-0 inline-flex items-center justify-center ${radii.md} ${theme.focusRing} ${motionTokens.press}`}
          >
            {searchOpen ? <X className="w-5 h-5" aria-hidden /> : <Search className="w-5 h-5" aria-hidden />}
          </button>
        ) : (
          <div className="w-3 shrink-0" aria-hidden />
        )}
      </div>

      <div
        ref={tabRef}
        id="mobile-tab-navigation"
        className="inpx-chrome inpx-chrome-bottom absolute inset-x-0 bottom-0 z-30 px-2 pt-1.5 flex justify-around items-stretch select-none"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {indicatorReady ? (
          <motion.span
            aria-hidden
            className="absolute top-0 left-0 h-0.5 w-8 rounded-full bg-[var(--app-link)]"
            style={{ transform: indicatorTransform }}
          />
        ) : null}
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                btnRefs.current[tab.id] = el;
              }}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 min-h-14 py-1 ${theme.focusRing} ${motionTokens.press} ${
                isActive ? theme.tabActive : theme.tabInactive
              }`}
            >
              <span className="inline-flex items-center justify-center w-12 h-8">
                <Icon
                  className="w-6 h-6"
                  strokeWidth={isActive ? 2.4 : 1.75}
                  aria-hidden
                />
              </span>
              <span className={`tab-label ${textStyles.tabLabel} truncate max-w-full ${isActive ? '' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
