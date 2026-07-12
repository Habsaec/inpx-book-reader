import React from 'react';
import { theme } from '../lib/appTheme';
import { radii, elevation, motion } from './tokens';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  as?: 'div' | 'button';
}

export default function Card({ children, className = '', onClick, as = 'div' }: CardProps) {
  const base = `${radii.lg} border ${theme.card} ${elevation.card} ${motion.colors} ${className}`;
  if (as === 'button' || onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} w-full text-left ${theme.focusRing} ${motion.press}`}
      >
        {children}
      </button>
    );
  }
  return <div className={base}>{children}</div>;
}
