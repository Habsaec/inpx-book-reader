/** Design tokens — four UI type levels, one sans family (Inter). */

const typeSecondary = 'text-[0.8125rem] leading-[1.125rem]';
const typeBody = 'text-[0.9375rem] leading-[1.375rem]';

export const textStyles = {
  /** Secondary — 13/18 */
  micro: typeSecondary,
  microBold: `${typeSecondary} font-semibold`,
  microCaps: `${typeSecondary} font-semibold uppercase tracking-wide`,
  label: typeSecondary,
  labelBold: `${typeSecondary} font-semibold`,
  labelCaps: `${typeSecondary} font-semibold uppercase tracking-wide`,
  tabLabel: `${typeSecondary} font-medium`,
  caption: typeSecondary,
  captionBold: `${typeSecondary} font-semibold`,
  /** Body — 15/22 */
  body: typeBody,
  bodyBold: `${typeBody} font-semibold`,
  /** Screen title — 28/34, 800 */
  title: 'text-[1.75rem] leading-[2.125rem] font-extrabold tracking-[-0.025em]',
  display: 'text-[1.75rem] leading-[2.125rem] font-extrabold tracking-[-0.025em]',
  /** Book title in tiles and rows — 14/18, 600 */
  bookTitle: 'text-sm leading-[1.125rem] font-semibold min-w-0 max-w-full [overflow-wrap:anywhere]',
  /** Book title on the hero card and book page — 24/30, 800 */
  bookTitleHero: 'text-2xl leading-[1.875rem] font-extrabold tracking-[-0.025em] min-w-0 max-w-full [overflow-wrap:anywhere]',
  /** Section title — 20/26, 800 */
  sectionLabel: 'text-xl leading-[1.625rem] font-extrabold tracking-[-0.02em]',
  statNumber: 'text-[1.75rem] leading-8 font-extrabold tabular-nums',
} as const;

export const spacing = {
  xs: 'p-1',
  sm: 'p-2',
  md: 'p-3',
  lg: 'p-4',
  xl: 'p-5',
  gapSm: 'gap-2',
  gapMd: 'gap-3',
  gapLg: 'gap-4',
  gapXl: 'gap-6',
  shelfY: 'space-y-8',
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
  /** Color shift. Same transition list as press, so the two classes do not override each other. */
  colors: 'inpx-ui-transition',
  press: 'inpx-press',
  /** Catalog book tile — pairs with .inpx-book-press in index.css */
  bookPress: 'inpx-book-press',
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
  card: 'shadow-none',
  hero: 'shadow-none',
  sheet: 'shadow-[var(--app-shadow-md)]',
  menu: 'shadow-[var(--app-shadow-md)]',
} as const;
