/** Design tokens — единая типографика и отступы для Android UI. */

export const textStyles = {
  /** 12px — микротекст, бейджи, chips (минимум для читаемости) */
  micro: 'text-xs leading-snug',
  microBold: 'text-xs font-bold leading-snug',
  microCaps: 'text-xs font-black uppercase tracking-wider leading-snug',
  /** 12px — подписи в каталоге, табы */
  label: 'text-xs leading-snug',
  labelBold: 'text-xs font-bold leading-snug',
  labelCaps: 'text-xs font-black uppercase tracking-wider leading-snug',
  /** 14px — минимальный основной текст */
  body: 'text-sm leading-snug',
  bodyBold: 'text-sm font-semibold leading-snug',
  /** 12px — вторичный текст, метки */
  caption: 'text-xs leading-snug',
  captionBold: 'text-xs font-bold leading-snug',
  /** 16px — заголовки экранов */
  title: 'text-2xl font-bold leading-tight tracking-tight',
  /** 20px — hero / continue reading */
  display: 'text-3xl font-bold leading-tight tracking-tight',
  /** Serif — названия книг в списках */
  bookTitle: 'font-serif text-base font-semibold leading-snug',
  /** Serif — hero «Продолжить чтение» */
  bookTitleHero: 'font-serif text-2xl font-bold leading-tight',
  /** Заголовки секций (Недавно, Новинки…) */
  sectionLabel: 'text-lg font-semibold leading-snug tracking-tight',
  /** Числа в статистике профиля */
  statNumber: 'font-serif text-2xl font-bold leading-tight tabular-nums',
} as const;

export const spacing = {
  xs: 'p-1',
  sm: 'p-2',
  md: 'p-3',
  lg: 'p-4',
  xl: 'p-6',
  gapSm: 'gap-2',
  gapMd: 'gap-3',
  gapLg: 'gap-4',
} as const;

export const radii = {
  sm: 'rounded-[var(--app-radius-sm)]',
  md: 'rounded-[var(--app-radius-md)]',
  lg: 'rounded-[var(--app-radius-lg)]',
  /** Buttons/chips — 999px when server radius is «капсулы». */
  button: 'rounded-[var(--app-radius-button)]',
  full: 'rounded-full',
} as const;

/** Minimum touch target 48dp (12 × 4px) */
export const touchMin = 'min-w-12 min-h-12';

export const motion = {
  colors: 'transition-colors duration-200 ease-out',
  press: 'transition-transform duration-150 ease-out active:scale-[0.98]',
  /** Catalog book tile — pairs with .inpx-book-press in index.css */
  bookPress: 'inpx-book-press',
  /** Screen/tab enter — pairs with .inpx-screen-enter in index.css */
  screenEnter: 'inpx-screen-enter',
  segIndicator: 'transition-[transform,width] duration-200 ease-out will-change-transform',
  /** Transform-only enter; pair with animation that never sets opacity:0 */
  enterY: 'transition-transform duration-200 ease-out will-change-transform',
  navIcon: 'transition-transform duration-200 ease-out',
} as const;

export const semantic = {
  success: 'text-[var(--app-success)]',
  successBg: 'bg-[color-mix(in_srgb,var(--app-success)_12%,transparent)] text-[var(--app-success)]',
  warning: 'text-[var(--app-warning)]',
  warningBg: 'bg-[color-mix(in_srgb,var(--app-warning)_12%,transparent)] text-[var(--app-warning)]',
  error: 'text-[var(--app-danger)]',
  errorBg: 'bg-[color-mix(in_srgb,var(--app-danger)_12%,transparent)] text-[var(--app-danger)]',
  offline: 'text-[var(--app-offline)]',
} as const;

export const elevation = {
  card: 'shadow-[var(--app-shadow-sm)]',
  hero: 'shadow-[var(--app-shadow-lg)]',
  sheet: 'shadow-[var(--app-shadow-lg)]',
  menu: 'shadow-[var(--app-shadow-md)]',
} as const;
