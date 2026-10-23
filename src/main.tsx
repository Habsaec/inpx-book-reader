import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { UiProviders } from './ui/UiProviders';
import AppErrorBoundary from './ui/AppErrorBoundary';
import './index.css';
import { installStablePress } from './lib/stablePress';
import { installNativeSafeAreaVars } from './lib/safeArea';

installStablePress();
installNativeSafeAreaVars();

/** Chrome 83 parses flex `gap` but lays out without it; the build adds margin fallbacks under this flag. */
{
  const probe = document.createElement('div');
  probe.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
  probe.append(document.createElement('div'), document.createElement('div'));
  document.body.appendChild(probe);
  if (probe.scrollHeight !== 1) document.documentElement.dataset.flexGap = '0';
  probe.remove();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AppErrorBoundary>
        <UiProviders>
          <App />
        </UiProviders>
      </AppErrorBoundary>
    </MotionConfig>
  </StrictMode>,
);
