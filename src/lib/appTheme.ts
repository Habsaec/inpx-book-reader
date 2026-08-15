/** Theme utility classes — colors from index.css CSS variables (INPX palette). */
export const theme = {
  bg: 'bg-[var(--app-shell-bg,var(--app-bg))]',
  text: 'text-[var(--app-text)]',
  textMuted: 'text-[var(--app-muted)]',
  header: 'app-glass bg-[var(--app-topbar-bg)] border-[color:var(--app-topbar-border)]',
  card: 'app-glass bg-[var(--app-card-bg)] border border-[color:var(--app-border)] hover:bg-[var(--app-card-bg-hover)]',
  cardSolid: 'app-glass bg-[var(--app-surface)] border border-[color:var(--app-border)] hover:bg-[var(--app-surface-hover)]',
  cardSecondary: 'app-glass bg-[var(--app-surface)] border border-[color:var(--app-border)]',
  panel: 'app-glass bg-[var(--app-panel-soft)] border border-[color:var(--app-border)]',
  input:
    'app-glass bg-[var(--app-field-bg)] border border-[color:var(--app-border)] text-[var(--app-text)] placeholder:text-[var(--app-placeholder)]',
  inputFocus:
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] focus-visible:ring-offset-1',
  focusRing:
    'focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--app-link)] focus-visible:outline-offset-2',
  touchTarget: 'min-w-12 min-h-12',
  interactive:
    'cursor-pointer transition-[colors,transform] duration-200 ease-out focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--app-link)] focus-visible:outline-offset-2 active:scale-[0.98]',
  rowPress:
    'hover:bg-[color-mix(in_srgb,var(--app-text)_5%,transparent)] active:bg-[color-mix(in_srgb,var(--app-text)_9%,transparent)]',
  chipButton:
    'hover:bg-[var(--app-surface-hover)] active:scale-[0.98] transition-[colors,transform] duration-200 ease-out',
  accentBg: 'bg-[var(--app-accent-hover)] hover:bg-[color-mix(in_srgb,var(--app-accent-hover)_88%,#000)] text-white border-transparent',
  accentText: 'text-[var(--app-link)]',
  accentBorder: 'border-[var(--app-link)] text-[var(--app-link)]',
  accentActive: 'bg-[var(--app-accent-hover)] text-white border-transparent',
  accentMuted: 'bg-[var(--app-accent-hover)]/15 text-[var(--app-link)]',
  chip: 'bg-[var(--app-panel-soft)] text-[var(--app-muted)] border border-[color:var(--app-border)]',
  chipHover: 'hover:bg-[var(--app-surface-hover)]',
  spinner: 'border-[var(--app-link)] border-t-transparent',
  coverBorder: 'border-[color:var(--app-cover-border)]',
  sheet: 'app-glass bg-[var(--app-surface)] border-[color:var(--app-border)] text-[var(--app-text)]',
  sheetFooter: 'border-[color:var(--app-border)] bg-[var(--app-surface)]',
  divider: 'border-[color:var(--app-border)]',
  dropdown: 'app-glass bg-[var(--app-surface)] border border-[color:var(--app-border)]',
  dropdownItem: 'hover:bg-[var(--app-surface-hover)] border-[color:var(--app-border)]',
  tabActive: 'text-[var(--app-link)] font-medium',
  tabInactive: 'text-[var(--app-muted)] hover:text-[var(--app-text)]',
  segActive: 'text-[var(--app-link)] font-medium',
  segInactive: 'text-[var(--app-muted)] font-medium hover:text-[var(--app-text)]',
  avatarBg: 'bg-[var(--app-panel-soft)] border border-[color:var(--app-cover-border)]',
  iconBg: 'bg-[var(--app-surface-hover)] border border-[color:var(--app-border)]',
  progress: 'bg-[var(--app-accent-hover)]',
  ringAccent: 'ring-[var(--app-link)]',
  logoFallback: 'bg-[var(--app-accent-hover)]',
} as const;

export function applyAppTheme(isDark: boolean) {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
}
