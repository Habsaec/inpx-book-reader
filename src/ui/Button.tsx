import React from 'react';
import { Loader2 } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { textStyles, touchMin, radii, motion } from './tokens';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: `${theme.accentBg} text-white border-transparent`,
  secondary: `${theme.input} border-[color:var(--app-border)] ${theme.text} hover:bg-[var(--app-surface-hover)] active:bg-[var(--app-card-bg-hover)]`,
  danger: 'bg-[var(--app-danger)] text-white border-transparent hover:brightness-95 active:brightness-90',
  ghost: `${theme.textMuted} border-transparent hover:bg-[var(--app-surface-hover)] active:bg-[var(--app-card-bg-hover)]`,
};

export default function Button({
  variant = 'primary',
  fullWidth,
  loading,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        textStyles.bodyBold,
        touchMin,
        radii.md,
        'inline-flex items-center justify-center gap-2 px-4 py-2.5 border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        motion.colors,
        motion.press,
        theme.focusRing,
        variants[variant],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}
