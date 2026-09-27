import React from 'react';
import { theme } from '../lib/appTheme';
import { touchMin, radii, motion } from './tokens';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'md' | 'lg';
}

export default function IconButton({
  label,
  size = 'md',
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  const sizeClass = size === 'lg' ? 'w-12 h-12' : touchMin;
  return (
    <button
      type="button"
      aria-label={label}
      className={[
        sizeClass,
        radii.md,
        'inline-flex items-center justify-center cursor-pointer',
        'disabled:opacity-50 disabled:pointer-events-none',
        theme.focusRing,
        motion.press,
        'hover:bg-[var(--app-surface-hover)]',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
