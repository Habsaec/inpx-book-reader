/** Theme utility classes — colors from index.css CSS variables. */
export const theme = {
  bg: 'bg-[var(--app-shell-bg,var(--app-bg))]',
  text: 'text-[var(--app-text)]',
  textMuted: 'text-[var(--app-text-secondary,var(--app-muted))]',
  header: 'bg-[var(--app-topbar-bg)] border-[color:var(--app-topbar-border)]',
  tabBar: 'bg-[var(--app-surface)] border-[color:var(--app-border)]',
  card: 'app-glass bg-[var(--app-card-bg)] border border-[color:var(--app-border)] hover:bg-[var(--app-card-bg-hover)]',
  cardSolid: 'app-glass bg-[var(--app-surface)] border border-[color:var(--app-border)] hover:bg-[var(--app-surface-hover)]',
  cardSecondary: 'app-glass bg-[var(--app-surface)] border border-[color:var(--app-border)]',
  panel: 'app-glass bg-[var(--app-panel-soft)]',
  input:
    'bg-[var(--app-field-bg)] border border-[color:var(--app-border)] text-[var(--app-text)] placeholder:text-[var(--app-placeholder)]',
  inputFocus:
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] focus-visible:ring-offset-1',
  focusRing:
    'focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--app-link)] focus-visible:outline-offset-2',
  touchTarget: 'min-w-12 min-h-12',
  interactive:
    'cursor-pointer inpx-press focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--app-link)] focus-visible:outline-offset-2',
  rowPress:
    'hover:bg-[color-mix(in_srgb,var(--app-text)_5%,transparent)] active:bg-[color-mix(in_srgb,var(--app-text)_9%,transparent)]',
  chipButton: 'hover:bg-[var(--app-surface-hover)] inpx-press',
  accentBg: 'bg-[var(--app-button-bg,var(--app-accent))] hover:bg-[var(--app-button-bg-hover,var(--app-accent-hover))] text-[var(--app-button-fg,white)] border-transparent',
  accentText: 'text-[var(--app-accent)]',
  accentBorder: 'border-[var(--app-accent)] text-[var(--app-accent)]',
  accentActive: 'bg-[var(--app-accent)] text-white border-transparent',
  accentMuted: 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]',
  chip: 'bg-[var(--app-panel-soft)] text-[var(--app-muted)]',
  chipHover: 'hover:bg-[var(--app-surface-hover)]',
  spinner: 'border-[var(--app-accent)] border-t-transparent',
  coverBorder: 'border-[color:var(--app-cover-border)]',
  sheet: 'app-sheet-solid bg-[var(--app-surface)] border-[color:var(--app-border)] text-[var(--app-text)]',
  sheetFooter: 'border-[color:var(--app-border)] bg-[var(--app-surface)]',
  divider: 'border-[color:var(--app-border)]',
  dropdown: 'bg-[var(--app-surface)] border border-[color:var(--app-border)]',
  dropdownItem: 'hover:bg-[var(--app-surface-hover)] border-[color:var(--app-border)]',
  tabActive: 'text-[var(--app-accent)] font-semibold',
  tabInactive: 'text-[var(--app-muted)]',
  segActive: 'text-[var(--app-text)] font-medium',
  segInactive: 'text-[var(--app-muted)] font-medium hover:text-[var(--app-text)]',
  avatarBg: 'bg-[var(--app-panel-soft)]',
  iconBg: 'bg-[var(--app-surface-hover)]',
  progress: 'bg-[var(--app-accent)]',
  ringAccent: 'ring-[var(--app-accent)]',
  logoFallback: 'bg-[var(--app-accent)]',
} as const;

export function applyAppTheme(isDark: boolean) {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
}
