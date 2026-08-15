import React from 'react';

interface TabScreenPanelProps {
  active: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Keeps inactive tabs mounted (hidden) and animates the active tab on switch.
 * Элемент стабилен (без key): снятие/установка класса inpx-screen-enter
 * перезапускает CSS-анимацию без размонтирования поддерева.
 */
export default function TabScreenPanel({ active, children, className = '' }: TabScreenPanelProps) {
  return (
    <div
      className={`flex-1 min-h-0 flex flex-col h-full overflow-hidden ${active ? 'inpx-screen-enter' : 'hidden'} ${className}`}
      aria-hidden={active ? undefined : true}
    >
      {children}
    </div>
  );
}
