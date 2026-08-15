import React, { ReactNode } from 'react';

interface MobileFrameProps {
  children: ReactNode;
}

/** Полноэкранная оболочка Android WebView (safe-area, без десктопного превью). */
export default function MobileFrame({ children }: MobileFrameProps) {
  return (
    <div
      id="app-viewport-container"
      className="fixed inset-0 flex flex-col overflow-hidden bg-[var(--app-shell-bg,var(--app-bg))] text-[var(--app-text)] font-sans"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div id="app-server-bg" aria-hidden />
      <div id="app-server-bg-tint" aria-hidden />
      <div id="mobile-app-content" className="relative z-[1] flex-1 min-h-0 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
