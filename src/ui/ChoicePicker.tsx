import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { theme } from '../lib/appTheme';
import { elevation, motion, radii, textStyles } from './tokens';
import DragSheet from './DragSheet';
import { SheetDragHandle, sheetPanelClass, sheetPanelStyle } from './SheetChrome';
import { useOverlayBackHandler } from '../hooks/useBackHandler';

export type ChoiceOption = { id: string; label: string };

/**
 * App-styled replacement for a native <select>: a compact button that opens a bottom sheet
 * with the options. The WebView's own dropdown looks like a web form and ignores the theme.
 */
export default function ChoicePicker({
  value,
  options,
  onChange,
  title,
  className = '',
  buttonClassName = '',
}: {
  value: string;
  options: ChoiceOption[];
  onChange: (id: string) => void;
  /** Sheet heading and the button's accessible name, e.g. «Сортировка». */
  title: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const titleId = React.useId();
  const current = options.find((option) => option.id === value) ?? options[0];
  useOverlayBackHandler(open, () => setOpen(false));

  return (
    <div className={`inline-flex min-w-0 ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${title}: ${current?.label ?? ''}`}
        onClick={() => setOpen(true)}
        className={`min-w-0 max-w-full min-h-10 inline-flex items-center gap-1.5 px-3 ${radii.sm} ${textStyles.captionBold} ${theme.chip} ${theme.chipHover} ${theme.focusRing} ${motion.press} ${buttonClassName}`}
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
      </button>
      <DragSheet
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={titleId}
        swallowOpeningPointer
        className={`${sheetPanelClass} px-5 pt-2 ${elevation.sheet}`}
      >
        <div style={sheetPanelStyle()}>
          <SheetDragHandle />
          <h2 id={titleId} className={`pt-2 pb-3 ${textStyles.sectionLabel} ${theme.text}`}>{title}</h2>
          <div role="radiogroup" aria-labelledby={titleId} className={`border-t ${theme.divider}`}>
            {options.map((option) => {
              const selected = option.id === current?.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setOpen(false);
                    if (!selected) onChange(option.id);
                  }}
                  className={`w-full min-h-14 flex items-center gap-3 text-left border-b ${theme.divider} ${theme.rowPress} ${theme.focusRing}`}
                >
                  <span className={`flex-1 min-w-0 truncate ${textStyles.body} ${selected ? `font-semibold ${theme.accentText}` : theme.text}`}>
                    {option.label}
                  </span>
                  {selected ? <Check className={`w-5 h-5 shrink-0 ${theme.accentText}`} aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </DragSheet>
    </div>
  );
}
