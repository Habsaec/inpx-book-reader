/** Design tokens — four UI type levels; book titles stay serif. */

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
  /** Screen title — 28/32, 600 */
  title: 'text-[1.75rem] leading-8 font-semibold tracking-tight',
  display: 'text-[1.75rem] leading-8 font-semibold tracking-tight',
  /** Book titles — serif, same sizes as UI section/body */
  bookTitle: 'font-serif text-base font-semibold leading-snug min-w-0 max-w-full [overflow-wrap:anywhere]',
  bookTitleHero: 'font-serif text-xl font-semibold leading-6 tracking-tight min-w-0 max-w-full [overflow-wrap:anywhere]',
  /** Section title — 20/24, 600 */
  sectionLabel: 'text-xl leading-6 font-semibold tracking-tight',
  statNumber: 'text-[1.75rem] leading-8 font-semibold tabular-nums',
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
