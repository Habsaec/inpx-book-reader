import React from 'react';
import { theme } from '../../lib/appTheme';
import { textStyles, motion as motionTokens } from '../../ui/tokens';

/** Icon + caption button of the book sheet action row (also the series page row, same order). */
export default function QuickAction({
  label,
  pressed,
  expanded,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex-1 min-w-0 min-h-16 py-3 px-1 flex flex-col items-center justify-center gap-1 ${textStyles.caption} ${
        pressed ? `font-bold ${theme.accentText}` : `font-medium ${theme.text}`
      } ${theme.rowPress} ${theme.focusRing} ${motionTokens.press}`}
    >
      {children}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
