import React from 'react';
import { Home } from 'lucide-react';
import { theme } from '../../lib/appTheme';
import IconButton from '../../ui/IconButton';

/** «На главной»: pins a shelf to the home page (same switch as on the web shelves page). */
export default function ShelfHomeToggle({
  name,
  onHome,
  onToggle,
}: {
  name: string;
  onHome: boolean;
  onToggle: () => void;
}) {
  return (
    <IconButton
      label={onHome ? `Убрать «${name}» с главной` : `Показывать «${name}» на главной`}
      aria-pressed={onHome}
      title={onHome ? 'На главной' : 'Показывать на главной'}
      className={`shrink-0 self-center ${onHome ? `${theme.accentText} bg-[var(--app-accent-soft)]` : theme.textMuted}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Home className="w-5 h-5" strokeWidth={onHome ? 2.4 : 1.75} aria-hidden />
    </IconButton>
  );
}
