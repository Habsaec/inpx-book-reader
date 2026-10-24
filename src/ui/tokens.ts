/** Design tokens — UI text in Inter, titles and book names in Literata. */

const typeSecondary = 'text-[0.8125rem] leading-[1.125rem]';
const typeBody = 'text-base leading-6';

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
  /** Body — 16/24 */
  body: typeBody,
  bodyBold: `${typeBody} font-semibold`,
  /** Screen title — serif 30/38 */
  title: 'font-serif text-[1.875rem] leading-[2.375rem] font-semibold tracking-[-0.01em]',
  display: 'font-serif text-[1.875rem] leading-[2.375rem] font-semibold tracking-[-0.01em]',
  /** Book title in tiles and rows — serif 15/20 */
  bookTitle: 'font-serif text-[0.9375rem] leading-5 font-semibold min-w-0 max-w-full [overflow-wrap:break-word] hyphens-manual',
  /** Book title on the hero card and book page — serif 25/31 */
  bookTitleHero: 'font-serif text-[1.5625rem] leading-[1.9375rem] font-semibold min-w-0 max-w-full [overflow-wrap:break-word] hyphens-manual',
  /** Section title — serif 21/28 */
  sectionLabel: 'font-serif text-[1.3125rem] leading-7 font-semibold',
  statNumber: 'font-serif text-[1.75rem] leading-8 font-semibold tabular-nums',
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
