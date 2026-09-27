import React from 'react';

interface TabScreenPanelProps {
  active: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Inactive tabs stay mounted. No enter motion — tab switches happen constantly. */
export default function TabScreenPanel({ active, children, className = '' }: TabScreenPanelProps) {
  return (
    <div
      className={`flex-1 min-h-0 flex flex-col h-full overflow-hidden ${active ? '' : 'hidden'} ${className}`}
      aria-hidden={active ? undefined : true}
    >
      {children}
    </div>
  );
}
